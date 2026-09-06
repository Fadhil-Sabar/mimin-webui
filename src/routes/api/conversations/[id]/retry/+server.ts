import type { RequestHandler } from '@sveltejs/kit';
import { randomUUID } from 'node:crypto';
import { asc, eq } from 'drizzle-orm';
import { getDb, schema } from '$lib/server/db/client';
import { apiError, getOwnedConversation, handleApiError, requireUser } from '$lib/server/api';
import { isModelAvailable, listAvailableModels } from '$lib/server/ai/model.service';
import { retryMessageInput } from '$lib/server/validation';
import {
	beginConversationTurn,
	releaseConversationTurn,
	runConversationTurn,
	stopConversation
} from '$lib/server/ai/agent.service';
import { BROWSER_BRIDGE_HEADER } from '$lib/server/browser/bridge';

function sse(event: string, data: unknown) {
	return `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`;
}

export const POST: RequestHandler = async (event) => {
	let conversationId: string | undefined;
	let turnToken: string | undefined;
	try {
		const user = await requireUser(event);
		if (!user) return apiError('UNAUTHORIZED', 'Authentication required.', 401);
		conversationId = event.params.id;
		if (!conversationId) return apiError('CONVERSATION_NOT_FOUND', 'Conversation not found.', 404);

		let parsedModel: string | undefined;
		const contentType = event.request.headers.get('content-type');
		if (contentType?.includes('application/json')) {
			const body = await event.request.json().catch(() => ({}));
			const result = retryMessageInput.safeParse(body);
			if (result.success) parsedModel = result.data.model;
		}

		const db = getDb();
		const conversation = await getOwnedConversation(conversationId, user.id);
		if (!conversation) return apiError('CONVERSATION_NOT_FOUND', 'Conversation not found.', 404);

		turnToken = randomUUID();
		if (!beginConversationTurn(conversationId, turnToken))
			return apiError(
				'CONVERSATION_BUSY',
				'This conversation is already generating a response.',
				409
			);

		const allMessages = await db
			.select()
			.from(schema.messages)
			.where(eq(schema.messages.conversationId, conversationId))
			.orderBy(asc(schema.messages.createdAt));

		const lastUserIndex = allMessages.findLastIndex((m) => m.role === 'user');
		if (lastUserIndex === -1) {
			releaseConversationTurn(conversationId, turnToken);
			return apiError('NO_MESSAGE_TO_RETRY', 'No user message to retry.', 400);
		}

		const userMessage = allMessages[lastUserIndex];

		// Clean up any trailing messages (e.g. failed/partial assistant messages) following this user message
		const trailingMessages = allMessages.slice(lastUserIndex + 1);
		for (const trailing of trailingMessages) {
			await db
				.delete(schema.messages)
				.where(eq(schema.messages.id, trailing.id))
				.catch(() => {});
		}

		let modelToUse = parsedModel ?? conversation.model;
		if (!(await isModelAvailable(user.id, modelToUse))) {
			const available = await listAvailableModels(user.id);
			if (available.length > 0) {
				const preferred = available.find((m) => `${m.provider}/${m.id}` === 'openai/gpt-4o-mini');
				const fallback = preferred ?? available[0];
				modelToUse = `${fallback.provider}/${fallback.id}`;
				await db
					.update(schema.conversations)
					.set({ model: modelToUse, updatedAt: new Date() })
					.where(eq(schema.conversations.id, conversationId));
			} else {
				releaseConversationTurn(conversationId, turnToken);
				return apiError('MODEL_NOT_AVAILABLE', 'No configured models are available.');
			}
		} else if (parsedModel && parsedModel !== conversation.model) {
			await db
				.update(schema.conversations)
				.set({ model: parsedModel, updatedAt: new Date() })
				.where(eq(schema.conversations.id, conversationId));
		}

		const attachmentRecords = await db
			.select({
				id: schema.messageAttachments.id,
				filename: schema.messageAttachments.filename,
				mimeType: schema.messageAttachments.mimeType,
				sizeBytes: schema.messageAttachments.sizeBytes,
				extractionStatus: schema.messageAttachments.extractionStatus,
				pageCount: schema.messageAttachments.pageCount,
				extractionError: schema.messageAttachments.extractionError
			})
			.from(schema.messageAttachments)
			.where(eq(schema.messageAttachments.messageId, userMessage.id));

		const prompt =
			typeof userMessage.content === 'string'
				? userMessage.content
				: Array.isArray(userMessage.content)
					? userMessage.content
							.filter(
								(p: unknown) =>
									typeof p === 'string' ||
									(p &&
										typeof p === 'object' &&
										'type' in p &&
										(p as { type?: string }).type !== 'thinking')
							)
							.map((p: unknown) =>
								typeof p === 'string' ? p : ((p as { text?: string })?.text ?? '')
							)
							.join('')
					: '';

		const browserBridgeEnabled = event.request.headers.get(BROWSER_BRIDGE_HEADER) === '1';
		const streamConversationId = conversationId;
		const streamTurnToken = turnToken;

		const encoder = new TextEncoder();
		let controller: ReadableStreamDefaultController<Uint8Array> | undefined;
		const stream = new ReadableStream<Uint8Array>({
			start(c) {
				controller = c;
			},
			cancel() {
				controller = undefined;
				stopConversation(streamConversationId, streamTurnToken);
			}
		});
		const send = (eventType: string, data: unknown) => {
			if (!controller) return;
			try {
				controller.enqueue(encoder.encode(sse(eventType, data)));
			} catch {
				/* stream closed */
			}
		};
		const close = () => {
			if (controller) {
				try {
					controller.close();
				} catch {
					/* already closed */
				}
				controller = undefined;
			}
		};

		void (async () => {
			try {
				send('message.start', {
					type: 'message.start',
					messageId: userMessage.id,
					role: 'user',
					content: prompt,
					attachments: attachmentRecords
				});
				await runConversationTurn(
					conversationId,
					modelToUse,
					prompt,
					(e) => send(e.type, e),
					user.id,
					userMessage.id,
					streamTurnToken,
					browserBridgeEnabled
				);
				send('done', { type: 'done' });
			} catch (error) {
				const code = error instanceof Error ? error.message : 'INTERNAL_ERROR';
				const message =
					code === 'BROWSER_BRIDGE_REQUIRED'
						? 'Browser access was explicitly requested, but Mimin Browser Bridge is not connected. Enable or install it from Settings > Browser Extension, then try again.'
						: code === 'PDF_VISION_MODEL_UNSUPPORTED'
							? 'This PDF has no extractable text. Choose a vision-capable model to analyze its rendered pages.'
							: code === 'PDF_PASSWORD_REQUIRED'
								? 'This PDF is password-protected. Unlock it and attach it again before sending.'
								: code === 'PDF_VISION_RENDER_FAILED'
									? 'The PDF text could not be extracted and its pages could not be rendered for visual analysis.'
									: code === 'INVALID_PDF'
										? 'This PDF is invalid or corrupted and could not be analyzed.'
										: code === 'MODEL_NOT_AVAILABLE'
											? 'Selected model is not available.'
											: code === 'PROVIDER_NOT_CONFIGURED'
												? 'This provider is not configured on the server.'
												: code === 'CONVERSATION_NOT_FOUND'
													? 'Conversation not found.'
													: error instanceof Error
														? error.message
														: 'The agent could not complete this turn.';
				send('error', { type: 'error', error: { code, message } });
			} finally {
				releaseConversationTurn(conversationId, turnToken);
				close();
			}
		})();

		return new Response(stream, {
			headers: {
				'Content-Type': 'text/event-stream',
				'Cache-Control': 'no-cache, no-transform',
				Connection: 'keep-alive'
			}
		});
	} catch (error) {
		if (conversationId && turnToken) releaseConversationTurn(conversationId, turnToken);
		return handleApiError(error);
	}
};
