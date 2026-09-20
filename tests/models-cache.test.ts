import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
	invalidateModelsCache,
	loadModelsCached,
	modelsErrorMessage
} from '../src/lib/client/models-cache';

const payload = { models: [{ id: 'gpt-4' }], errors: [{ provider: 'openai', message: 'boom' }] };

function okResponse(body: unknown = payload, etag = '"v1"') {
	return new Response(JSON.stringify(body), {
		status: 200,
		headers: { 'content-type': 'application/json', etag }
	});
}

function notModifiedResponse(etag = '"v1"') {
	return new Response(null, { status: 304, headers: { etag } });
}

describe('models cache', () => {
	beforeEach(() => {
		invalidateModelsCache();
	});

	afterEach(() => {
		vi.unstubAllGlobals();
		vi.useRealTimers();
	});

	it('fetches once and reuses the memoised list', async () => {
		const fetchMock = vi.fn(async () => okResponse());
		vi.stubGlobal('fetch', fetchMock);

		const first = await loadModelsCached();
		const second = await loadModelsCached();

		expect(fetchMock).toHaveBeenCalledTimes(1);
		expect(first.models).toEqual([{ id: 'gpt-4' }]);
		expect(second.models).toEqual(first.models);
	});

	it('shares one request between concurrent callers', async () => {
		const fetchMock = vi.fn(async () => okResponse());
		vi.stubGlobal('fetch', fetchMock);

		await Promise.all([loadModelsCached(), loadModelsCached()]);

		expect(fetchMock).toHaveBeenCalledTimes(1);
	});

	it('revalidates with If-None-Match and keeps the cached body on 304', async () => {
		vi.useFakeTimers();
		const fetchMock = vi
			.fn()
			.mockResolvedValueOnce(okResponse())
			.mockResolvedValueOnce(notModifiedResponse());
		vi.stubGlobal('fetch', fetchMock);

		await loadModelsCached();
		vi.advanceTimersByTime(31_000);
		const revalidated = await loadModelsCached();

		expect(fetchMock).toHaveBeenCalledTimes(2);
		const headers = fetchMock.mock.calls[1][1]?.headers as Record<string, string>;
		expect(headers['If-None-Match']).toBe('"v1"');
		expect(revalidated.models).toEqual([{ id: 'gpt-4' }]);
		expect(revalidated.errors).toEqual([{ provider: 'openai', message: 'boom' }]);
	});

	it('drops the memoised list when invalidated', async () => {
		const fetchMock = vi
			.fn()
			.mockResolvedValueOnce(okResponse())
			.mockResolvedValueOnce(okResponse());
		vi.stubGlobal('fetch', fetchMock);

		await loadModelsCached();
		invalidateModelsCache();
		await loadModelsCached();

		expect(fetchMock).toHaveBeenCalledTimes(2);
		const headers = fetchMock.mock.calls[1][1]?.headers as Record<string, string>;
		expect(headers['If-None-Match']).toBeUndefined();
	});

	it('survives a response without models or errors', async () => {
		vi.stubGlobal(
			'fetch',
			vi.fn(async () => okResponse({}))
		);

		const result = await loadModelsCached();

		expect(result.models).toEqual([]);
		expect(result.errors).toEqual([]);
	});

	it('throws when the endpoint fails', async () => {
		vi.stubGlobal(
			'fetch',
			vi.fn(async () => new Response(null, { status: 500 }))
		);

		await expect(loadModelsCached()).rejects.toThrow('Could not load models');
	});

	it('joins provider discovery failures into one sentence', () => {
		expect(
			modelsErrorMessage({ models: [], errors: [{ message: 'one' }, {}, { message: 'two' }] })
		).toBe('one two');
	});
});
