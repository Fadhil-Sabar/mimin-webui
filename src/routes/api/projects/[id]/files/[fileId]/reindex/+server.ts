import { json, type RequestHandler } from '@sveltejs/kit';
import { and, eq, inArray } from 'drizzle-orm';
import { getDb, schema } from '$lib/server/db/client';
import { apiError, getOwnedProject, handleApiError, requireUser } from '$lib/server/api';
import { enqueueDocumentProcessing } from '$lib/server/files/document-processing';

/**
 * Queues a repeatable reindex on the durable document worker instead of running
 * extraction, OCR, and embeddings inside the request: long scans no longer block
 * the HTTP call, and a restart or second instance picks the job up from the
 * database. Original files and citation snapshots are retained; when the new
 * extraction fails, the worker keeps the previous index and marks the file.
 */
export const POST: RequestHandler = async (event) => {
	try {
		const user = await requireUser(event);
		if (!user) return apiError('UNAUTHORIZED', 'Authentication required.', 401);
		const { id: projectId, fileId } = event.params;
		if (!projectId || !fileId || !(await getOwnedProject(projectId, user.id)))
			return apiError('PROJECT_NOT_FOUND', 'Project not found.', 404);
		const db = getDb();
		const scope = and(
			eq(schema.projectFiles.id, fileId),
			eq(schema.projectFiles.projectId, projectId)
		);
		const [file] = await db.select().from(schema.projectFiles).where(scope);
		if (!file) return apiError('FILE_NOT_FOUND', 'File not found.', 404);
		// A second click reuses the in-flight job instead of queueing duplicate work.
		const [existing] = await db
			.select({ id: schema.documentProcessingJobs.id })
			.from(schema.documentProcessingJobs)
			.where(
				and(
					eq(schema.documentProcessingJobs.fileId, fileId),
					eq(schema.documentProcessingJobs.projectId, projectId),
					inArray(schema.documentProcessingJobs.status, ['queued', 'processing'])
				)
			)
			.limit(1);
		const record = await db.transaction(async (tx) => {
			if (!existing)
				await enqueueDocumentProcessing(
					projectId,
					fileId,
					tx as unknown as ReturnType<typeof getDb>,
					'reindex'
				);
			const [updated] = await tx
				.update(schema.projectFiles)
				.set({ processingStatus: 'queued' })
				.where(scope)
				.returning();
			return updated;
		});
		if (!record) return apiError('FILE_NOT_FOUND', 'File not found.', 404);
		return json({ file: record, processing: { status: 'queued' } }, { status: 202 });
	} catch (error) {
		return handleApiError(error);
	}
};
