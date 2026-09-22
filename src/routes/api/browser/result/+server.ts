import type { RequestHandler } from '@sveltejs/kit';
import { apiError, handleApiError, requireUser } from '$lib/server/api';
import { browserResultSchema, settleBrowserRequest } from '$lib/server/browser/bridge';
import { and, eq, gt } from 'drizzle-orm';
import { getDb, schema } from '$lib/server/db/client';

export const POST: RequestHandler = async (event) => {
	try {
		const user = await requireUser(event);
		if (!user) return apiError('UNAUTHORIZED', 'Authentication required.', 401);

		const origin = event.request.headers.get('origin');
		if (!origin || origin !== event.url.origin)
			return apiError('INVALID_ORIGIN', 'The browser bridge result has an invalid origin.', 403);

		const parsed = browserResultSchema.safeParse(await event.request.json());
		if (!parsed.success) return apiError('INVALID_INPUT', 'Invalid browser bridge result.');

		const [persisted] = await getDb()
			.update(schema.pendingBrowserActions)
			.set({
				status: parsed.data.ok ? 'completed' : 'failed',
				result: parsed.data.result ?? null,
				error: parsed.data.error ?? null
			})
			.where(
				and(
					eq(schema.pendingBrowserActions.requestId, parsed.data.requestId),
					eq(schema.pendingBrowserActions.userId, user.id),
					eq(schema.pendingBrowserActions.token, parsed.data.token),
					eq(schema.pendingBrowserActions.status, 'claimed'),
					gt(schema.pendingBrowserActions.expiresAt, new Date())
				)
			)
			.returning({ requestId: schema.pendingBrowserActions.requestId });
		const [durableAction] = persisted
			? [persisted]
			: await getDb()
					.select({ requestId: schema.pendingBrowserActions.requestId })
					.from(schema.pendingBrowserActions)
					.where(eq(schema.pendingBrowserActions.requestId, parsed.data.requestId));
		const acceptedLocal =
			(!durableAction || persisted) &&
			settleBrowserRequest(
				user.id,
				parsed.data.requestId,
				parsed.data.token,
				parsed.data.ok,
				parsed.data.result,
				parsed.data.error
			);
		if (!persisted && !acceptedLocal)
			return apiError(
				'BROWSER_REQUEST_NOT_FOUND',
				'The browser request is expired or invalid.',
				404
			);

		return new Response(JSON.stringify({ accepted: true }), {
			status: 200,
			headers: { 'content-type': 'application/json', 'cache-control': 'no-store' }
		});
	} catch (error) {
		return handleApiError(error);
	}
};
