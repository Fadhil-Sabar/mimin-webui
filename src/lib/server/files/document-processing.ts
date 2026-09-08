import { and, eq, sql } from 'drizzle-orm';
import { randomUUID } from 'node:crypto';
import { getDb, schema } from '$lib/server/db/client';
import { chunkUploadedExtraction, extractUploadedFile, readStoredFile } from './storage';
import { indexKnowledgeEmbeddings } from '$lib/server/ai/knowledge-indexing';

export const PROCESSING_STATUSES = ['queued', 'processing', 'succeeded', 'failed'] as const;
export type ProcessingStatus = (typeof PROCESSING_STATUSES)[number];
export const MAX_PROCESSING_ATTEMPTS = 5;
export const PROCESSING_LEASE_MS = 5 * 60_000;

export function processingJobStatus(status: string): ProcessingStatus {
	return (PROCESSING_STATUSES as readonly string[]).includes(status)
		? (status as ProcessingStatus)
		: 'queued';
}

export function shouldRetryProcessingJob(attempts: number, maxAttempts = MAX_PROCESSING_ATTEMPTS) {
	return attempts < maxAttempts;
}

export async function enqueueDocumentProcessing(
	projectId: string,
	fileId: string,
	database: ReturnType<typeof getDb> = getDb()
) {
	const [job] = await database
		.insert(schema.documentProcessingJobs)
		.values({ projectId, fileId })
		.returning();
	return job;
}

type ClaimedJob = { id: string; projectId: string; fileId: string; attempts: number };

/** Atomically claims one queued or expired job; SKIP LOCKED makes this multi-instance safe. */
export async function claimDocumentProcessingJob(
	workerId = randomUUID()
): Promise<ClaimedJob | null> {
	const db = getDb();
	return db.transaction(async (tx) => {
		const lease = new Date(Date.now() + PROCESSING_LEASE_MS);
		const rows = await tx.execute(sql`
			WITH candidate AS (
				SELECT id FROM document_processing_jobs
				WHERE (status = 'queued' AND available_at <= now())
				   OR (status = 'processing' AND lease_until < now())
				ORDER BY created_at
				FOR UPDATE SKIP LOCKED LIMIT 1
			)
			UPDATE document_processing_jobs AS job
			SET status = 'processing', attempts = job.attempts + 1,
				lease_until = ${lease}, worker_id = ${workerId}, updated_at = now()
			FROM candidate
			WHERE job.id = candidate.id
			RETURNING job.id, job.project_id AS "projectId", job.file_id AS "fileId", job.attempts
		`);
		return (rows[0] as ClaimedJob | undefined) ?? null;
	});
}

async function finishJob(job: ClaimedJob, status: 'succeeded' | 'failed', error?: unknown) {
	await getDb()
		.update(schema.documentProcessingJobs)
		.set({
			status,
			leaseUntil: null,
			workerId: null,
			lastError: error instanceof Error ? error.message : error ? String(error) : null,
			updatedAt: new Date(),
			availableAt: new Date()
		})
		.where(eq(schema.documentProcessingJobs.id, job.id));
}

export async function processDocumentProcessingJob(job: ClaimedJob) {
	try {
		const db = getDb();
		const [file] = await db
			.select()
			.from(schema.projectFiles)
			.where(
				and(
					eq(schema.projectFiles.id, job.fileId),
					eq(schema.projectFiles.projectId, job.projectId)
				)
			);
		if (!file) throw new Error('FILE_NOT_FOUND');

		// Read storage once. The same bytes feed validation, extraction, chunking and embedding.
		const bytes = await readStoredFile(file.storageKey);
		const extraction = await extractUploadedFile(
			new File([new Uint8Array(bytes)], file.filename, { type: file.mimeType }),
			{ ocr: true }
		);
		const chunks = chunkUploadedExtraction(extraction);
		await db.transaction(async (tx) => {
			await tx
				.delete(schema.projectFileChunks)
				.where(eq(schema.projectFileChunks.fileId, job.fileId));
			if (chunks.length)
				await tx
					.insert(schema.projectFileChunks)
					.values(
						chunks.map((chunk) => ({ ...chunk, projectId: job.projectId, fileId: job.fileId }))
					);
			await tx
				.update(schema.projectFiles)
				.set({
					extractionStatus: extraction.extractionStatus,
					pageCount: extraction.pageCount,
					extractionError: extraction.extractionError,
					chunkCount: chunks.length,
					processingStatus: 'processing'
				})
				.where(eq(schema.projectFiles.id, job.fileId));
		});

		const indexing = await indexKnowledgeEmbeddings(job.projectId, job.fileId);
		if (indexing.status === 'unavailable') throw new Error('EMBEDDING_UNAVAILABLE');
		await getDb()
			.update(schema.projectFiles)
			.set({ processingStatus: 'succeeded' })
			.where(eq(schema.projectFiles.id, job.fileId));
		await finishJob(job, 'succeeded');
		return { status: 'succeeded' as const, indexing };
	} catch (error) {
		await getDb()
			.update(schema.projectFiles)
			.set({
				processingStatus: shouldRetryProcessingJob(job.attempts) ? 'queued' : 'failed',
				extractionError: error instanceof Error ? error.message : String(error)
			})
			.where(eq(schema.projectFiles.id, job.fileId))
			.catch(() => {});
		if (shouldRetryProcessingJob(job.attempts)) {
			await getDb()
				.update(schema.documentProcessingJobs)
				.set({
					status: 'queued',
					availableAt: new Date(Date.now() + Math.min(job.attempts * 30_000, 300_000)),
					leaseUntil: null,
					workerId: null,
					lastError: error instanceof Error ? error.message : String(error),
					updatedAt: new Date()
				})
				.where(eq(schema.documentProcessingJobs.id, job.id));
		} else await finishJob(job, 'failed', error);
		return { status: 'failed' as const, error };
	}
}

export async function runDocumentWorker(signal?: AbortSignal) {
	const workerId = randomUUID();
	while (!signal?.aborted) {
		try {
			const job = await claimDocumentProcessingJob(workerId);
			if (!job) {
				await new Promise((resolve) => setTimeout(resolve, 1000));
				continue;
			}
			await processDocumentProcessingJob(job);
		} catch {
			// Database outages must not kill the worker; leases make recovery safe.
			await new Promise((resolve) => setTimeout(resolve, 2000));
		}
	}
}
