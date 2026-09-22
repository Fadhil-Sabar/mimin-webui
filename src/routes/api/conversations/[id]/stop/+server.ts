import { json } from '@sveltejs/kit';
import type { RequestHandler } from '@sveltejs/kit';
import { stopConversation } from '$lib/server/ai/agent.service';
import { apiError, getOwnedConversation, requireUser } from '$lib/server/api';
import { finishTurn, getTurn } from '$lib/server/ai/turn-events';

export const POST: RequestHandler = async (event) => {
	try {
		const user = await requireUser(event);
		if (!user) return apiError('UNAUTHORIZED', 'Authentication required.', 401);
		const id = event.params.id;
		if (!id) return apiError('CONVERSATION_NOT_FOUND', 'Conversation not found.', 404);
		if (!(await getOwnedConversation(id, user.id)))
			return apiError('CONVERSATION_NOT_FOUND', 'Conversation not found.', 404);
		const body = await event.request.json().catch(() => ({}));
		const turnId = typeof body?.turnId === 'string' ? body.turnId : undefined;
		if (turnId && !(await getTurn(id, turnId)))
			return apiError('TURN_NOT_FOUND', 'Turn not found.', 404);
		const stopped = await stopConversation(id, turnId);
		if (stopped && turnId) await finishTurn(turnId, 'stopped');
		return json({ stopped });
	} catch (error) {
		console.error(error);
		return apiError('INTERNAL_ERROR', 'The request could not be completed.', 500);
	}
};
