import { json, type RequestHandler } from '@sveltejs/kit';
import { and, eq, sql } from 'drizzle-orm';
import { getDb, schema } from '$lib/server/db/client';
import { apiError, getOwnedProject, handleApiError, requireUser } from '$lib/server/api';
import {
	chunkUploadedExtraction,
	extractUploadedFile,
	readStoredFile
} from '$lib/server/files/storage';
import { indexKnowledgeEmbeddings } from '$lib/server/ai/knowledge-indexing';

/** Explicit, repeatable upgrade for old uploads; original files and citation snapshots are retained. */
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
		const bytes = await readStoredFile(file.storageKey);
		const extraction = await extractUploadedFile(
			new File([new Uint8Array(bytes)], file.filename, { type: file.mimeType }),
			{ ocr: true }
		);
		const chunks = chunkUploadedExtraction(extraction);
		// Never replace useful legacy text with failed or partial extraction.
		if (
			extraction.extractionError ||
			['failed', 'partial', 'truncated'].includes(extraction.extractionStatus) ||
			!chunks.length
		) {
			return json(
				{
					error: {
						code: extraction.extractionError || 'NO_EXTRACTED_TEXT',
						message: 'Reindexing could not extract complete text; the previous index was retained.'
					}
				},
				{ status: 422 }
			);
		}
		const record = await db.transaction(async (tx) => {
			// Serialize replacements and prevent a concurrent deletion from resurrecting chunks.
			const locked = await tx.execute(
				sql`select id from project_files where id = ${fileId} and project_id = ${projectId} for update`
			);
			if (!locked.length) return null;
			await tx
				.delete(schema.projectFileChunks)
				.where(
					and(
						eq(schema.projectFileChunks.fileId, fileId),
						eq(schema.projectFileChunks.projectId, projectId)
					)
				);
			await tx
				.insert(schema.projectFileChunks)
				.values(chunks.map((chunk) => ({ ...chunk, projectId, fileId })));
			const [updated] = await tx
				.update(schema.projectFiles)
				.set({
					extractionStatus: extraction.extractionStatus,
					extractionError: extraction.extractionError,
					pageCount: extraction.pageCount,
					chunkCount: chunks.length
				})
				.where(scope)
				.returning();
			return updated;
		});
		if (!record) return apiError('FILE_NOT_FOUND', 'File not found.', 404);
		const indexing = await indexKnowledgeEmbeddings(projectId, fileId);
		return json({ file: record, indexing });
	} catch (error) {
		return handleApiError(error);
	}
};
