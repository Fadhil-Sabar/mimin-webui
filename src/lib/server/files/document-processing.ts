import { and, eq, sql } from 'drizzle-orm';
import { randomUUID } from 'node:crypto';
import { getDb, schema } from '$lib/server/db/client';
import { chunkUploadedExtraction, extractUploadedFile, readStoredFile } from './storage';
import { indexKnowledgeEmbeddings } from '$lib/server/ai/knowledge-indexing';

export const PROCESSING_STATUSES = ['queued', 'processing', 'succeeded', 'failed'] as const;
export type ProcessingStatus = (typeof PROCESSING_STATUSES)[number];
export const MAX_PROCESSING_ATTEMPTS = 5;
export const PROCESSING_LEASE_MS = 5 * 60_000;
export const PROCESSING_HEARTBEAT_MS = Math.max(1_000, Math.floor(PROCESSING_LEASE_MS / 3));

export function processingJobStatus(status: string): ProcessingStatus {
	return (PROCESSING_STATUSES as readonly string[]).includes(status)
		? (status as ProcessingStatus)
		: 'queued';
}

export function shouldRetryProcessingJob(attempts: number, maxAttempts = MAX_PROCESSING_ATTEMPTS) {
	return attempts < maxAttempts;
}

export function isProcessingJobClaimable(
	status: ProcessingStatus,
	attempts: number,
	timing: { available: boolean; leaseExpired: boolean },
	maxAttempts = MAX_PROCESSING_ATTEMPTS
) {
	if (attempts >= maxAttempts) return false;
	return status === 'queued' ? timing.available : status === 'processing' && timing.leaseExpired;
}

export function leaseHeartbeatDelay(leaseMs = PROCESSING_LEASE_MS) {
	return Math.max(1_000, Math.floor(leaseMs / 3));
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

export type ClaimedJob = {
	id: string;
	projectId: string;
	fileId: string;
	attempts: number;
	workerId: string;
	leaseToken: string;
};

export class DocumentLeaseLostError extends Error {
	constructor() {
		super('DOCUMENT_PROCESSING_LEASE_LOST');
		this.name = 'DocumentLeaseLostError';
	}
}

export function assertOwnedProcessingUpdate<T>(updated: T | undefined): T {
	if (!updated) throw new DocumentLeaseLostError();
	return updated;
}

/** Atomically claims one queued or expired job; SKIP LOCKED makes this multi-instance safe. */
export async function claimDocumentProcessingJob(
	workerId = randomUUID()
): Promise<ClaimedJob | null> {
	const db = getDb();
	const leaseToken = randomUUID();
	return db.transaction(async (tx) => {
		const lease = new Date(Date.now() + PROCESSING_LEASE_MS);
		const rows = await tx.execute(sql`
			WITH candidate AS (
				SELECT id FROM document_processing_jobs
				WHERE attempts < ${MAX_PROCESSING_ATTEMPTS}
				  AND ((status = 'queued' AND available_at <= now())
				   OR (status = 'processing' AND lease_until < now()))
				ORDER BY created_at
				FOR UPDATE SKIP LOCKED LIMIT 1
			)
			UPDATE document_processing_jobs AS job
			SET status = 'processing', attempts = job.attempts + 1,
				lease_until = ${lease}, worker_id = ${workerId}, lease_token = ${leaseToken}, updated_at = now()
			FROM candidate
			WHERE job.id = candidate.id
			RETURNING job.id, job.project_id AS "projectId", job.file_id AS "fileId", job.attempts,
				job.worker_id AS "workerId", job.lease_token AS "leaseToken"
		`);
		return (rows[0] as ClaimedJob | undefined) ?? null;
	});
}

function ownedJobWhere(job: ClaimedJob) {
	return and(
		eq(schema.documentProcessingJobs.id, job.id),
		eq(schema.documentProcessingJobs.status, 'processing'),
		eq(schema.documentProcessingJobs.workerId, job.workerId),
		eq(schema.documentProcessingJobs.leaseToken, job.leaseToken),
		sql`${schema.documentProcessingJobs.leaseUntil} > now()`
	);
}

function ownedFileWhere(job: ClaimedJob) {
	return sql`${schema.projectFiles.id} = ${job.fileId}
		AND EXISTS (
			SELECT 1 FROM document_processing_jobs
			WHERE id = ${job.id} AND project_id = ${job.projectId} AND file_id = ${job.fileId}
			  AND status = 'processing' AND worker_id = ${job.workerId}
			  AND lease_token = ${job.leaseToken} AND lease_until > now()
		)`;
}

export async function renewDocumentProcessingLease(job: ClaimedJob): Promise<boolean> {
	const [updated] = await getDb()
		.update(schema.documentProcessingJobs)
		.set({ leaseUntil: new Date(Date.now() + PROCESSING_LEASE_MS), updatedAt: new Date() })
		.where(ownedJobWhere(job))
		.returning({ id: schema.documentProcessingJobs.id });
	return Boolean(updated);
}

async function assertLease(job: ClaimedJob) {
	if (!(await renewDocumentProcessingLease(job))) throw new DocumentLeaseLostError();
}

async function finishJob(job: ClaimedJob, status: 'succeeded' | 'failed', error?: unknown) {
	const [updated] = await getDb()
		.update(schema.documentProcessingJobs)
		.set({
			status,
			leaseUntil: null,
			workerId: null,
			leaseToken: null,
			lastError: error instanceof Error ? error.message : error ? String(error) : null,
			updatedAt: new Date(),
			availableAt: new Date()
		})
		.where(ownedJobWhere(job))
		.returning({ id: schema.documentProcessingJobs.id });
	assertOwnedProcessingUpdate(updated);
}

export async function processDocumentProcessingJob(job: ClaimedJob) {
	let heartbeat: ReturnType<typeof setInterval> | undefined;
	let leaseLost = false;
	try {
		heartbeat = setInterval(() => {
			void renewDocumentProcessingLease(job)
				.then((owned) => {
					if (!owned) leaseLost = true;
				})
				.catch(() => {
					leaseLost = true;
				});
		}, PROCESSING_HEARTBEAT_MS);
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

		const bytes = await readStoredFile(file.storageKey);
		const extraction = await extractUploadedFile(
			new File([new Uint8Array(bytes)], file.filename, { type: file.mimeType }),
			{ ocr: true }
		);
		const chunks = chunkUploadedExtraction(extraction);
		if (leaseLost) throw new DocumentLeaseLostError();
		await assertLease(job);
		await db.transaction(async (tx) => {
			const [lease] = await tx
				.update(schema.documentProcessingJobs)
				.set({ leaseUntil: new Date(Date.now() + PROCESSING_LEASE_MS), updatedAt: new Date() })
				.where(ownedJobWhere(job))
				.returning({ id: schema.documentProcessingJobs.id });
			assertOwnedProcessingUpdate(lease);
			await tx
				.delete(schema.projectFileChunks)
				.where(eq(schema.projectFileChunks.fileId, job.fileId));
			if (chunks.length)
				await tx
					.insert(schema.projectFileChunks)
					.values(
						chunks.map((chunk) => ({ ...chunk, projectId: job.projectId, fileId: job.fileId }))
					);
			const [updated] = await tx
				.update(schema.projectFiles)
				.set({
					extractionStatus: extraction.extractionStatus,
					pageCount: extraction.pageCount,
					extractionError: extraction.extractionError,
					chunkCount: chunks.length,
					processingStatus: 'processing'
				})
				.where(ownedFileWhere(job))
				.returning({ id: schema.projectFiles.id });
			assertOwnedProcessingUpdate(updated);
		});

		if (leaseLost) throw new DocumentLeaseLostError();
		await assertLease(job);
		const indexing = await indexKnowledgeEmbeddings(job.projectId, job.fileId);
		if (indexing.status === 'unavailable') throw new Error('EMBEDDING_UNAVAILABLE');
		if (leaseLost) throw new DocumentLeaseLostError();
		const [fileUpdated] = await getDb()
			.update(schema.projectFiles)
			.set({ processingStatus: 'succeeded' })
			.where(ownedFileWhere(job))
			.returning({ id: schema.projectFiles.id });
		assertOwnedProcessingUpdate(fileUpdated);
		await finishJob(job, 'succeeded');
		return { status: 'succeeded' as const, indexing };
	} catch (error) {
		if (!(error instanceof DocumentLeaseLostError)) {
			const message = error instanceof Error ? error.message : String(error);
			const [fileUpdated] = await getDb()
				.update(schema.projectFiles)
				.set({
					processingStatus: shouldRetryProcessingJob(job.attempts) ? 'queued' : 'failed',
					extractionError: message
				})
				.where(ownedFileWhere(job))
				.returning({ id: schema.projectFiles.id });
			assertOwnedProcessingUpdate(fileUpdated);
			if (shouldRetryProcessingJob(job.attempts)) {
				const [jobUpdated] = await getDb()
					.update(schema.documentProcessingJobs)
					.set({
						status: 'queued',
						availableAt: new Date(Date.now() + Math.min(job.attempts * 30_000, 300_000)),
						leaseUntil: null,
						workerId: null,
						leaseToken: null,
						lastError: message,
						updatedAt: new Date()
					})
					.where(ownedJobWhere(job))
					.returning({ id: schema.documentProcessingJobs.id });
				assertOwnedProcessingUpdate(jobUpdated);
			} else await finishJob(job, 'failed', error);
		}
		return { status: 'failed' as const, error };
	} finally {
		if (heartbeat) clearInterval(heartbeat);
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
			await new Promise((resolve) => setTimeout(resolve, 2000));
		}
	}
}
