import { unlink } from 'node:fs/promises';
import { resolve } from 'node:path';
import { env } from '$env/dynamic/private';
import { json } from '@sveltejs/kit';
import type { RequestHandler } from '@sveltejs/kit';
import { and, eq } from 'drizzle-orm';
import { getDb, schema } from '$lib/server/db/client';
import { apiError, getOwnedProject, handleApiError, requireUser } from '$lib/server/api';

export const DELETE: RequestHandler = async (event) => {
	try {
		const user = await requireUser(event);
		if (!user) return apiError('UNAUTHORIZED', 'Authentication required.', 401);
		const { id: projectId, fileId } = event.params;
		if (!projectId || !fileId) return apiError('FILE_NOT_FOUND', 'File not found.', 404);
		const db = getDb();
		if (!(await getOwnedProject(projectId, user.id)))
			return apiError('PROJECT_NOT_FOUND', 'Project not found.', 404);
		const [file] = await db
			.select()
			.from(schema.projectFiles)
			.where(and(eq(schema.projectFiles.id, fileId), eq(schema.projectFiles.projectId, projectId)));
		if (!file) return apiError('FILE_NOT_FOUND', 'File not found.', 404);
		const root = resolve(env.STORAGE_PATH || './data/uploads');
		const target = resolve(root, file.storageKey);
		if (!target.startsWith(`${root}/`))
			return apiError('INVALID_FILE_PATH', 'Invalid file path.', 400);
		await unlink(target).catch(() => undefined);
		await db.delete(schema.projectFiles).where(eq(schema.projectFiles.id, fileId));
		return json({ deleted: true });
	} catch (error) {
		return handleApiError(error);
	}
};
