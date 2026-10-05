import { json } from '@sveltejs/kit';
import type { RequestHandler } from '@sveltejs/kit';
import { apiError, handleApiError, requireUser } from '$lib/server/api';
import {
	ChatGptPlanCompletionError,
	completeChatGptPlanConnection
} from '$lib/server/ai/chatgpt-plan.service';

export const POST: RequestHandler = async (event) => {
	try {
		const user = await requireUser(event);
		if (!user) return apiError('UNAUTHORIZED', 'Authentication required.', 401);
		if (!isSameOrigin(event.request))
			return apiError('CSRF_REJECTED', 'Request origin does not match.', 403);
		const body = (await event.request.json().catch(() => null)) as {
			callbackUrl?: unknown;
		} | null;
		const callbackUrl = typeof body?.callbackUrl === 'string' ? body.callbackUrl : '';
		if (!callbackUrl.trim())
			return apiError(
				'INVALID_CALLBACK_URL',
				'Paste the callback URL from the browser address bar.',
				400
			);
		const result = await completeChatGptPlanConnection(user.id, callbackUrl);
		return json(result, { headers: { 'cache-control': 'no-store' } });
	} catch (error) {
		if (error instanceof ChatGptPlanCompletionError)
			return apiError(error.code, error.message, error.reason === 'no-attempt' ? 409 : 400);
		return handleApiError(error);
	}
};

function isSameOrigin(request: Request) {
	const origin = request.headers.get('origin');
	const referer = request.headers.get('referer');
	try {
		const source = origin ?? (referer ? new URL(referer).origin : null);
		return Boolean(source && source === new URL(request.url).origin);
	} catch {
		return false;
	}
}
