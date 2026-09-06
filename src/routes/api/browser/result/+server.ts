import type { RequestHandler } from '@sveltejs/kit';
import { apiError, handleApiError, requireUser } from '$lib/server/api';
import {
	browserResultSchema,
	settleBrowserRequest
} from '$lib/server/browser/bridge';

export const POST: RequestHandler = async (event) => {
	try {
		const user = await requireUser(event);
		if (!user) return apiError('UNAUTHORIZED', 'Authentication required.', 401);

		const origin = event.request.headers.get('origin');
		if (!origin || origin !== event.url.origin)
			return apiError('INVALID_ORIGIN', 'The browser bridge result has an invalid origin.', 403);

		const parsed = browserResultSchema.safeParse(await event.request.json());
		if (!parsed.success) return apiError('INVALID_INPUT', 'Invalid browser bridge result.');

		const accepted = settleBrowserRequest(
			user.id,
			parsed.data.requestId,
			parsed.data.token,
			parsed.data.ok,
			parsed.data.result,
			parsed.data.error
		);
		if (!accepted)
			return apiError('BROWSER_REQUEST_NOT_FOUND', 'The browser request is expired or invalid.', 404);

		return new Response(JSON.stringify({ accepted: true }), {
			status: 200,
			headers: { 'content-type': 'application/json', 'cache-control': 'no-store' }
		});
	} catch (error) {
		return handleApiError(error);
	}
};
