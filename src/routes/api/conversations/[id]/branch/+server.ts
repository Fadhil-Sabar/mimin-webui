import type { RequestHandler } from '@sveltejs/kit';
import { and, asc, eq, inArray, ne } from 'drizzle-orm';
import { getDb, schema } from '$lib/server/db/client';
import { apiError, getOwnedConversation, handleApiError, requireUser } from '$lib/server/api';
import { hasActiveConversationTurn } from '$lib/server/ai/agent.service';
import { branchConversationInput } from '$lib/server/validation';
import { toPublicConversation } from '$lib/server/skill-runtime';

type Database = ReturnType<typeof getDb>;

async function inTransaction<T>(db: Database, work: (tx: Database) => Promise<T>): Promise<T> {
	const transaction = (db as unknown as { transaction?: unknown }).transaction;
	if (typeof transaction !== 'function') return work(db);
	// Extracting the method loses its `this`, and drizzle's transaction reads
	// `this.session`; call it back against the db instance.
	return (transaction as (callback: (tx: Database) => Promise<T>) => Promise<T>).call(db, (tx) =>
		work(tx)
	);
}

function branchTitle(title: string, requested?: string) {
	if (requested) return requested;
	const suffix = ' (branch)';
	return `${title.slice(0, Math.max(1, 200 - suffix.length))}${suffix}`;
}

export const POST: RequestHandler = async (event) => {
	try {
		const user = await requireUser(event);
		if (!user) return apiError('UNAUTHORIZED', 'Authentication required.', 401);
		const conversationId = event.params.id;
		if (!conversationId) return apiError('CONVERSATION_NOT_FOUND', 'Conversation not found.', 404);
		const rawBody = await event.request.json().catch(() => null);
		const parsed = branchConversationInput.safeParse(
			rawBody && typeof rawBody === 'object' && !Array.isArray(rawBody)
				? {
						...rawBody,
						historyRevision:
							(rawBody as { historyRevision?: unknown; revision?: unknown }).historyRevision ??
							(rawBody as { revision?: unknown }).revision
					}
				: rawBody
		);
		if (!parsed.success) return apiError('INVALID_INPUT', 'historyRevision is required.');

		const db = getDb();
		const source = await getOwnedConversation(conversationId, user.id);
		if (!source) return apiError('CONVERSATION_NOT_FOUND', 'Conversation not found.', 404);
		if (await hasActiveConversationTurn(conversationId))
			return apiError(
				'CONVERSATION_BUSY',
				'This conversation is already generating a response.',
				409
			);
		if (source.historyRevision !== parsed.data.historyRevision)
			return apiError(
				'HISTORY_STALE',
				'The conversation changed. Reload it before branching.',
				409
			);

		const sourceMessages = await db
			.select()
			.from(schema.messages)
			.where(
				and(
					eq(schema.messages.conversationId, conversationId),
					ne(schema.messages.turnState, 'superseded')
				)
			)
			.orderBy(asc(schema.messages.createdAt), asc(schema.messages.id));
		const throughMessageId = parsed.data.throughMessageId ?? parsed.data.messageId ?? null;
		let selectedMessages = sourceMessages;
		if (throughMessageId) {
			const throughIndex = sourceMessages.findIndex((message) => message.id === throughMessageId);
			if (throughIndex === -1)
				return apiError(
					'MESSAGE_NOT_FOUND',
					'The branch point is not part of this conversation.',
					404
				);
			selectedMessages = sourceMessages.slice(0, throughIndex + 1);
		}

		const selectedIds = selectedMessages.map((message) => message.id);
		const attachments = selectedIds.length
			? await db
					.select()
					.from(schema.messageAttachments)
					.where(inArray(schema.messageAttachments.messageId, selectedIds))
			: [];
		const toolCalls = selectedIds.length
			? await db
					.select()
					.from(schema.toolCalls)
					.where(inArray(schema.toolCalls.messageId, selectedIds))
			: [];
		const citations = selectedIds.length
			? await db
					.select()
					.from(schema.messageCitations)
					.where(inArray(schema.messageCitations.messageId, selectedIds))
			: [];

		const branch = await inTransaction(db, async (tx) => {
			const [created] = await tx
				.insert(schema.conversations)
				.values({
					userId: user.id,
					projectId: source.projectId,
					activeSkillId: source.activeSkillId,
					activeSkillSnapshot: source.activeSkillSnapshot,
					title: branchTitle(source.title, parsed.data.title),
					model: source.model,
					enabledTools: source.enabledTools,
					historyRevision: 1
				})
				.returning();
			if (!created) throw new Error('BRANCH_NOT_CREATED');

			const messageMap = new Map<string, string>();
			for (const message of selectedMessages) {
				const [copy] = await tx
					.insert(schema.messages)
					.values({
						conversationId: created.id,
						role: message.role,
						content: message.content,
						skillSnapshot: message.skillSnapshot,
						stopReason: message.stopReason,
						usage: message.usage,
						timing: message.timing,
						turnState: message.turnState,
						completedAt: message.completedAt,
						createdAt: message.createdAt
					})
					.returning({ id: schema.messages.id });
				if (!copy) throw new Error('BRANCH_MESSAGE_NOT_CREATED');
				messageMap.set(message.id, copy.id);
			}
			if (attachments.length)
				await tx.insert(schema.messageAttachments).values(
					attachments.map((attachment) => ({
						messageId: messageMap.get(attachment.messageId)!,
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
			if (toolCalls.length)
				await tx.insert(schema.toolCalls).values(
					toolCalls.map((call) => ({
						messageId: call.messageId ? (messageMap.get(call.messageId) ?? null) : null,
						toolCallId: call.toolCallId,
						toolName: call.toolName,
						input: call.input,
						output: call.output,
						status: call.status,
						startedAt: call.startedAt,
						completedAt: call.completedAt
					}))
				);
			if (citations.length)
				await tx.insert(schema.messageCitations).values(
					citations.map((citation) => ({
						messageId: messageMap.get(citation.messageId)!,
						sourceId: citation.sourceId,
						label: citation.label
					}))
				);
			return { conversation: created, messageMap };
		});

		return new Response(
			JSON.stringify({
				conversation: toPublicConversation(branch.conversation),
				messageIds: [...branch.messageMap.values()]
			}),
			{ status: 201, headers: { 'content-type': 'application/json' } }
		);
	} catch (error) {
		return handleApiError(error);
	}
};
