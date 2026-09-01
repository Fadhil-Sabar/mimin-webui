import { json } from '@sveltejs/kit';
import type { RequestHandler } from '@sveltejs/kit';
import { stopConversation } from '$lib/server/ai/agent.service';
import { apiError, getOwnedConversation, requireUser } from '$lib/server/api';

export const POST: RequestHandler = async (event) => {
	try {
		const user = await requireUser(event);
		if (!user) return apiError('UNAUTHORIZED', 'Authentication required.', 401);
		const id = event.params.id;
		if (!id) return apiError('CONVERSATION_NOT_FOUND', 'Conversation not found.', 404);
		if (!(await getOwnedConversation(id, user.id)))
			return apiError('CONVERSATION_NOT_FOUND', 'Conversation not found.', 404);
		return json({ stopped: stopConversation(id) });
	} catch (error) {
		console.error(error);
		return apiError('INTERNAL_ERROR', 'The request could not be completed.', 500);
	}
};
