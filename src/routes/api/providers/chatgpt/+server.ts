import { json } from '@sveltejs/kit';
import type { RequestHandler } from '@sveltejs/kit';
import { apiError, handleApiError, requireUser } from '$lib/server/api';
import {
	disconnectChatGptPlanConnection,
	getChatGptPlanStatus,
	startChatGptPlanConnection
} from '$lib/server/ai/chatgpt-plan.service';

export const GET: RequestHandler = async (event) => {
	try {
		const user = await requireUser(event);
		if (!user) return apiError('UNAUTHORIZED', 'Authentication required.', 401);
		return json(await getChatGptPlanStatus(user.id), { headers: { 'cache-control': 'no-store' } });
	} catch (error) {
		return handleApiError(error);
	}
};

export const POST: RequestHandler = async (event) => {
	try {
		const user = await requireUser(event);
		if (!user) return apiError('UNAUTHORIZED', 'Authentication required.', 401);
		if (!isSameOrigin(event.request))
			return apiError('CSRF_REJECTED', 'Request origin does not match.', 403);
		const attempt = await startChatGptPlanConnection(user.id);
		void attempt.completion.catch(() => {});
		return json(
			{ authorizationUrl: attempt.authorizationUrl, callbackPort: attempt.callbackPort },
			{ headers: { 'cache-control': 'no-store' } }
		);
	} catch (error) {
		if (error instanceof Error && 'code' in error && error.code === 'CHATGPT_OAUTH_BUSY')
			return apiError('CHATGPT_OAUTH_BUSY', error.message, 409);
		return handleApiError(error);
	}
};

export const DELETE: RequestHandler = async (event) => {
	try {
		const user = await requireUser(event);
		if (!user) return apiError('UNAUTHORIZED', 'Authentication required.', 401);
		if (!isSameOrigin(event.request))
			return apiError('CSRF_REJECTED', 'Request origin does not match.', 403);
		const result = await disconnectChatGptPlanConnection(user.id);
		return json({ ok: true, ...result }, { headers: { 'cache-control': 'no-store' } });
	} catch (error) {
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
