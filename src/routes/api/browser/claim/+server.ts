import { json } from '@sveltejs/kit';
import type { RequestHandler } from '@sveltejs/kit';
import { and, eq, gt } from 'drizzle-orm';
import { apiError, requireUser } from '$lib/server/api';
import { getDb, schema } from '$lib/server/db/client';

export const POST: RequestHandler = async (event) => {
	const user = await requireUser(event);
	if (!user) return apiError('UNAUTHORIZED', 'Authentication required.', 401);
	if (event.request.headers.get('origin') !== event.url.origin)
		return apiError('INVALID_ORIGIN', 'Invalid browser action origin.', 403);
	const body = await event.request.json().catch(() => ({}));
	if (
		typeof body.requestId !== 'string' ||
		typeof body.token !== 'string' ||
		typeof body.turnId !== 'string'
	)
		return apiError('INVALID_INPUT', 'Invalid browser action.');
	const [claimed] = await getDb()
		.update(schema.pendingBrowserActions)
		.set({ status: 'claimed' })
		.where(
			and(
				eq(schema.pendingBrowserActions.requestId, body.requestId),
				eq(schema.pendingBrowserActions.turnId, body.turnId),
				eq(schema.pendingBrowserActions.userId, user.id),
				eq(schema.pendingBrowserActions.token, body.token),
				eq(schema.pendingBrowserActions.status, 'pending'),
				gt(schema.pendingBrowserActions.expiresAt, new Date())
			)
		)
		.returning({ requestId: schema.pendingBrowserActions.requestId });
	return json({ claimed: Boolean(claimed) });
};
