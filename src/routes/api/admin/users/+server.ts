import { json } from '@sveltejs/kit';
import type { RequestEvent } from '@sveltejs/kit';
import { asc, count, ilike, or } from 'drizzle-orm';
import { apiError, handleApiError, requireUser } from '$lib/server/api';
import { getDb, schema } from '$lib/server/db/client';

export async function GET(event: RequestEvent) {
	try {
		const user = await requireUser(event);
		if (!user) return apiError('UNAUTHORIZED', 'Authentication required.', 401);
		if (user.role !== 'admin')
			return apiError('FORBIDDEN', 'Administrator access is required.', 403);

		const url = event.url;
		const search = (url.searchParams.get('search') ?? url.searchParams.get('q') ?? '').trim();
		const limit = Math.min(
			Math.max(parseInt(url.searchParams.get('limit') ?? '50', 10) || 50, 1),
			200
		);
		const offset = Math.max(parseInt(url.searchParams.get('offset') ?? '0', 10) || 0, 0);

		const db = getDb();
		const whereClause = search
			? or(ilike(schema.users.name, `%${search}%`), ilike(schema.users.email, `%${search}%`))
			: undefined;

		const [countResult] = await (whereClause
			? db.select({ total: count() }).from(schema.users).where(whereClause)
			: db.select({ total: count() }).from(schema.users));
		const total = Number(countResult?.total ?? 0);

		const query = db
			.select({
				id: schema.users.id,
				name: schema.users.name,
				email: schema.users.email,
				role: schema.users.role,
				emailVerified: schema.users.emailVerified,
				createdAt: schema.users.createdAt
			})
			.from(schema.users);

		const users = await (whereClause ? query.where(whereClause) : query)
			.orderBy(asc(schema.users.createdAt))
			.limit(limit)
			.offset(offset);

		return json({
			users,
			total,
			limit,
			offset
		});
	} catch (error) {
		return handleApiError(error);
	}
}
