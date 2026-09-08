import 'dotenv/config';
import postgres from 'postgres';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';

const testDatabaseUrl = process.env.TEST_DATABASE_URL;
const integrationState = vi.hoisted(() => {
	const env = new Proxy<Record<string, string | undefined>>(
		{},
		{ get: (_target, property: string) => process.env[property] }
	);
	return { env, embedKnowledge: vi.fn() };
});

vi.mock('$env/dynamic/private', () => ({ env: integrationState.env }));
vi.mock('../src/lib/server/ai/knowledge-embeddings', () => ({
	embedKnowledge: integrationState.embedKnowledge
}));

import { retrieveProjectKnowledge } from '../src/lib/server/ai/knowledge-retrieval';

const describeIntegration = testDatabaseUrl ? describe : describe.skip;
const EMBEDDING_MODEL = 'fixture-embedding-model';
const DIMENSIONS = 1536;

type Fixture = {
	ownerId: string;
	otherOwnerId: string;
	projectId: string;
	otherProjectId: string;
	fileId: string;
	otherFileId: string;
	semanticChunkId: string;
	keywordChunkId: string;
	legacyChunkId: string;
	wrongModelChunkId: string;
	corruptChunkId: string;
};

let sql: ReturnType<typeof postgres> | undefined;
let fixture: Fixture | undefined;

function vectorAt(index: number) {
	const values = new Array(DIMENSIONS).fill(0);
	values[index] = 1;
	return `[${values.join(',')}]`;
}

async function insertChunk(
	chunkId: string,
	projectId: string,
	fileId: string,
	content: string,
	page: number | null,
	vector: string | null,
	model: string | null
) {
	if (!sql) throw new Error('TEST_DATABASE_URL is required');
	if (vector && model) {
		await sql`
			INSERT INTO project_file_chunks (id, project_id, file_id, content, page, embedding, embedding_model)
			VALUES (${chunkId}, ${projectId}, ${fileId}, ${content}, ${page}, ${vector}::vector, ${model})
		`;
		return;
	}
	await sql`
		INSERT INTO project_file_chunks (id, project_id, file_id, content, page, embedding, embedding_model)
		VALUES (${chunkId}, ${projectId}, ${fileId}, ${content}, ${page}, NULL, NULL)
	`;
}

async function createFixture(): Promise<Fixture> {
	if (!sql) throw new Error('TEST_DATABASE_URL is required');
	const value: Fixture = {
		ownerId: crypto.randomUUID(),
		otherOwnerId: crypto.randomUUID(),
		projectId: crypto.randomUUID(),
		otherProjectId: crypto.randomUUID(),
		fileId: crypto.randomUUID(),
		otherFileId: crypto.randomUUID(),
		semanticChunkId: crypto.randomUUID(),
		keywordChunkId: crypto.randomUUID(),
		legacyChunkId: crypto.randomUUID(),
		wrongModelChunkId: crypto.randomUUID(),
		corruptChunkId: crypto.randomUUID()
	};
	await sql`
		INSERT INTO users (id, email, name)
		VALUES (${value.ownerId}, ${`${value.ownerId}@knowledge-fixture.test`}, 'Knowledge fixture owner'),
		       (${value.otherOwnerId}, ${`${value.otherOwnerId}@knowledge-fixture.test`}, 'Knowledge fixture other owner')
	`;
	await sql`
		INSERT INTO projects (id, user_id, name)
		VALUES (${value.projectId}, ${value.ownerId}, 'Knowledge fixture project'),
		       (${value.otherProjectId}, ${value.otherOwnerId}, 'Knowledge fixture other project')
	`;
	await sql`
		INSERT INTO project_files (id, project_id, filename, mime_type, size_bytes, storage_key, extraction_status, chunk_count)
		VALUES (${value.fileId}, ${value.projectId}, 'fixture.pdf', 'application/pdf', 100, ${`${value.fileId}.pdf`}, 'extracted', 5),
		       (${value.otherFileId}, ${value.otherProjectId}, 'other.pdf', 'application/pdf', 100, ${`${value.otherFileId}.pdf`}, 'extracted', 1)
	`;
	await insertChunk(
		value.semanticChunkId,
		value.projectId,
		value.fileId,
		'Unrelated passage about the project boundary.',
		3,
		vectorAt(0),
		EMBEDDING_MODEL
	);
	await insertChunk(
		value.keywordChunkId,
		value.projectId,
		value.fileId,
		'alpha keyword passage for lexical retrieval.',
		4,
		null,
		null
	);
	await insertChunk(
		value.legacyChunkId,
		value.projectId,
		value.fileId,
		'Legacy text with no embedding remains searchable.',
		5,
		null,
		null
	);
	await insertChunk(
		value.wrongModelChunkId,
		value.projectId,
		value.fileId,
		'Wrong model passage must not enter semantic results.',
		6,
		vectorAt(0),
		'old-embedding-model'
	);
	// The separate project/file IDs intentionally model a corrupt chunk whose
	// project_id and file_id disagree. Retrieval must reject it at the join scope.
	await insertChunk(
		value.corruptChunkId,
		value.projectId,
		value.otherFileId,
		'Corrupt cross project passage.',
		7,
		vectorAt(0),
		EMBEDDING_MODEL
	);
	return value;
}

describeIntegration('project knowledge pgvector retrieval', () => {
	beforeAll(async () => {
		if (!testDatabaseUrl) return;
		sql = postgres(testDatabaseUrl, { max: 1, prepare: false });
		const [capabilities] = await sql`
			SELECT to_regtype('vector')::text AS vector_type,
			       to_regclass('public.project_file_chunks')::text AS chunks_table,
			       EXISTS (
						SELECT 1 FROM information_schema.columns
						WHERE table_schema = 'public' AND table_name = 'project_file_chunks' AND column_name = 'embedding'
					) AS has_embedding
		`;
		if (
			capabilities.vector_type !== 'vector' ||
			capabilities.chunks_table !== 'project_file_chunks' ||
			!capabilities.has_embedding
		) {
			throw new Error(
				'TEST_DATABASE_URL must point to a database migrated through the pgvector knowledge migration'
			);
		}
	});

	beforeEach(async () => {
		fixture = await createFixture();
		integrationState.embedKnowledge.mockReset();
		integrationState.embedKnowledge.mockResolvedValue({
			vectors: [Array.from({ length: DIMENSIONS }, (_, index) => (index === 0 ? 1 : 0))],
			identity: EMBEDDING_MODEL
		});
	});

	afterEach(async () => {
		if (!sql || !fixture) return;
		await sql`DELETE FROM projects WHERE id IN (${fixture.projectId}, ${fixture.otherProjectId})`;
		await sql`DELETE FROM users WHERE id IN (${fixture.ownerId}, ${fixture.otherOwnerId})`;
		fixture = undefined;
	});

	afterAll(async () => {
		if (sql) await sql.end({ timeout: 5 });
	});

	it('retrieves a semantically similar passage without lexical overlap', async () => {
		if (!fixture) throw new Error('fixture missing');
		const result = await retrieveProjectKnowledge(
			fixture.projectId,
			fixture.ownerId,
			'conceptual question',
			['conceptual', 'question']
		);

		expect(result.semanticStatus).toBe('available');
		expect(result.usedOverviewFallback).toBe(false);
		expect(result.rows.map((row) => row.id)).toContain(fixture.semanticChunkId);
		expect(result.rows.map((row) => row.id)).not.toContain(fixture.legacyChunkId);
	});

	it('combines keyword and semantic matches and applies the ownership scope', async () => {
		if (!fixture) throw new Error('fixture missing');
		const result = await retrieveProjectKnowledge(fixture.projectId, fixture.ownerId, 'alpha', [
			'alpha'
		]);
		const ids = result.rows.map((row) => row.id);

		expect(ids).toContain(fixture.keywordChunkId);
		expect(ids).toContain(fixture.semanticChunkId);
		expect(ids).not.toContain(fixture.wrongModelChunkId);
		expect(ids).not.toContain(fixture.corruptChunkId);
	});

	it('rejects access by a different owner before embedding', async () => {
		if (!fixture) throw new Error('fixture missing');

		await expect(
			retrieveProjectKnowledge(fixture.projectId, fixture.otherOwnerId, 'alpha', ['alpha'])
		).rejects.toThrow('PROJECT_NOT_FOUND');
		expect(integrationState.embedKnowledge).not.toHaveBeenCalled();
	});

	it('requires the current embedding model identity and keeps legacy null vectors out of semantic results', async () => {
		if (!fixture) throw new Error('fixture missing');
		const result = await retrieveProjectKnowledge(
			fixture.projectId,
			fixture.ownerId,
			'identity check',
			['identity']
		);
		const ids = result.rows.map((row) => row.id);

		expect(ids).toContain(fixture.semanticChunkId);
		expect(ids).not.toContain(fixture.wrongModelChunkId);
		expect(ids).not.toContain(fixture.legacyChunkId);
	});

	it('falls back to keyword retrieval when the embedding provider fails', async () => {
		if (!fixture) throw new Error('fixture missing');
		integrationState.embedKnowledge.mockRejectedValue(new Error('provider unavailable'));
		const warning = vi.spyOn(console, 'warn').mockImplementation(() => {});

		const result = await retrieveProjectKnowledge(fixture.projectId, fixture.ownerId, 'alpha', [
			'alpha'
		]);

		expect(result.semanticStatus).toBe('unavailable');
		expect(result.rows.map((row) => row.id)).toContain(fixture.keywordChunkId);
		expect(warning).toHaveBeenCalled();
		warning.mockRestore();
	});
});
