import { json } from '@sveltejs/kit';
import type { RequestHandler } from '@sveltejs/kit';
import { getDb, schema } from '$lib/server/db/client';
import { eq } from 'drizzle-orm';
import { apiError, getOwnedConversation, handleApiError, requireUser } from '$lib/server/api';
import { messageInput } from '$lib/server/validation';
export const PATCH: RequestHandler = async (event) => {
	try {
		const user = await requireUser(event);
		if (!user) return apiError('UNAUTHORIZED', 'Authentication required.', 401);
		const id = event.params.id;
		if (!id) return apiError('CONVERSATION_NOT_FOUND', 'Conversation not found.', 404);
		if (!(await getOwnedConversation(id, user.id)))
			return apiError('CONVERSATION_NOT_FOUND', 'Conversation not found.', 404);
		const body = await event.request.json();
		const parsed = messageInput.pick({ model: true, enabledTools: true }).partial().safeParse(body);
		if (!parsed.success) return apiError('INVALID_INPUT', 'Invalid conversation settings.');
		const [conversation] = await getDb()
			.update(schema.conversations)
			.set(parsed.data)
			.where(eq(schema.conversations.id, id))
			.returning();
		if (!conversation) return apiError('CONVERSATION_NOT_FOUND', 'Conversation not found.', 404);
		return json({ conversation });
	} catch (error) {
		return handleApiError(error);
	}
};
