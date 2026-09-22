import type { RequestHandler } from '@sveltejs/kit';
import { json } from '@sveltejs/kit';
import { randomUUID } from 'node:crypto';
import { eq, sql } from 'drizzle-orm';
import { getDb, schema } from '$lib/server/db/client';
import { apiError, getOwnedConversation, handleApiError, requireUser } from '$lib/server/api';
import { isModelAvailable, listAvailableModels } from '$lib/server/ai/model.service';
import { attachmentMessageInput, messageInput } from '$lib/server/validation';
import {
	beginConversationTurn,
	releaseConversationTurn,
	runConversationTurn
} from '$lib/server/ai/agent.service';
import { BROWSER_BRIDGE_HEADER } from '$lib/server/browser/bridge';
import {
	cleanupStoredFiles,
	extractUploadedFile,
	MAX_FILE_SIZE,
	saveUploadedFile
} from '$lib/server/files/storage';
import {
	getConversationSkillSnapshot,
	getConversationSkillSummary
} from '$lib/server/skill-runtime';
import { getProjectConversationTools } from '$lib/server/ai/project-context';
import {
	appendTurnEvent,
	createTurn,
	findTurnByRequest,
	finishTurn,
	recordBrowserAction
} from '$lib/server/ai/turn-events';
import { isConversationTurnCanceled } from '$lib/server/ai/turn-registry';
import { watchPersistedBrowserResult } from '$lib/server/browser/bridge';

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
	let durableTurn = false;
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
		const requestId = event.request.headers.get('x-client-request-id');
		if (requestId && !/^[0-9a-f-]{36}$/i.test(requestId))
			return apiError('INVALID_REQUEST_ID', 'Invalid client request ID.');
		const wantsJson = event.request.headers.get('accept')?.includes('application/json') === true;
		if (requestId) {
			const existing = await findTurnByRequest(conversationId, requestId);
			if (existing) return json({ turnId: existing.id, cursor: 0, duplicate: true });
		}
		// Capture tool settings before the async stream starts. A skill switch
		// made while this turn is generating applies only to the next turn.
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
		}

		const savedAttachments = [];
		for (const file of files) {
			// Chat attachments accept images; the shared upload path does not.
			const extraction = await extractUploadedFile(file, { images: true });
			const saved = await saveUploadedFile(conversationId, file, { images: true });
			savedAttachments.push({ ...saved, ...extraction });
			uploadedKeys.push(saved.storageKey);
		}
		const [userMessage] = await db
			.insert(schema.messages)
			.values({
				conversationId,
				role: 'user',
				content: parsed.data.content,
				skillSnapshot: getConversationSkillSnapshot(conversation)
			})
			.returning();
		messageIdForCleanup = userMessage.id;
		if (durableTurn)
			await db
				.update(schema.conversationTurns)
				.set({ userMessageId: userMessage.id })
				.where(eq(schema.conversationTurns.id, turnToken));
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
		// A message becomes part of the visible transcript once its attachments
		// have been persisted. Keep this conditional for older test doubles and
		// staged databases while the history_revision migration is rolling out.
		if (schema.conversations.historyRevision)
			await db
				.update(schema.conversations)
				.set({
					historyRevision: sql`${schema.conversations.historyRevision} + 1`,
					updatedAt: new Date()
				})
				.where(eq(schema.conversations.id, conversationId));
		const attachmentPayload = attachmentRecords.map((attachment) => ({
			...attachment,
			url: `/api/conversations/${conversationId}/attachments/${attachment.id}`
		}));
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
		const send = (event: string, data: unknown) => {
			const payload =
				durableTurn && event === 'browser.request' && data && typeof data === 'object'
					? { ...data, turnId: streamTurnToken }
					: data;
			if (durableTurn && event !== 'ping')
				eventWrites = eventWrites
					.then(async () => {
						if (event === 'browser.request' && payload && typeof payload === 'object') {
							const action = payload as { requestId: string; token: string };
							await recordBrowserAction({
								requestId: action.requestId,
								token: action.token,
								turnId: streamTurnToken,
								userId: user.id
							});
							watchPersistedBrowserResult(action.requestId);
						}
						await appendTurnEvent(streamTurnToken, event, payload);
					})
					.then(() => {});
			if (!controller) return;
			try {
				controller.enqueue(encoder.encode(sse(event, payload)));
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
					skill: getConversationSkillSummary(conversation),
					attachments: attachmentPayload
				});
				await runConversationTurn(
					conversationId,
					modelToUse,
					parsed.data.content,
					(event) => send(event.type, event),
					user.id,
					userMessage.id,
					streamTurnToken,
					browserBridgeEnabled,
					turnEnabledTools
				);
				send('done', { type: 'done' });
				await eventWrites;
				if (durableTurn)
					await finishTurn(
						streamTurnToken,
						isConversationTurnCanceled(streamTurnToken) ? 'stopped' : 'complete'
					);
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
				if (durableTurn)
					await finishTurn(
						streamTurnToken,
						isConversationTurnCanceled(streamTurnToken) ? 'stopped' : 'interrupted'
					);
			} finally {
				clearInterval(heartbeatTimer);
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
		if (uploadedKeys.length) await cleanupStoredFiles(uploadedKeys);
		if (messageIdForCleanup)
			await getDb()
				.delete(schema.messages)
				.where(eq(schema.messages.id, messageIdForCleanup))
				.catch(() => {});
		if (
			error instanceof Error &&
			['UNSUPPORTED_FILE', 'FILE_TOO_LARGE', 'INVALID_PDF', 'INVALID_IMAGE'].includes(error.message)
		)
			return apiError(
				error.message,
				error.message === 'FILE_TOO_LARGE'
					? 'Each attachment must be 25 MB or smaller.'
					: error.message === 'INVALID_PDF'
						? 'The file does not contain a valid PDF header.'
						: error.message === 'INVALID_IMAGE'
							? 'The file does not contain a valid image.'
							: 'File type is not supported.',
				400
			);
		return handleApiError(error);
	}
};
