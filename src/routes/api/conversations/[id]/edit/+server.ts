import { json } from '@sveltejs/kit';
import type { RequestHandler } from '@sveltejs/kit';
import { randomUUID } from 'node:crypto';
import { and, asc, eq, inArray, ne, sql } from 'drizzle-orm';
import { getDb, schema } from '$lib/server/db/client';
import { apiError, getOwnedConversation, handleApiError, requireUser } from '$lib/server/api';
import {
	hasActiveConversationTurn,
	runConversationTurn,
	releaseConversationTurn,
	beginConversationTurn
} from '$lib/server/ai/agent.service';
import { isModelAvailable, listAvailableModels } from '$lib/server/ai/model.service';
import { BROWSER_BRIDGE_HEADER } from '$lib/server/browser/bridge';
import { editMessageInput } from '$lib/server/validation';
import { getProjectConversationTools } from '$lib/server/ai/project-context';
import { getTurnSkillSnapshot, skillSnapshotToSummary } from '$lib/server/skill-runtime';
import {
	appendTurnEvent,
	createTurn,
	findTurnByRequest,
	finishTurn,
	recordBrowserAction
} from '$lib/server/ai/turn-events';
import { isConversationTurnCanceled } from '$lib/server/ai/turn-registry';
import { watchPersistedBrowserResult } from '$lib/server/browser/bridge';

function sse(event: string, data: unknown) {
	return `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`;
}

type Database = ReturnType<typeof getDb>;

/** Keep the route usable with the small database fakes used by unit tests. */
async function inTransaction<T>(db: Database, work: (tx: Database) => Promise<T>): Promise<T> {
	const transaction = (db as unknown as { transaction?: unknown }).transaction;
	if (typeof transaction !== 'function') return work(db);
	// Extracting the method loses its `this`, and drizzle's transaction reads
	// `this.session`; call it back against the db instance.
	return (transaction as (callback: (tx: Database) => Promise<T>) => Promise<T>).call(db, (tx) =>
		work(tx)
	);
}

export const POST: RequestHandler = async (event) => {
	let conversationId: string | undefined;
	let turnToken: string | undefined;
	try {
		const user = await requireUser(event);
		if (!user) return apiError('UNAUTHORIZED', 'Authentication required.', 401);
		conversationId = event.params.id;
		if (!conversationId) return apiError('CONVERSATION_NOT_FOUND', 'Conversation not found.', 404);
		const conversationKey = conversationId;

		const rawBody = await event.request.json().catch(() => null);
		const parsed = editMessageInput.safeParse(
			rawBody && typeof rawBody === 'object' && !Array.isArray(rawBody)
				? {
						...rawBody,
						historyRevision:
							(rawBody as { historyRevision?: unknown; revision?: unknown }).historyRevision ??
							(rawBody as { revision?: unknown }).revision
					}
				: rawBody
		);
		if (!parsed.success)
			return apiError('INVALID_INPUT', 'messageId, content, and historyRevision are required.');

		const db = getDb();
		const conversation = await getOwnedConversation(conversationId, user.id);
		if (!conversation) return apiError('CONVERSATION_NOT_FOUND', 'Conversation not found.', 404);
		const requestId = event.request.headers.get('x-client-request-id');
		if (requestId && !/^[0-9a-f-]{36}$/i.test(requestId))
			return apiError('INVALID_REQUEST_ID', 'Invalid client request ID.');
		const wantsJson = event.request.headers.get('accept')?.includes('application/json') === true;
		// Idempotency must be checked before the revision guard: a retry of an
		// accepted edit naturally carries the now older revision.
		if (requestId) {
			const existing = await findTurnByRequest(conversationId, requestId);
			if (existing) return json({ turnId: existing.id, cursor: 0, duplicate: true });
		}
		if (await hasActiveConversationTurn(conversationId))
			return apiError(
				'CONVERSATION_BUSY',
				'This conversation is already generating a response.',
				409
			);
		if (conversation.historyRevision !== parsed.data.historyRevision)
			return apiError('HISTORY_STALE', 'The conversation changed. Reload it before editing.', 409);

		const visibleMessages = await db
			.select()
			.from(schema.messages)
			.where(
				and(
					eq(schema.messages.conversationId, conversationId),
					ne(schema.messages.turnState, 'superseded')
				)
			)
			.orderBy(asc(schema.messages.createdAt), asc(schema.messages.id));
		const target = visibleMessages.find((message) => message.id === parsed.data.messageId);
		if (!target || target.role !== 'user')
			return apiError(
				'MESSAGE_NOT_FOUND',
				'That user message is not part of this conversation.',
				404
			);
		const targetIndex = visibleMessages.findIndex((message) => message.id === target.id);
		const replacedIds = visibleMessages.slice(targetIndex).map((message) => message.id);

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
		let durableTurn = false;
		if (requestId) {
			const created = await createTurn(conversationId, turnToken, requestId);
			if (created?.id !== turnToken) {
				await releaseConversationTurn(conversationId, turnToken);
				return json({ turnId: created?.id, cursor: 0, duplicate: true });
			}
			durableTurn = true;
		}

		let modelToUse = parsed.data.model ?? conversation.model;
		if (!(await isModelAvailable(user.id, modelToUse))) {
			const available = await listAvailableModels(user.id);
			if (!available.length) {
				if (durableTurn) await finishTurn(turnToken, 'interrupted').catch(() => {});
				await releaseConversationTurn(conversationId, turnToken);
				return apiError('MODEL_NOT_AVAILABLE', 'No configured models are available.');
			}
			const preferred = available.find(
				(model) => `${model.provider}/${model.id}` === 'openai/gpt-4o-mini'
			);
			modelToUse = `${(preferred ?? available[0]).provider}/${(preferred ?? available[0]).id}`;
		}

		const attachmentRows = await db
			.select()
			.from(schema.messageAttachments)
			.where(eq(schema.messageAttachments.messageId, target.id));

		let replacementId: string;
		let nextRevision: number;
		try {
			const result = await inTransaction(db, async (tx) => {
				const [updatedConversation] = await tx
					.update(schema.conversations)
					.set({
						historyRevision: sql`${schema.conversations.historyRevision} + 1`,
						updatedAt: new Date(),
						...(modelToUse !== conversation.model ? { model: modelToUse } : {})
					})
					.where(
						and(
							eq(schema.conversations.id, conversationKey),
							eq(schema.conversations.historyRevision, parsed.data.historyRevision)
						)
					)
					.returning({ historyRevision: schema.conversations.historyRevision });
				if (!updatedConversation) throw new Error('HISTORY_STALE');

				await tx
					.update(schema.messages)
					.set({ turnState: 'superseded' })
					.where(
						and(
							eq(schema.messages.conversationId, conversationKey),
							inArray(schema.messages.id, replacedIds)
						)
					);
				const [replacement] = await tx
					.insert(schema.messages)
					.values({
						conversationId: conversationKey,
						role: 'user',
						content: parsed.data.content,
						skillSnapshot: target.skillSnapshot
					})
					.returning({ id: schema.messages.id });
				if (!replacement) throw new Error('REPLACEMENT_NOT_CREATED');
				if (attachmentRows.length) {
					await tx.insert(schema.messageAttachments).values(
						attachmentRows.map((attachment) => ({
							messageId: replacement.id,
							filename: attachment.filename,
							mimeType: attachment.mimeType,
							sizeBytes: attachment.sizeBytes,
							storageKey: attachment.storageKey,
							extractedText: attachment.extractedText,
							extractionStatus: attachment.extractionStatus,
							pageCount: attachment.pageCount,
							extractionError: attachment.extractionError
						}))
					);
				}
				return { id: replacement.id, revision: updatedConversation.historyRevision };
			});
			replacementId = result.id;
			nextRevision = result.revision;
			if (durableTurn)
				await db
					.update(schema.conversationTurns)
					.set({ userMessageId: replacementId })
					.where(eq(schema.conversationTurns.id, turnToken));
		} catch (error) {
			await releaseConversationTurn(conversationId, turnToken);
			if (error instanceof Error && error.message === 'HISTORY_STALE')
				return apiError(
					'HISTORY_STALE',
					'The conversation changed. Reload it before editing.',
					409
				);
			throw error;
		}

		const replacementAttachments = attachmentRows.length
			? await db
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
					.where(eq(schema.messageAttachments.messageId, replacementId))
			: [];
		const attachmentPayload = (
			replacementAttachments.length ? replacementAttachments : attachmentRows
		).map((attachment) => ({
			id: attachment.id,
			filename: attachment.filename,
			mimeType: attachment.mimeType,
			sizeBytes: attachment.sizeBytes,
			extractionStatus: attachment.extractionStatus,
			pageCount: attachment.pageCount,
			extractionError: attachment.extractionError,
			url: `/api/conversations/${conversationId}/attachments/${attachment.id}`
		}));
		const bridgeEnabled = event.request.headers.get(BROWSER_BRIDGE_HEADER) === '1';
		const streamTurnToken = turnToken;
		const encoder = new TextEncoder();
		let controller: ReadableStreamDefaultController<Uint8Array> | undefined;
		const stream = new ReadableStream<Uint8Array>({
			start(current) {
				controller = current;
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
				/* reader detached */
			}
		};
		const close = () => {
			if (!controller) return;
			try {
				controller.close();
			} catch {
				/* already closed */
			}
			controller = undefined;
		};
		void (async () => {
			try {
				send('message.start', {
					type: 'message.start',
					messageId: replacementId,
					role: 'user',
					content: parsed.data.content,
					skill: skillSnapshotToSummary(getTurnSkillSnapshot(target, conversation)),
					attachments: attachmentPayload,
					historyRevision: nextRevision
				});
				await runConversationTurn(
					conversationId,
					modelToUse,
					parsed.data.content,
					(event) => send(event.type, event),
					user.id,
					replacementId,
					streamTurnToken,
					bridgeEnabled,
					getProjectConversationTools(conversation.projectId, conversation.enabledTools),
					replacedIds
				);
				send('edit.replaced', { type: 'edit.replaced', messageIds: replacedIds });
				send('done', { type: 'done' });
				await eventWrites;
				if (durableTurn)
					await finishTurn(
						streamTurnToken,
						isConversationTurnCanceled(streamTurnToken) ? 'stopped' : 'complete'
					);
			} catch (error) {
				const code = error instanceof Error ? error.message : 'INTERNAL_ERROR';
				send('error', { type: 'error', error: { code, message: code } });
				await eventWrites.catch(() => {});
				if (durableTurn)
					await finishTurn(
						streamTurnToken,
						isConversationTurnCanceled(streamTurnToken) ? 'stopped' : 'interrupted'
					);
			} finally {
				await releaseConversationTurn(conversationId, streamTurnToken);
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
		if (conversationId && turnToken) await releaseConversationTurn(conversationId, turnToken);
		return handleApiError(error);
	}
};
