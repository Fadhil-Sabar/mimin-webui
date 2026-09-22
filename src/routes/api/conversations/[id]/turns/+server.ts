import { json } from '@sveltejs/kit';
import type { RequestHandler } from '@sveltejs/kit';
import { apiError, getOwnedConversation, requireUser } from '$lib/server/api';
import { getLatestRunningTurn, reconcileInterruptedTurn } from '$lib/server/ai/turn-events';

export const GET: RequestHandler = async (event) => {
	const user = await requireUser(event);
	if (!user) return apiError('UNAUTHORIZED', 'Authentication required.', 401);
	const id = event.params.id;
	if (!id || !(await getOwnedConversation(id, user.id)))
		return apiError('CONVERSATION_NOT_FOUND', 'Conversation not found.', 404);
	const active = await getLatestRunningTurn(id);
	const turn = active ? await reconcileInterruptedTurn(id, active.id) : null;
	return json({ turn: turn?.status === 'running' ? { turnId: turn.id, cursor: 0 } : null });
};
