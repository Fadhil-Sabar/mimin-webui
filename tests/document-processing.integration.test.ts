import 'dotenv/config';
import postgres from 'postgres';
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';
import {
	claimDocumentProcessingJob,
	MAX_PROCESSING_ATTEMPTS,
	renewDocumentProcessingLease
} from '../src/lib/server/files/document-processing';

const testDatabaseUrl = process.env.TEST_DATABASE_URL;
const describeIntegration = testDatabaseUrl ? describe : describe.skip;

type Fixture = {
	userId: string;
	projectId: string;
	fileId: string;
};

let sql: ReturnType<typeof postgres> | undefined;
let fixture: Fixture | undefined;

async function createFixture() {
	if (!sql) throw new Error('TEST_DATABASE_URL is required');
	const value = {
		userId: crypto.randomUUID(),
		projectId: crypto.randomUUID(),
		fileId: crypto.randomUUID()
	};
	await sql`
		INSERT INTO users (id, email, name)
		VALUES (${value.userId}, ${`${value.userId}@document-fixture.test`}, 'Document fixture owner')
	`;
	await sql`
		INSERT INTO projects (id, user_id, name)
		VALUES (${value.projectId}, ${value.userId}, 'Document fixture project')
	`;
	await sql`
		INSERT INTO project_files (id, project_id, filename, mime_type, size_bytes, storage_key)
		VALUES (${value.fileId}, ${value.projectId}, 'fixture.txt', 'text/plain', 10, ${`${value.fileId}.txt`})
	`;
	fixture = value;
	return value;
}

async function insertJob(
	status: 'queued' | 'processing',
	attempts: number,
	leaseUntil: Date | null = null
) {
	if (!sql || !fixture) throw new Error('fixture missing');
	const [job] = await sql`
		INSERT INTO document_processing_jobs (project_id, file_id, status, attempts, available_at, lease_until, worker_id, lease_token)
		VALUES (${fixture.projectId}, ${fixture.fileId}, ${status}, ${attempts}, now(), ${leaseUntil}, 'old-worker', 'old-token')
		RETURNING id
	`;
	return job.id as string;
}

describeIntegration('document processing PostgreSQL leases', () => {
	beforeAll(async () => {
		if (!testDatabaseUrl) return;
		sql = postgres(testDatabaseUrl, { max: 2, prepare: false });
		const [capabilities] = await sql`
			SELECT to_regclass('public.document_processing_jobs')::text AS jobs_table,
			       to_regclass('public.project_files')::text AS files_table,
			       EXISTS (
					SELECT 1 FROM information_schema.columns
						WHERE table_name = 'document_processing_jobs' AND column_name = 'lease_token'
				) AS has_lease_token
		`;
		if (
			capabilities.jobs_table !== 'document_processing_jobs' ||
			capabilities.files_table !== 'project_files' ||
			!capabilities.has_lease_token
		) {
			throw new Error('TEST_DATABASE_URL must point to a fully migrated database');
		}
	});

	afterEach(async () => {
		if (!sql || !fixture) return;
		await sql`DELETE FROM projects WHERE id = ${fixture.projectId}`;
		await sql`DELETE FROM users WHERE id = ${fixture.userId}`;
		fixture = undefined;
	});

	afterAll(async () => {
		if (sql) await sql.end({ timeout: 5 });
	});

	it('does not claim a queued job at the maximum attempt count', async () => {
		await createFixture();
		await insertJob('queued', MAX_PROCESSING_ATTEMPTS);

		expect(await claimDocumentProcessingJob(crypto.randomUUID())).toBeNull();
	});

	it('claims an expired lease and fences the stale worker by affected rows', async () => {
		await createFixture();
		await insertJob('processing', 1, new Date(Date.now() - 1_000));
		const newWorkerId = crypto.randomUUID();

		const claimed = await claimDocumentProcessingJob(newWorkerId);

		expect(claimed).not.toBeNull();
		expect(claimed?.attempts).toBe(2);
		expect(claimed?.workerId).toBe(newWorkerId);
		expect(
			await renewDocumentProcessingLease({
				id: claimed!.id,
				projectId: claimed!.projectId,
				fileId: claimed!.fileId,
				attempts: claimed!.attempts,
				workerId: crypto.randomUUID(),
				leaseToken: 'old-token'
			})
		).toBe(false);
		expect(await renewDocumentProcessingLease(claimed!)).toBe(true);
	});
});
