import type { RequestHandler } from '@sveltejs/kit';
import { json } from '@sveltejs/kit';
import { randomUUID } from 'node:crypto';
import { and, asc, eq, inArray, sql } from 'drizzle-orm';
import { getDb, schema } from '$lib/server/db/client';
import { apiError, getOwnedConversation, handleApiError, requireUser } from '$lib/server/api';
import { isModelAvailable, listAvailableModels } from '$lib/server/ai/model.service';
import { retryMessageInput } from '$lib/server/validation';
import {
	beginConversationTurn,
	releaseConversationTurn,
	runConversationTurn
} from '$lib/server/ai/agent.service';
import { BROWSER_BRIDGE_HEADER } from '$lib/server/browser/bridge';
import { getTurnSkillSnapshot, skillSnapshotToSummary } from '$lib/server/skill-runtime';
import { getProjectConversationTools } from '$lib/server/ai/project-context';
import {
	appendTurnEvent,
	createTurn,
	findTurnByRequest,
	finishTurn,
	recordBrowserAction
} from '$lib/server/ai/turn-events';
import { watchPersistedBrowserResult } from '$lib/server/browser/bridge';

function sse(event: string, data: unknown) {
	return `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`;
}

export const POST: RequestHandler = async (event) => {
	let conversationId: string | undefined;
	let turnToken: string | undefined;
	let durableTurn = false;
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
		const requestId = event.request.headers.get('x-client-request-id');
		if (requestId && !/^[0-9a-f-]{36}$/i.test(requestId))
			return apiError('INVALID_REQUEST_ID', 'Invalid client request ID.');
		const wantsJson = event.request.headers.get('accept')?.includes('application/json') === true;
		if (requestId) {
			const existing = await findTurnByRequest(conversationId, requestId);
			if (existing) return json({ turnId: existing.id, cursor: 0, duplicate: true });
		}
		const turnEnabledTools = getProjectConversationTools(
			conversation.projectId,
			conversation.enabledTools
		);

		turnToken = randomUUID();
		if (!(await beginConversationTurn(conversationId, turnToken))) {
			if (requestId) {
				for (let attempt = 0; attempt < 8; attempt++) {
					const existing = await findTurnByRequest(conversationId, requestId);
					if (existing) return json({ turnId: existing.id, cursor: 0, duplicate: true });
					await new Promise((resolve) => setTimeout(resolve, 25));
				}
			}
			return apiError(
				'CONVERSATION_BUSY',
				'This conversation is already generating a response.',
				409
			);
		}
		if (requestId) {
			const created = await createTurn(conversationId, turnToken, requestId);
			if (created?.id !== turnToken) {
				await releaseConversationTurn(conversationId, turnToken);
				return json({ turnId: created.id, cursor: 0, duplicate: true });
			}
			durableTurn = true;
		}

		const allMessages = await db
			.select()
			.from(schema.messages)
			.where(eq(schema.messages.conversationId, conversationId))
			.orderBy(asc(schema.messages.createdAt));

		const lastUserIndex = allMessages.findLastIndex((m) => m.role === 'user');
		if (lastUserIndex === -1) {
			if (durableTurn) {
				await appendTurnEvent(turnToken, 'error', {
					type: 'error',
					error: { code: 'NO_MESSAGE_TO_RETRY', message: 'No user message to retry.' }
				});
				await finishTurn(turnToken, 'interrupted');
			}
			await releaseConversationTurn(conversationId, turnToken);
			return apiError('NO_MESSAGE_TO_RETRY', 'No user message to retry.', 400);
		}

		const userMessage = allMessages[lastUserIndex];
		if (durableTurn)
			await db
				.update(schema.conversationTurns)
				.set({ userMessageId: userMessage.id })
				.where(eq(schema.conversationTurns.id, turnToken));

		// The model is resolved before anything touches the existing messages: a
		// regenerate that cannot run must leave the conversation exactly as it was.
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
				if (durableTurn) {
					await appendTurnEvent(turnToken, 'error', {
						type: 'error',
						error: { code: 'MODEL_NOT_AVAILABLE', message: 'No configured models are available.' }
					});
					await finishTurn(turnToken, 'interrupted');
				}
				await releaseConversationTurn(conversationId, turnToken);
				return apiError('MODEL_NOT_AVAILABLE', 'No configured models are available.');
			}
		} else if (parsedModel && parsedModel !== conversation.model) {
			await db
				.update(schema.conversations)
				.set({ model: parsedModel, updatedAt: new Date() })
				.where(eq(schema.conversations.id, conversationId));
		}

		// Keep the previous answer visible until a replacement finishes. The turn
		// excludes these rows from model context without changing their saved state.
		const trailingIds = allMessages.slice(lastUserIndex + 1).map((m) => m.id);

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
		const attachmentPayload = attachmentRecords.map((attachment) => ({
			...attachment,
			url: `/api/conversations/${conversationId}/attachments/${attachment.id}`
		}));

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
		const streamTurnToken = turnToken;

		const encoder = new TextEncoder();
		let controller: ReadableStreamDefaultController<Uint8Array> | undefined;
		const stream = new ReadableStream<Uint8Array>({
			start(c) {
				controller = c;
			},
			cancel() {
				controller = undefined;
			}
		});
		if (wantsJson) controller = undefined;
		let eventWrites = Promise.resolve();
		const send = (eventType: string, data: unknown) => {
			const payload =
				durableTurn && eventType === 'browser.request' && data && typeof data === 'object'
					? { ...data, turnId: streamTurnToken }
					: data;
			if (durableTurn)
				eventWrites = eventWrites
					.then(async () => {
						if (eventType === 'browser.request' && payload && typeof payload === 'object') {
							const action = payload as { requestId: string; token: string };
							await recordBrowserAction({
								requestId: action.requestId,
								token: action.token,
								turnId: streamTurnToken,
								userId: user.id
							});
							watchPersistedBrowserResult(action.requestId);
						}
						await appendTurnEvent(streamTurnToken, eventType, payload);
					})
					.then(() => {});
			if (!controller) return;
			try {
				controller.enqueue(encoder.encode(sse(eventType, payload)));
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
					skill: skillSnapshotToSummary(getTurnSkillSnapshot(userMessage, conversation)),
					attachments: attachmentPayload
				});
				const replacementId = await runConversationTurn(
					conversationId,
					modelToUse,
					prompt,
					(e) => send(e.type, e),
					user.id,
					userMessage.id,
					streamTurnToken,
					browserBridgeEnabled,
					turnEnabledTools,
					trailingIds
				);
				if (replacementId && trailingIds.length > 0) {
					await db
						.update(schema.messages)
						.set({ turnState: 'superseded' })
						.where(
							and(
								eq(schema.messages.conversationId, conversationId),
								inArray(schema.messages.id, trailingIds)
							)
						);
					send('retry.replaced', { type: 'retry.replaced', messageIds: trailingIds });
				}
				if (replacementId && schema.conversations.historyRevision)
					await db
						.update(schema.conversations)
						.set({
							historyRevision: sql`${schema.conversations.historyRevision} + 1`,
							updatedAt: new Date()
						})
						.where(eq(schema.conversations.id, conversationId));
				send('done', { type: 'done' });
				await eventWrites;
				if (durableTurn) await finishTurn(streamTurnToken, 'complete');
			} catch (error) {
				const code = error instanceof Error ? error.message : 'INTERNAL_ERROR';
				const message =
					code === 'PDF_VISION_MODEL_UNSUPPORTED'
						? 'This PDF has no extractable text. Choose a vision-capable model to analyze its rendered pages.'
						: code === 'PDF_PASSWORD_REQUIRED'
							? 'This PDF is password-protected. Unlock it and attach it again before sending.'
							: code === 'PDF_VISION_RENDER_FAILED'
								? 'The PDF text could not be extracted and its pages could not be rendered for visual analysis.'
								: code === 'INVALID_PDF'
									? 'This PDF is invalid or corrupted and could not be analyzed.'
									: code === 'IMAGE_VISION_MODEL_UNSUPPORTED'
										? 'This image needs a vision-capable model. Pick a model that accepts images and resend.'
										: code === 'IMAGE_VISION_IMAGE_TOO_LARGE'
											? 'That image is too large to send (limit 8 MB).'
											: code === 'INVALID_IMAGE'
												? 'That image is invalid or corrupted.'
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
				await eventWrites.catch(() => {});
				if (durableTurn) await finishTurn(streamTurnToken, 'interrupted');
			} finally {
				await releaseConversationTurn(conversationId, turnToken);
				close();
			}
		})();

		if (wantsJson) return json({ turnId: turnToken, cursor: 0 }, { status: 202 });
		return new Response(stream, {
			headers: {
				'X-Mimin-Turn-Id': turnToken,
				'Content-Type': 'text/event-stream',
				'Cache-Control': 'no-cache, no-transform',
				Connection: 'keep-alive'
			}
		});
	} catch (error) {
		if (durableTurn && turnToken) await finishTurn(turnToken, 'interrupted').catch(() => {});
		if (conversationId && turnToken) await releaseConversationTurn(conversationId, turnToken);
		return handleApiError(error);
	}
};
