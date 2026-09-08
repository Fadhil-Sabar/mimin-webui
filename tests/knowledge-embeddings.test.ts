import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const embeddingEnv = vi.hoisted(() => ({}) as Record<string, string | undefined>);

vi.mock('$env/dynamic/private', () => ({ env: embeddingEnv }));

import {
	EMBEDDING_DIMENSIONS,
	embedKnowledge,
	embeddingConfig,
	validateEmbedding
} from '../src/lib/server/ai/knowledge-embeddings';

const endpoint = 'https://embeddings.example.test/v1/embeddings';
const apiKey = 'sk-test-embedding-secret';

function validEmbedding(value = 0.25) {
	return Array.from({ length: EMBEDDING_DIMENSIONS }, (_, index) => (index === 0 ? value : 0));
}

function embeddingResponse(data: Array<{ index: number; embedding: unknown }>) {
	return new Response(JSON.stringify({ data }), {
		headers: { 'Content-Type': 'application/json' }
	});
}

function enableEmbeddings() {
	embeddingEnv.KNOWLEDGE_EMBEDDINGS_ENABLED = 'true';
	embeddingEnv.KNOWLEDGE_EMBEDDING_URL = endpoint;
	embeddingEnv.KNOWLEDGE_EMBEDDING_API_KEY = apiKey;
}

beforeEach(() => {
	for (const key of Object.keys(embeddingEnv)) delete embeddingEnv[key];
});

afterEach(() => {
	vi.restoreAllMocks();
});

describe('knowledge embeddings configuration', () => {
	it('is disabled by default and does not call the provider', async () => {
		const fetcher = vi.spyOn(globalThis, 'fetch');

		expect(embeddingConfig()).toBeNull();
		expect(await embedKnowledge(['project text'])).toBeNull();
		expect(fetcher).not.toHaveBeenCalled();
	});

	it('requires a credential before sending project content', async () => {
		embeddingEnv.KNOWLEDGE_EMBEDDINGS_ENABLED = 'true';
		embeddingEnv.KNOWLEDGE_EMBEDDING_URL = endpoint;
		const fetcher = vi.spyOn(globalThis, 'fetch');

		await expect(embedKnowledge(['private project text'])).rejects.toThrow(
			'KNOWLEDGE_EMBEDDING_KEY_MISSING'
		);
		expect(fetcher).not.toHaveBeenCalled();
	});

	it('blocks an unsafe endpoint before sending credentials', async () => {
		embeddingEnv.KNOWLEDGE_EMBEDDINGS_ENABLED = 'true';
		embeddingEnv.KNOWLEDGE_EMBEDDING_URL = 'http://127.0.0.1:8080/v1/embeddings';
		embeddingEnv.KNOWLEDGE_EMBEDDING_API_KEY = apiKey;
		const fetcher = vi.spyOn(globalThis, 'fetch');

		await expect(embedKnowledge(['private project text'])).rejects.toThrow(
			'OUTBOUND_URL_NOT_ALLOWED'
		);
		expect(fetcher).not.toHaveBeenCalled();
	});
});

describe('embedKnowledge', () => {
	it('sends a bounded batch and returns vectors in input order', async () => {
		enableEmbeddings();
		const fetcher = vi.spyOn(globalThis, 'fetch').mockResolvedValue(
			embeddingResponse([
				{ index: 1, embedding: validEmbedding(0.5) },
				{ index: 0, embedding: validEmbedding(0.25) }
			])
		);

		const result = await embedKnowledge(['first project passage', 'second project passage']);

		expect(result?.vectors).toHaveLength(2);
		expect(result?.vectors[0][0]).toBe(0.25);
		expect(result?.vectors[1][0]).toBe(0.5);
		expect(fetcher).toHaveBeenCalledWith(
			endpoint,
			expect.objectContaining({
				method: 'POST',
				redirect: 'error',
				headers: {
					Authorization: `Bearer ${apiKey}`,
					'Content-Type': 'application/json'
				},
				body: JSON.stringify({
					model: 'text-embedding-3-small',
					input: ['first project passage', 'second project passage'],
					dimensions: EMBEDDING_DIMENSIONS,
					encoding_format: 'float'
				})
			})
		);
	});

	it.each([0, 33])('rejects a batch with %s input items', async (size) => {
		enableEmbeddings();
		const fetcher = vi.spyOn(globalThis, 'fetch');

		await expect(embedKnowledge(Array.from({ length: size }, () => 'text'))).rejects.toThrow(
			'KNOWLEDGE_EMBEDDING_INPUT_INVALID'
		);
		expect(fetcher).not.toHaveBeenCalled();
	});

	it('reports provider failures without exposing the API key or response body', async () => {
		enableEmbeddings();
		const providerBody = `upstream rejected ${apiKey}`;
		vi.spyOn(globalThis, 'fetch').mockResolvedValue(
			new Response(providerBody, { status: 401, statusText: 'Unauthorized' })
		);

		const failure = await embedKnowledge(['private project passage']).catch(
			(error: unknown) => error
		);

		expect(failure).toBeInstanceOf(Error);
		expect((failure as Error).message).toBe('KNOWLEDGE_EMBEDDING_HTTP_401');
		expect((failure as Error).message).not.toContain(apiKey);
		expect((failure as Error).message).not.toContain(providerBody);
	});

	it.each([
		{
			label: 'wrong vector dimensions',
			data: [{ index: 0, embedding: validEmbedding().slice(0, -1) }]
		},
		{
			label: 'duplicate index',
			data: [
				{ index: 0, embedding: validEmbedding() },
				{ index: 0, embedding: validEmbedding() }
			]
		},
		{ label: 'negative index', data: [{ index: -1, embedding: validEmbedding() }] },
		{ label: 'out of range index', data: [{ index: 1, embedding: validEmbedding() }] },
		{ label: 'fractional index', data: [{ index: 0.5, embedding: validEmbedding() }] }
	])('rejects malformed provider data ($label)', async ({ data }) => {
		enableEmbeddings();
		vi.spyOn(globalThis, 'fetch').mockResolvedValue(embeddingResponse(data));

		await expect(embedKnowledge(['one', ...(data.length > 1 ? ['two'] : [])])).rejects.toThrow(
			'KNOWLEDGE_EMBEDDING_RESPONSE_INVALID'
		);
	});

	it('rejects non-finite or all-zero vectors', () => {
		const nonFinite = validEmbedding();
		nonFinite[5] = Number.NaN;
		const infinite = validEmbedding();
		infinite[5] = Number.POSITIVE_INFINITY;
		const allZero = Array.from({ length: EMBEDDING_DIMENSIONS }, () => 0);

		expect(validateEmbedding(nonFinite)).toBe(false);
		expect(validateEmbedding(infinite)).toBe(false);
		expect(validateEmbedding(allZero)).toBe(false);
		expect(validateEmbedding(validEmbedding())).toBe(true);
	});

	it('honors an aborted caller signal', async () => {
		enableEmbeddings();
		const controller = new AbortController();
		controller.abort();
		const fetcher = vi.spyOn(globalThis, 'fetch').mockImplementation((_input, init) => {
			expect(init?.signal?.aborted).toBe(true);
			return Promise.reject(init?.signal?.reason ?? new DOMException('aborted', 'AbortError'));
		});

		await expect(
			embedKnowledge(['cancelled project passage'], controller.signal)
		).rejects.toMatchObject({
			name: 'AbortError'
		});
		expect(fetcher).toHaveBeenCalledOnce();
	});
});
