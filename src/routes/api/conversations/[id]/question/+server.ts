import { json } from '@sveltejs/kit';
import type { RequestHandler } from '@sveltejs/kit';
import { apiError, getOwnedConversation, handleApiError, requireUser } from '$lib/server/api';
import { resolveQuestionAnswer } from '$lib/server/ai/question-broker';
import { z } from 'zod';

const answerSchema = z.object({
	requestId: z.string().min(1),
	answers: z
		.array(
			z.object({
				questionIndex: z.number().optional(),
				question: z.string().optional(),
				selected: z.array(z.string()).optional(),
				custom: z.string().max(2000).optional()
			})
		)
		.default([]),
	skipped: z.boolean().optional().default(false)
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
		const parsed = answerSchema.safeParse(body);
		if (!parsed.success) {
			return apiError('INVALID_INPUT', 'Invalid question answer payload.', 400);
		}

		const resolved = resolveQuestionAnswer(parsed.data.requestId, user.id, {
			answers: parsed.data.answers,
			skipped: parsed.data.skipped
		});

		if (!resolved) {
			return apiError('QUESTION_NOT_FOUND', 'Question request not found or expired.', 404);
		}

		return json({ ok: true });
	} catch (error) {
		return handleApiError(error);
	}
};
