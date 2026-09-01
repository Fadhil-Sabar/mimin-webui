import { json } from '@sveltejs/kit';
import type { RequestHandler } from '@sveltejs/kit';
import { desc, eq } from 'drizzle-orm';
import { getDb, schema } from '$lib/server/db/client';
import { apiError, handleApiError, requireUser } from '$lib/server/api';
import { projectInput } from '$lib/server/validation';

export const GET: RequestHandler = async (event) => {
	try {
		const user = await requireUser(event);
		if (!user) return apiError('UNAUTHORIZED', 'Authentication required.', 401);
		const db = getDb();
		return json({
			projects: await db
				.select()
				.from(schema.projects)
				.where(eq(schema.projects.userId, user.id))
				.orderBy(desc(schema.projects.updatedAt))
		});
	} catch (error) {
		return handleApiError(error);
	}
};
export const POST: RequestHandler = async (event) => {
	try {
		const user = await requireUser(event);
		if (!user) return apiError('UNAUTHORIZED', 'Authentication required.', 401);
		const parsed = projectInput.safeParse(await event.request.json());
		if (!parsed.success)
			return json(
				{ error: { code: 'INVALID_INPUT', message: 'Invalid project payload.' } },
				{ status: 400 }
			);
		const db = getDb();
		const [project] = await db
			.insert(schema.projects)
			.values({ ...parsed.data, userId: user.id })
			.returning();
		return json({ project }, { status: 201 });
	} catch (error) {
		return handleApiError(error);
	}
};
