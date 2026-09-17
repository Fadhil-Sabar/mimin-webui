import { json } from '@sveltejs/kit';
import type { RequestHandler } from '@sveltejs/kit';
import { and, asc, desc, eq, inArray, lt, ne, or } from 'drizzle-orm';
import { getDb, schema } from '$lib/server/db/client';
import { apiError, getOwnedConversation, handleApiError, requireUser } from '$lib/server/api';
import { isModelAvailable } from '$lib/server/ai/model.service';
import { conversationInput } from '$lib/server/validation';
import { getProjectConversationTools } from '$lib/server/ai/project-context';
import { decodeMessageCursor, encodeMessageCursor } from '$lib/server/conversations';
import { hasActiveConversationTurn } from '$lib/server/ai/agent.service';
import { clearBrowserSession } from '$lib/server/browser/bridge';
import {
	resolveConversationSkill,
	skillActivationFields,
	toPublicConversation,
	toPublicMessage
} from '$lib/server/skill-runtime';

export const GET: RequestHandler = async (event) => {
	try {
		const user = await requireUser(event);
		if (!user) return apiError('UNAUTHORIZED', 'Authentication required.', 401);
		const id = event.params.id;
		if (!id) return apiError('CONVERSATION_NOT_FOUND', 'Conversation not found.', 404);
		const db = getDb();
		const conversation = await getOwnedConversation(id, user.id);
		if (!conversation) return apiError('CONVERSATION_NOT_FOUND', 'Conversation not found.', 404);
		const limit = Number(event.url.searchParams.get('limit') ?? '50');
		if (!Number.isSafeInteger(limit) || limit < 1 || limit > 100)
			return apiError('INVALID_INPUT', 'limit must be an integer between 1 and 100.');
		const cursorValue = event.url.searchParams.get('cursor');
		const cursor = cursorValue ? decodeMessageCursor(cursorValue) : null;
		if (cursorValue && !cursor) return apiError('INVALID_INPUT', 'Invalid messages cursor.');
		// The newest page is the useful one: a long conversation must show its latest
		// turn on load, so this orders newest-first and the `cursor` walks backwards
		// through older messages rather than forwards.
		const messageQuery = db
			.select()
			.from(schema.messages)
			.where(
				and(
					eq(schema.messages.conversationId, id),
					// A regenerated reply is kept for history but must not be shown twice.
					ne(schema.messages.turnState, 'superseded'),
					cursor
						? or(
								lt(schema.messages.createdAt, cursor.createdAt),
								and(
									eq(schema.messages.createdAt, cursor.createdAt),
									lt(schema.messages.id, cursor.id)
								)
							)
						: undefined
				)
			)
			.orderBy(desc(schema.messages.createdAt), desc(schema.messages.id));
		const rawRows = await (typeof (messageQuery as { limit?: unknown }).limit === 'function'
			? messageQuery.limit(limit + 1)
			: messageQuery);
		const hasMore = rawRows.length > limit;
		// The page boundary comes from a newest-first query, but the client renders
		// chronologically, so the kept slice is reversed back.
		const rows = rawRows.slice(0, limit).reverse();
		const pageMessageIds = rows.map((row) => row.id);
		const calls = pageMessageIds.length
			? await db
					.select({
						id: schema.toolCalls.id,
						messageId: schema.toolCalls.messageId,
						toolCallId: schema.toolCalls.toolCallId,
						toolName: schema.toolCalls.toolName,
						input: schema.toolCalls.input,
						output: schema.toolCalls.output,
						status: schema.toolCalls.status,
						startedAt: schema.toolCalls.startedAt,
						completedAt: schema.toolCalls.completedAt
					})
					.from(schema.toolCalls)
					.innerJoin(schema.messages, eq(schema.toolCalls.messageId, schema.messages.id))
					.where(inArray(schema.messages.id, pageMessageIds))
					.orderBy(asc(schema.toolCalls.startedAt))
			: [];
		const toolCallsByMessage = new Map<string, typeof calls>();
		for (const call of calls) {
			if (!call.messageId) continue;
			const current = toolCallsByMessage.get(call.messageId) ?? [];
			current.push(call);
			toolCallsByMessage.set(call.messageId, current);
		}
		const attachmentRows = rows.length
			? await db
					.select({
						id: schema.messageAttachments.id,
						messageId: schema.messageAttachments.messageId,
						filename: schema.messageAttachments.filename,
						mimeType: schema.messageAttachments.mimeType,
						sizeBytes: schema.messageAttachments.sizeBytes,
						extractionStatus: schema.messageAttachments.extractionStatus,
						pageCount: schema.messageAttachments.pageCount,
						extractionError: schema.messageAttachments.extractionError
					})
					.from(schema.messageAttachments)
					.where(
						inArray(
							schema.messageAttachments.messageId,
							rows.map((row) => row.id)
						)
					)
			: [];
		const attachmentsByMessage = new Map<
			string,
			Array<(typeof attachmentRows)[number] & { url: string }>
		>();
		for (const attachment of attachmentRows) {
			const current = attachmentsByMessage.get(attachment.messageId) ?? [];
			// The bubble needs a URL it can render; the bytes are served by the
			// conversation-scoped attachment route, which re-checks ownership.
			current.push({
				...attachment,
				url: `/api/conversations/${id}/attachments/${attachment.id}`
			});
			attachmentsByMessage.set(attachment.messageId, current);
		}
		const citationRows = rows.length
			? await db
					.select({
						messageId: schema.messageCitations.messageId,
						sourceId: schema.messageCitations.sourceId,
						label: schema.messageCitations.label,
						type: schema.sources.type,
						title: schema.sources.title,
						url: schema.sources.url,
						fileId: schema.sources.fileId,
						metadata: schema.sources.metadata
					})
					.from(schema.messageCitations)
					.innerJoin(schema.sources, eq(schema.messageCitations.sourceId, schema.sources.id))
					.where(
						inArray(
							schema.messageCitations.messageId,
							rows.map((row) => row.id)
						)
					)
			: [];
		const citationsByMessage = new Map<string, typeof citationRows>();
		for (const citation of citationRows) {
			const current = citationsByMessage.get(citation.messageId) ?? [];
			current.push(citation);
			citationsByMessage.set(citation.messageId, current);
		}
		const citationOrder = (metadata: unknown) => {
			const index = (metadata as { citationIndex?: unknown } | null)?.citationIndex;
			return typeof index === 'number' && Number.isFinite(index) ? index : 0;
		};
		for (const citations of citationsByMessage.values())
			citations.sort((a, b) => citationOrder(a.metadata) - citationOrder(b.metadata));
		const [linkedCanvas] = await db
			.select({ id: schema.canvases.id })
			.from(schema.canvases)
			.where(and(eq(schema.canvases.conversationId, id), eq(schema.canvases.userId, user.id)))
			.limit(1);
		// A row still marked `streaming` with no live turn behind it can only be a turn
		// that died without finalizing (dropped connection, provider error, restart).
		const turnActive = hasActiveConversationTurn(id);
		return json({
			conversation: {
				...toPublicConversation(conversation),
				canvasId: linkedCanvas?.id ?? null
			},
			messages: rows.map((row) => {
				const message = toPublicMessage(row);
				return {
					...message,
					turnState:
						!turnActive && message.turnState === 'streaming' ? 'interrupted' : message.turnState,
					attachments: attachmentsByMessage.get(row.id) ?? [],
					toolCalls: toolCallsByMessage.get(row.id) ?? [],
					citations: citationsByMessage.get(row.id) ?? []
				};
			}),
			toolCalls: calls,
			hasMore,
			// The oldest row in this page: send it back as `cursor` to load what came before.
			olderCursor:
				hasMore && rows.length
					? encodeMessageCursor({ createdAt: rows[0].createdAt, id: rows[0].id })
					: null
		});
	} catch (error) {
		return handleApiError(error);
	}
};
export const PATCH: RequestHandler = async (event) => {
	try {
		const user = await requireUser(event);
		if (!user) return apiError('UNAUTHORIZED', 'Authentication required.', 401);
		const id = event.params.id;
		if (!id) return apiError('CONVERSATION_NOT_FOUND', 'Conversation not found.', 404);
		const existingConversation = await getOwnedConversation(id, user.id);
		if (!existingConversation)
			return apiError('CONVERSATION_NOT_FOUND', 'Conversation not found.', 404);
		const body = await event.request.json();
		const updateSchema = conversationInput
			.pick({ title: true, model: true, enabledTools: true, skillId: true })
			.extend({
				model: conversationInput.shape.model.removeDefault().optional(),
				enabledTools: conversationInput.shape.enabledTools.removeDefault().optional(),
				skillId: conversationInput.shape.skillId.optional()
			});
		const parsed = updateSchema.safeParse(body);
		if (!parsed.success) {
			if (
				typeof body === 'object' &&
				body !== null &&
				Object.prototype.hasOwnProperty.call(body, 'skillId')
			)
				return apiError('INVALID_SKILL', 'Invalid skill.');
			return apiError('INVALID_INPUT', 'Invalid conversation payload.');
		}
		if (parsed.data.model && !(await isModelAvailable(user.id, parsed.data.model)))
			return apiError('MODEL_NOT_AVAILABLE', 'Selected model is not available.');

		const hasSkillChange = Object.prototype.hasOwnProperty.call(body, 'skillId');
		let skillFields: ReturnType<typeof skillActivationFields> | undefined;
		let enabledTools = parsed.data.enabledTools;
		if (hasSkillChange) {
			if (parsed.data.skillId === null || parsed.data.skillId === undefined) {
				skillFields = skillActivationFields(null);
			} else {
				const resolvedSkill = await resolveConversationSkill(
					parsed.data.skillId,
					user.id,
					existingConversation.projectId
				);
				if ('error' in resolvedSkill) {
					return apiError(
						resolvedSkill.error,
						resolvedSkill.error === 'SKILL_NOT_FOUND'
							? 'Skill not found.'
							: 'Skill is not valid for this project.',
						resolvedSkill.error === 'SKILL_NOT_FOUND' ? 404 : 400
					);
				}
				skillFields = skillActivationFields(resolvedSkill.skill);
				enabledTools = getProjectConversationTools(
					existingConversation.projectId,
					skillFields.activeSkillSnapshot?.enabledTools ?? []
				);
			}
		}
		const [conversation] = await getDb()
			.update(schema.conversations)
			.set({
				...(parsed.data.title !== undefined ? { title: parsed.data.title } : {}),
				...(parsed.data.model !== undefined ? { model: parsed.data.model } : {}),
				enabledTools:
					enabledTools === undefined
						? undefined
						: getProjectConversationTools(existingConversation.projectId, enabledTools),
				...(skillFields ?? {}),
				updatedAt: new Date()
			})
			.where(eq(schema.conversations.id, id))
			.returning();
		if (existingConversation.projectId)
			await getDb()
				.update(schema.projects)
				.set({ updatedAt: new Date() })
				.where(eq(schema.projects.id, existingConversation.projectId));
		return json({
			conversation: {
				...toPublicConversation(conversation),
				projectName: existingConversation.projectName ?? null
			}
		});
	} catch (error) {
		return handleApiError(error);
	}
};
export const DELETE: RequestHandler = async (event) => {
	try {
		const user = await requireUser(event);
		if (!user) return apiError('UNAUTHORIZED', 'Authentication required.', 401);
		const id = event.params.id;
		if (!id) return apiError('CONVERSATION_NOT_FOUND', 'Conversation not found.', 404);
		const existingConversation = await getOwnedConversation(id, user.id);
		if (!existingConversation)
			return apiError('CONVERSATION_NOT_FOUND', 'Conversation not found.', 404);
		const deleted = await getDb()
			.delete(schema.conversations)
			.where(eq(schema.conversations.id, id))
			.returning({ id: schema.conversations.id });
		if (!deleted.length) return apiError('CONVERSATION_NOT_FOUND', 'Conversation not found.', 404);
		clearBrowserSession(user.id, id);
		if (existingConversation.projectId)
			await getDb()
				.update(schema.projects)
				.set({ updatedAt: new Date() })
				.where(eq(schema.projects.id, existingConversation.projectId));
		return new Response(null, { status: 204 });
	} catch (error) {
		return handleApiError(error);
	}
};
