import { json } from '@sveltejs/kit';
import type { RequestHandler } from '@sveltejs/kit';
import { and, count, desc, eq } from 'drizzle-orm';
import { getDb, schema } from '$lib/server/db/client';
import { apiError, handleApiError, requireUser } from '$lib/server/api';
import { projectInput } from '$lib/server/validation';

export const GET: RequestHandler = async (event) => {
	try {
		const user = await requireUser(event);
		if (!user) return apiError('UNAUTHORIZED', 'Authentication required.', 401);
		const db = getDb();
		const [projects, fileCounts, chatCounts] = await Promise.all([
			db
				.select()
				.from(schema.projects)
				.where(eq(schema.projects.userId, user.id))
				.orderBy(desc(schema.projects.updatedAt)),
			db
				.select({ projectId: schema.projectFiles.projectId, count: count() })
				.from(schema.projectFiles)
				.innerJoin(schema.projects, eq(schema.projectFiles.projectId, schema.projects.id))
				.where(eq(schema.projects.userId, user.id))
				.groupBy(schema.projectFiles.projectId),
			db
				.select({ projectId: schema.conversations.projectId, count: count() })
				.from(schema.conversations)
				.innerJoin(schema.projects, eq(schema.conversations.projectId, schema.projects.id))
				.where(and(eq(schema.projects.userId, user.id), eq(schema.conversations.userId, user.id)))
				.groupBy(schema.conversations.projectId)
		]);
		const filesByProject = new Map(fileCounts.map((row) => [row.projectId, Number(row.count)]));
		const chatsByProject = new Map(chatCounts.map((row) => [row.projectId, Number(row.count)]));
		return json({
			projects: projects.map((project) => ({
				...project,
				fileCount: filesByProject.get(project.id) ?? 0,
				chatCount: chatsByProject.get(project.id) ?? 0
			}))
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
