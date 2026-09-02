import { json } from '@sveltejs/kit';
import type { RequestHandler } from '@sveltejs/kit';
import { asc, eq, inArray } from 'drizzle-orm';
import { getDb, schema } from '$lib/server/db/client';
import { apiError, getOwnedConversation, handleApiError, requireUser } from '$lib/server/api';
import { isModelAvailable } from '$lib/server/ai/model.service';
import { conversationInput } from '$lib/server/validation';
import { getProjectConversationTools } from '$lib/server/ai/project-context';

export const GET: RequestHandler = async (event) => {
	try {
		const user = await requireUser(event);
		if (!user) return apiError('UNAUTHORIZED', 'Authentication required.', 401);
		const id = event.params.id;
		if (!id) return apiError('CONVERSATION_NOT_FOUND', 'Conversation not found.', 404);
		const db = getDb();
		const conversation = await getOwnedConversation(id, user.id);
		if (!conversation) return apiError('CONVERSATION_NOT_FOUND', 'Conversation not found.', 404);
		const rows = await db
			.select()
			.from(schema.messages)
			.where(eq(schema.messages.conversationId, id))
			.orderBy(asc(schema.messages.createdAt));
		const calls = await db
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
			.where(eq(schema.messages.conversationId, id))
			.orderBy(asc(schema.toolCalls.startedAt));
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
		const attachmentsByMessage = new Map<string, typeof attachmentRows>();
		for (const attachment of attachmentRows) {
			const current = attachmentsByMessage.get(attachment.messageId) ?? [];
			current.push(attachment);
			attachmentsByMessage.set(attachment.messageId, current);
		}
		return json({
			conversation,
			messages: rows.map((row) => ({
				...row,
				attachments: attachmentsByMessage.get(row.id) ?? [],
				toolCalls: toolCallsByMessage.get(row.id) ?? []
			})),
			toolCalls: calls
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
			.pick({ title: true, model: true, enabledTools: true })
			.extend({
				model: conversationInput.shape.model.removeDefault().optional(),
				enabledTools: conversationInput.shape.enabledTools.removeDefault().optional()
			});
		const parsed = updateSchema.safeParse(body);
		if (!parsed.success) return apiError('INVALID_INPUT', 'Invalid conversation payload.');
		if (parsed.data.model && !(await isModelAvailable(user.id, parsed.data.model)))
			return apiError('MODEL_NOT_AVAILABLE', 'Selected model is not available.');
		const [conversation] = await getDb()
			.update(schema.conversations)
			.set({
				...parsed.data,
				enabledTools:
					parsed.data.enabledTools === undefined
						? undefined
						: getProjectConversationTools(existingConversation.projectId, parsed.data.enabledTools),
				updatedAt: new Date()
			})
			.where(eq(schema.conversations.id, id))
			.returning();
		if (existingConversation.projectId)
			await getDb()
				.update(schema.projects)
				.set({ updatedAt: new Date() })
				.where(eq(schema.projects.id, existingConversation.projectId));
		return json({ conversation });
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
