import { json } from '@sveltejs/kit';
import type { RequestHandler } from '@sveltejs/kit';
import { asc, desc, eq } from 'drizzle-orm';
import { getDb, schema } from '$lib/server/db/client';
import { apiError, getOwnedConversation, handleApiError, requireUser } from '$lib/server/api';
import { isModelAvailable } from '$lib/server/ai/model.service';
import { conversationInput } from '$lib/server/validation';

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
			.orderBy(desc(schema.toolCalls.startedAt));
		return json({ conversation, messages: rows, toolCalls: calls });
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
		if (!(await getOwnedConversation(id, user.id)))
			return apiError('CONVERSATION_NOT_FOUND', 'Conversation not found.', 404);
		const body = await event.request.json();
		const parsed = conversationInput
			.pick({ title: true, model: true, enabledTools: true })
			.partial()
			.safeParse(body);
		if (!parsed.success) return apiError('INVALID_INPUT', 'Invalid conversation payload.');
		if (parsed.data.model && !(await isModelAvailable(user.id, parsed.data.model)))
			return apiError('MODEL_NOT_AVAILABLE', 'Selected model is not available.');
		const [conversation] = await getDb()
			.update(schema.conversations)
			.set({ ...parsed.data, updatedAt: new Date() })
			.where(eq(schema.conversations.id, id))
			.returning();
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
		if (!(await getOwnedConversation(id, user.id)))
			return apiError('CONVERSATION_NOT_FOUND', 'Conversation not found.', 404);
		const deleted = await getDb()
			.delete(schema.conversations)
			.where(eq(schema.conversations.id, id))
			.returning({ id: schema.conversations.id });
		if (!deleted.length) return apiError('CONVERSATION_NOT_FOUND', 'Conversation not found.', 404);
		return new Response(null, { status: 204 });
	} catch (error) {
		return handleApiError(error);
	}
};
