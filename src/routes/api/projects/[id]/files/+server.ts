import { json } from '@sveltejs/kit';
import type { RequestHandler } from '@sveltejs/kit';
import { desc, eq } from 'drizzle-orm';
import { getDb, schema } from '$lib/server/db/client';
import { apiError, getOwnedProject, handleApiError, requireUser } from '$lib/server/api';
import { chunkText, extractText, saveProjectFile } from '$lib/server/files/storage';

export const GET: RequestHandler = async (event) => {
	try {
		const user = await requireUser(event);
		if (!user) return apiError('UNAUTHORIZED', 'Authentication required.', 401);
		const projectId = event.params.id;
		if (!projectId) return apiError('PROJECT_NOT_FOUND', 'Project not found.', 404);
		if (!(await getOwnedProject(projectId, user.id)))
			return apiError('PROJECT_NOT_FOUND', 'Project not found.', 404);
		return json({
			files: await getDb()
				.select()
				.from(schema.projectFiles)
				.where(eq(schema.projectFiles.projectId, projectId))
				.orderBy(desc(schema.projectFiles.createdAt))
		});
	} catch (error) {
		return handleApiError(error);
	}
};
export const POST: RequestHandler = async (event) => {
	try {
		const user = await requireUser(event);
		if (!user) return apiError('UNAUTHORIZED', 'Authentication required.', 401);
		const projectId = event.params.id;
		if (!projectId) return apiError('PROJECT_NOT_FOUND', 'Project not found.', 404);
		const db = getDb();
		if (!(await getOwnedProject(projectId, user.id)))
			return apiError('PROJECT_NOT_FOUND', 'Project not found.', 404);
		const form = await event.request.formData();
		const value = form.get('file');
		if (!(value instanceof File)) return apiError('FILE_REQUIRED', 'A file field is required.');
		const saved = await saveProjectFile(projectId, value);
		const [record] = await db
			.insert(schema.projectFiles)
			.values({
				projectId,
				filename: saved.filename,
				mimeType: saved.mimeType,
				sizeBytes: saved.sizeBytes,
				storageKey: saved.storageKey
			})
			.returning();
		const text = await extractText(value);
		const chunks = chunkText(text);
		if (chunks.length)
			await db
				.insert(schema.projectFileChunks)
				.values(chunks.map((content) => ({ projectId, fileId: record.id, content })));
		return json({ file: record, chunks: chunks.length }, { status: 201 });
	} catch (error) {
		if (error instanceof Error && ['UNSUPPORTED_FILE', 'FILE_TOO_LARGE'].includes(error.message))
			return apiError(
				error.message,
				error.message === 'FILE_TOO_LARGE'
					? 'File exceeds the 25 MB limit.'
					: 'File type is not supported.',
				400
			);
		return handleApiError(error);
	}
};
