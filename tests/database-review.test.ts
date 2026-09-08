import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const root = resolve(import.meta.dirname, '..');
const schema = readFileSync(resolve(root, 'src/lib/server/db/schema.ts'), 'utf8');
const trigramMigration = readFileSync(resolve(root, 'drizzle/0014_ambiguous_stingray.sql'), 'utf8');
const processingMigration = readFileSync(resolve(root, 'drizzle/0015_violet_maddog.sql'), 'utf8');

describe('database review regressions', () => {
	it('keeps manually-authored trigram indexes in the Drizzle schema', () => {
		expect(schema).toContain("index('conversations_title_trgm_idx').using(");
		expect(schema).toContain("table.title.op('gin_trgm_ops')");
		expect(schema).toContain("index('messages_content_trgm_idx').using(");
		expect(schema).toContain('(${table.content}::text) gin_trgm_ops');
	});

	it('creates pg_trgm before its indexes and preserves the JSONB text expression', () => {
		expect(
			trigramMigration.indexOf('CREATE EXTENSION IF NOT EXISTS pg_trgm')
		).toBeGreaterThanOrEqual(0);
		expect(trigramMigration.indexOf('CREATE EXTENSION IF NOT EXISTS pg_trgm')).toBeLessThan(
			trigramMigration.indexOf('CREATE INDEX "conversations_title_trgm_idx"')
		);
		expect(trigramMigration).toContain(
			'CREATE INDEX "messages_content_trgm_idx" ON "messages" USING gin (("content"::text) gin_trgm_ops);'
		);
	});

	it('does not mark pre-existing files as queued without a corresponding job', () => {
		expect(processingMigration).toContain(
			'ALTER TABLE "project_files" ADD COLUMN "processing_status" text DEFAULT \'not_started\' NOT NULL;'
		);
		expect(schema).toContain(
			"processingStatus: text('processing_status').notNull().default('not_started')"
		);
	});
});
