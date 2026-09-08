import { beforeEach, describe, expect, it, vi } from 'vitest';

const retrievalState = vi.hoisted(() => ({
	db: undefined as unknown,
	embedKnowledge: vi.fn()
}));

vi.mock('../src/lib/server/db/client', async () => {
	const actual = await vi.importActual<typeof import('../src/lib/server/db/client')>(
		'../src/lib/server/db/client'
	);
	return { ...actual, getDb: vi.fn(() => retrievalState.db) };
});

vi.mock('../src/lib/server/ai/knowledge-embeddings', () => ({
	embedKnowledge: retrievalState.embedKnowledge
}));

import { getDb } from '../src/lib/server/db/client';
import {
	escapeLike,
	hybridRank,
	KNOWLEDGE_LIMIT,
	retrieveProjectKnowledge,
	type KnowledgeRow
} from '../src/lib/server/ai/knowledge-retrieval';

function row(id: string, content = id): KnowledgeRow {
	return { id, content, filename: `${id}.txt`, fileId: `file-${id}`, page: null };
}

function queryChain(result: unknown) {
	const chain: Record<string, unknown> = {};
	for (const method of ['from', 'innerJoin', 'where', 'orderBy', 'limit']) {
		chain[method] = vi.fn(() => chain);
	}
	chain.then = (resolve: (value: unknown) => unknown, reject: (reason: unknown) => unknown) =>
		Promise.resolve(result).then(resolve, reject);
	return chain;
}

function mockDb(results: unknown[]) {
	let index = 0;
	const select = vi.fn(() => queryChain(results[index++]));
	retrievalState.db = { select };
	return { select };
}

beforeEach(() => {
	retrievalState.db = undefined;
	retrievalState.embedKnowledge.mockReset();
	vi.mocked(getDb).mockClear();
});

describe('knowledge retrieval ranking helpers', () => {
	it('escapes wildcard and escape characters for LIKE patterns', () => {
		expect(escapeLike(String.raw`100%_ready\now`)).toBe(String.raw`100\%\_ready\\now`);
	});

	it('fuses duplicate keyword and semantic candidates deterministically and applies the limit', () => {
		const result = hybridRank(
			[row('a'), row('a'), row('b'), row('c')],
			[row('c'), row('a'), row('d'), row('e')],
			3
		);

		expect(result.map((candidate) => candidate.id)).toEqual(['a', 'c', 'b']);
		expect(result).toHaveLength(3);
	});

	it('uses lexicographic IDs to break equal reciprocal-rank scores', () => {
		expect(
			hybridRank([row('z')], [row('a')], KNOWLEDGE_LIMIT).map((candidate) => candidate.id)
		).toEqual(['a', 'z']);
	});
});

describe('retrieveProjectKnowledge authorization and fallback behavior', () => {
	it('rejects a missing user before opening the database or embedding query text', async () => {
		await expect(
			retrieveProjectKnowledge('project-1', '', 'question', ['question'])
		).rejects.toThrow('PROJECT_NOT_FOUND');
		expect(getDb).not.toHaveBeenCalled();
		expect(retrievalState.embedKnowledge).not.toHaveBeenCalled();
	});

	it('rejects a project owned by another user before embedding or chunk retrieval', async () => {
		const db = mockDb([[]]);

		await expect(
			retrieveProjectKnowledge('project-1', 'user-2', 'question', ['question'])
		).rejects.toThrow('PROJECT_NOT_FOUND');
		expect(db.select).toHaveBeenCalledOnce();
		expect(retrievalState.embedKnowledge).not.toHaveBeenCalled();
	});

	it('falls back to an overview when embeddings are disabled and keyword search misses', async () => {
		const overview = row('overview', 'Project overview passage');
		mockDb([
			[{ id: 'project-1' }],
			[
				{
					filename: 'overview.pdf',
					mimeType: 'application/pdf',
					extractionStatus: 'extracted',
					chunkCount: 1
				}
			],
			[],
			[overview]
		]);
		retrievalState.embedKnowledge.mockResolvedValue(null);

		const result = await retrieveProjectKnowledge('project-1', 'user-1', 'question', ['question']);

		expect(result.rows).toEqual([overview]);
		expect(result.usedOverviewFallback).toBe(true);
		expect(result.semanticStatus).toBe('disabled');
	});

	it('keeps keyword results when semantic embedding fails', async () => {
		const keyword = row('keyword', 'Lexical match');
		mockDb([[{ id: 'project-1' }], [], [keyword]]);
		retrievalState.embedKnowledge.mockRejectedValue(new Error('provider unavailable'));
		const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});

		const result = await retrieveProjectKnowledge('project-1', 'user-1', 'question', ['question']);

		expect(result.rows).toEqual([keyword]);
		expect(result.usedOverviewFallback).toBe(false);
		expect(result.semanticStatus).toBe('unavailable');
		expect(warn).toHaveBeenCalledWith(
			'[project-knowledge] Semantic retrieval unavailable; using keyword search.'
		);
	});

	it('propagates cancellation before semantic failure can become a fallback', async () => {
		const controller = new AbortController();
		controller.abort();
		mockDb([[{ id: 'project-1' }]]);

		await expect(
			retrieveProjectKnowledge('project-1', 'user-1', 'question', ['question'], controller.signal)
		).rejects.toThrow('Tool cancelled');
		expect(retrievalState.embedKnowledge).not.toHaveBeenCalled();
	});
});
