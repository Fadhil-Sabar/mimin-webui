import type { RequestHandler } from '@sveltejs/kit';
import { randomUUID } from 'node:crypto';
import { eq } from 'drizzle-orm';
import { getDb, schema } from '$lib/server/db/client';
import { apiError, getOwnedConversation, handleApiError, requireUser } from '$lib/server/api';
import { isModelAvailable, listAvailableModels } from '$lib/server/ai/model.service';
import { attachmentMessageInput, messageInput } from '$lib/server/validation';
import {
	beginConversationTurn,
	releaseConversationTurn,
	runConversationTurn,
	stopConversation
} from '$lib/server/ai/agent.service';
import { BROWSER_BRIDGE_HEADER } from '$lib/server/browser/bridge';
import {
	cleanupStoredFiles,
	extractUploadedFile,
	MAX_FILE_SIZE,
	saveUploadedFile
} from '$lib/server/files/storage';

const MAX_ATTACHMENTS = 5;
const MAX_ATTACHMENT_BYTES = 25 * 1024 * 1024;

function sse(event: string, data: unknown) {
	return `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`;
}

export const POST: RequestHandler = async (event) => {
	const uploadedKeys: string[] = [];
	let messageIdForCleanup: string | undefined;
	let conversationId: string | undefined;
	let turnToken: string | undefined;
	try {
		const user = await requireUser(event);
		if (!user) return apiError('UNAUTHORIZED', 'Authentication required.', 401);
		conversationId = event.params.id;
		if (!conversationId) return apiError('CONVERSATION_NOT_FOUND', 'Conversation not found.', 404);
		const isMultipart = event.request.headers.get('content-type')?.includes('multipart/form-data');
		const browserBridgeEnabled = event.request.headers.get(BROWSER_BRIDGE_HEADER) === '1';
		let parsed: { data: { content: string; model?: string } };
		let files: File[] = [];
		if (isMultipart) {
			const form = await event.request.formData();
			const contentValue = form.get('content');
			const modelValue = form.get('model');
			const rawFiles = [...form.getAll('files'), ...form.getAll('file')];
			if (rawFiles.some((value) => !(value instanceof File)))
				return apiError('INVALID_INPUT', 'Attachments must be files.');
			files = rawFiles as File[];
			const result = attachmentMessageInput.safeParse({
				content: typeof contentValue === 'string' ? contentValue : '',
				model: typeof modelValue === 'string' ? modelValue : undefined
			});
			if (!result.success || (!result.data.content && files.length === 0))
				return apiError('INVALID_INPUT', 'Message content or an attachment is required.');
			parsed = result;
		} else {
			const result = messageInput.safeParse(await event.request.json());
			if (!result.success) return apiError('INVALID_INPUT', 'Message content is required.');
			parsed = result;
		}
		if (files.length > MAX_ATTACHMENTS)
			return apiError('TOO_MANY_ATTACHMENTS', `Attach up to ${MAX_ATTACHMENTS} files per message.`);
		if (files.some((file) => file.size > MAX_FILE_SIZE))
			return apiError('FILE_TOO_LARGE', 'Each attachment must be 25 MB or smaller.');
		if (files.reduce((total, file) => total + file.size, 0) > MAX_ATTACHMENT_BYTES)
			return apiError('ATTACHMENTS_TOO_LARGE', 'Attachments must total 25 MB or less.');
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

		let modelToUse = parsed.data.model ?? conversation.model;
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
		}

		const savedAttachments = [];
		for (const file of files) {
			const extraction = await extractUploadedFile(file);
			const saved = await saveUploadedFile(conversationId, file);
			savedAttachments.push({ ...saved, ...extraction });
			uploadedKeys.push(saved.storageKey);
		}
		const [userMessage] = await db
			.insert(schema.messages)
			.values({ conversationId, role: 'user', content: parsed.data.content })
			.returning();
		messageIdForCleanup = userMessage.id;
		if (conversation.projectId)
			await db
				.update(schema.projects)
				.set({ updatedAt: new Date() })
				.where(eq(schema.projects.id, conversation.projectId));
		const attachmentRecords = savedAttachments.length
			? await db
					.insert(schema.messageAttachments)
					.values(savedAttachments.map((file) => ({ messageId: userMessage.id, ...file })))
					.returning({
						id: schema.messageAttachments.id,
						filename: schema.messageAttachments.filename,
						mimeType: schema.messageAttachments.mimeType,
						sizeBytes: schema.messageAttachments.sizeBytes,
						extractionStatus: schema.messageAttachments.extractionStatus,
						pageCount: schema.messageAttachments.pageCount,
						extractionError: schema.messageAttachments.extractionError
					})
			: [];
		if (conversation.title === 'New conversation')
			await db
				.update(schema.conversations)
				.set({
					title: (
						parsed.data.content ||
						attachmentRecords[0]?.filename ||
						'New conversation'
					).slice(0, 60),
					updatedAt: new Date()
				})
				.where(eq(schema.conversations.id, conversationId));
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
		const send = (event: string, data: unknown) => {
			if (!controller) return;
			try {
				controller.enqueue(encoder.encode(sse(event, data)));
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

		const heartbeatTimer = setInterval(() => {
			send('ping', { type: 'ping' });
		}, 15_000);

		void (async () => {
			try {
				send('message.start', {
					type: 'message.start',
					messageId: userMessage.id,
					role: 'user',
					content: parsed.data.content,
					attachments: attachmentRecords
				});
				await runConversationTurn(
					conversationId,
					modelToUse,
					parsed.data.content,
					(event) => send(event.type, event),
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
				clearInterval(heartbeatTimer);
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
		if (uploadedKeys.length) await cleanupStoredFiles(uploadedKeys);
		if (messageIdForCleanup)
			await getDb()
				.delete(schema.messages)
				.where(eq(schema.messages.id, messageIdForCleanup))
				.catch(() => {});
		if (
			error instanceof Error &&
			['UNSUPPORTED_FILE', 'FILE_TOO_LARGE', 'INVALID_PDF'].includes(error.message)
		)
			return apiError(
				error.message,
				error.message === 'FILE_TOO_LARGE'
					? 'Each attachment must be 25 MB or smaller.'
					: error.message === 'INVALID_PDF'
						? 'The file does not contain a valid PDF header.'
						: 'File type is not supported.',
				400
			);
		return handleApiError(error);
	}
};
