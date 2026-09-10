import { json } from '@sveltejs/kit';
import type { RequestHandler } from '@sveltejs/kit';
import { apiError, getOwnedConversation, handleApiError, requireUser } from '$lib/server/api';
import {
	resolveBrowserConsent,
	revokeConversationBrowserConsent
} from '$lib/server/browser/consent';
import { z } from 'zod';

const decisionSchema = z.object({
	requestId: z.string().min(1).max(200),
	decision: z.enum(['once', 'conversation', 'deny'])
});

export const POST: RequestHandler = async (event) => {
	try {
		const user = await requireUser(event);
		if (!user) return apiError('UNAUTHORIZED', 'Authentication required.', 401);
		const conversationId = event.params.id;
		if (!conversationId) return apiError('CONVERSATION_NOT_FOUND', 'Conversation not found.', 404);

		const conversation = await getOwnedConversation(conversationId, user.id);
		if (!conversation) return apiError('CONVERSATION_NOT_FOUND', 'Conversation not found.', 404);

		const body = await event.request.json().catch(() => null);
		const parsed = decisionSchema.safeParse(body);
		if (!parsed.success) {
			return apiError('INVALID_INPUT', 'Invalid browser consent decision.', 400);
		}

		const resolved = resolveBrowserConsent(parsed.data.requestId, user.id, parsed.data.decision);
		if (!resolved) {
			return apiError(
				'BROWSER_CONSENT_NOT_FOUND',
				'The browser consent request is expired or invalid.',
				404
			);
		}

		return json({ ok: true, decision: parsed.data.decision });
	} catch (error) {
		return handleApiError(error);
	}
};

/** Forget a conversation-scoped grant so the next tab access prompts again. */
export const DELETE: RequestHandler = async (event) => {
	try {
		const user = await requireUser(event);
		if (!user) return apiError('UNAUTHORIZED', 'Authentication required.', 401);
		const conversationId = event.params.id;
		if (!conversationId) return apiError('CONVERSATION_NOT_FOUND', 'Conversation not found.', 404);

		const conversation = await getOwnedConversation(conversationId, user.id);
		if (!conversation) return apiError('CONVERSATION_NOT_FOUND', 'Conversation not found.', 404);

		const revoked = revokeConversationBrowserConsent(user.id, conversationId);
		return json({ ok: true, revoked });
	} catch (error) {
		return handleApiError(error);
	}
};
