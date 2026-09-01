import { json } from '@sveltejs/kit';
import type { RequestHandler } from '@sveltejs/kit';
import { desc, eq } from 'drizzle-orm';
import { getDb, schema } from '$lib/server/db/client';
import { apiError, getOwnedProject, handleApiError, requireUser } from '$lib/server/api';
import { projectInput } from '$lib/server/validation';

export const GET: RequestHandler = async (event) => {
	try {
		const user = await requireUser(event);
		if (!user) return apiError('UNAUTHORIZED', 'Authentication required.', 401);
		const id = event.params.id;
		if (!id) return apiError('PROJECT_NOT_FOUND', 'Project not found.', 404);
		const db = getDb();
		const [project] = await db.select().from(schema.projects).where(eq(schema.projects.id, id));
		if (!project || project.userId !== user.id)
			return apiError('PROJECT_NOT_FOUND', 'Project not found.', 404);
		const [files, conversations] = await Promise.all([
			db
				.select()
				.from(schema.projectFiles)
				.where(eq(schema.projectFiles.projectId, id))
				.orderBy(desc(schema.projectFiles.createdAt)),
			db
				.select()
				.from(schema.conversations)
				.where(eq(schema.conversations.projectId, id))
				.orderBy(desc(schema.conversations.updatedAt))
		]);
		return json({ project, files, conversations });
	} catch (error) {
		return handleApiError(error);
	}
};
export const PATCH: RequestHandler = async (event) => {
	try {
		const user = await requireUser(event);
		if (!user) return apiError('UNAUTHORIZED', 'Authentication required.', 401);
		const id = event.params.id;
		if (!id) return apiError('PROJECT_NOT_FOUND', 'Project not found.', 404);
		if (!(await getOwnedProject(id, user.id)))
			return apiError('PROJECT_NOT_FOUND', 'Project not found.', 404);
		const body = await event.request.json();
		const parsed = projectInput.partial().safeParse(body);
		if (!parsed.success) return apiError('INVALID_INPUT', 'Invalid project payload.');
		const [project] = await getDb()
			.update(schema.projects)
			.set({ ...parsed.data, updatedAt: new Date() })
			.where(eq(schema.projects.id, id))
			.returning();
		return json({ project });
	} catch (error) {
		return handleApiError(error);
	}
};
export const DELETE: RequestHandler = async (event) => {
	try {
		const user = await requireUser(event);
		if (!user) return apiError('UNAUTHORIZED', 'Authentication required.', 401);
		const id = event.params.id;
		if (!id) return apiError('PROJECT_NOT_FOUND', 'Project not found.', 404);
		if (!(await getOwnedProject(id, user.id)))
			return apiError('PROJECT_NOT_FOUND', 'Project not found.', 404);
		const deleted = await getDb()
			.delete(schema.projects)
			.where(eq(schema.projects.id, id))
			.returning({ id: schema.projects.id });
		if (!deleted.length) return apiError('PROJECT_NOT_FOUND', 'Project not found.', 404);
		return new Response(null, { status: 204 });
	} catch (error) {
		return handleApiError(error);
	}
};
