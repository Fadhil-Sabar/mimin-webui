import { afterEach, describe, expect, it, vi } from 'vitest';
import { createWebSearchTool, searchWeb } from '../src/lib/server/ai/tools/web-search.tool';

afterEach(() => {
	vi.restoreAllMocks();
	delete process.env.WEB_SEARCH_API_KEY;
	delete process.env.SEARXNG_URL;
	delete process.env.WEB_SEARCH_URL;
});

describe('web search', () => {
	it('sends a bounded query to Tavily and normalizes sources', async () => {
		process.env.WEB_SEARCH_API_KEY = 'test-search-key';
		const fetchMock = vi.spyOn(globalThis, 'fetch').mockResolvedValue(
			new Response(
				JSON.stringify({
					answer: 'A concise answer.',
					results: [
						{
							title: 'Example',
							url: 'https://example.com/article',
							content: 'Relevant text',
							score: 0.9
						}
					]
				}),
				{ status: 200, headers: { 'content-type': 'application/json' } }
			)
		);

		const result = await searchWeb({ query: 'latest TypeScript release', maxResults: 5 });
		expect(fetchMock).toHaveBeenCalledWith(
			'https://api.tavily.com/search',
			expect.objectContaining({ method: 'POST', signal: expect.any(AbortSignal) })
		);
		expect(result.answer).toBe('A concise answer.');
		expect(result.sources).toEqual([
			{ title: 'Example', url: 'https://example.com/article', snippet: 'Relevant text' }
		]);
	});

	it('uses a free DuckDuckGo fallback when no API key is configured', async () => {
		const fetchMock = vi.spyOn(globalThis, 'fetch').mockResolvedValue(
			new Response('<a class="result__a" href="https://example.com">Example result</a>', {
				status: 200
			})
		);
		await expect(searchWeb({ query: 'anything' })).resolves.toEqual({
			answer: null,
			sources: [{ title: 'Example result', url: 'https://example.com/', snippet: '' }]
		});
		expect(fetchMock).toHaveBeenCalledWith(
			expect.stringContaining('html.duckduckgo.com/html/?q=anything'),
			expect.objectContaining({ signal: expect.any(AbortSignal) })
		);
	});

	it('exposes model-facing instructions to verify uncertain or current information', () => {
		const tool = createWebSearchTool();
		expect(tool.name).toBe('web_search');
		expect(tool.description).toMatch(/current|uncertain|verify/i);
	});

	it('supports a custom Tavily endpoint and custom user API key', async () => {
		const fetchMock = vi.spyOn(globalThis, 'fetch').mockResolvedValue(
			new Response(
				JSON.stringify({
					answer: 'Custom answer.',
					results: [
						{
							title: 'Custom Source',
							url: 'https://proxy.example.com/item',
							content: 'Proxy content'
						}
					]
				}),
				{ status: 200, headers: { 'content-type': 'application/json' } }
			)
		);

		const result = await searchWeb({ query: 'test proxy search', maxResults: 3 }, undefined, {
			apiKey: 'user-custom-key',
			searchUrl: 'https://my-proxy.internal/v1/search'
		});

		expect(fetchMock).toHaveBeenCalledWith(
			'https://my-proxy.internal/v1/search',
			expect.objectContaining({
				method: 'POST',
				headers: expect.objectContaining({
					authorization: 'Bearer user-custom-key'
				})
			})
		);
		expect(result.answer).toBe('Custom answer.');
		expect(result.sources).toEqual([
			{ title: 'Custom Source', url: 'https://proxy.example.com/item', snippet: 'Proxy content' }
		]);
	});

	it('supports SearXNG search endpoints', async () => {
		const fetchMock = vi.spyOn(globalThis, 'fetch').mockResolvedValue(
			new Response(
				JSON.stringify({
					results: [
						{
							title: 'Searx Result',
							url: 'https://searx.example.com/page',
							content: 'Searx snippet'
						}
					]
				}),
				{ status: 200, headers: { 'content-type': 'application/json' } }
			)
		);

		const result = await searchWeb({ query: 'searx test query' }, undefined, {
			searchUrl: 'https://searx.example.com/search',
			provider: 'searxng'
		});

		expect(fetchMock).toHaveBeenCalledWith(
			expect.stringContaining('https://searx.example.com/search?q=searx+test+query&format=json'),
			expect.objectContaining({
				headers: expect.objectContaining({
					accept: 'application/json'
				})
			})
		);
		expect(result.sources).toEqual([
			{ title: 'Searx Result', url: 'https://searx.example.com/page', snippet: 'Searx snippet' }
		]);
	});

	it('automatically points to SEARXNG_URL when set in environment', async () => {
		process.env.SEARXNG_URL = 'http://localhost:8080/search';
		const fetchMock = vi.spyOn(globalThis, 'fetch').mockResolvedValue(
			new Response(
				JSON.stringify({
					results: [
						{
							title: 'Local Searx',
							url: 'http://localhost:8080/res',
							content: 'Local result'
						}
					]
				}),
				{ status: 200, headers: { 'content-type': 'application/json' } }
			)
		);

		const result = await searchWeb({ query: 'docker test' });
		expect(fetchMock).toHaveBeenCalledWith(
			expect.stringContaining('http://localhost:8080/search?q=docker+test&format=json'),
			expect.any(Object)
		);
		expect(result.sources).toEqual([
			{ title: 'Local Searx', url: 'http://localhost:8080/res', snippet: 'Local result' }
		]);
	});

	it('automatically falls back to DuckDuckGo if primary provider encounters an error', async () => {
		const fetchMock = vi
			.spyOn(globalThis, 'fetch')
			// First call (Tavily) fails with 429 / 500
			.mockResolvedValueOnce(new Response('Rate limited', { status: 429 }))
			// Second call (DuckDuckGo fallback) succeeds
			.mockResolvedValueOnce(
				new Response('<a class="result__a" href="https://fallback.com">Fallback result</a>', {
					status: 200
				})
			);

		const result = await searchWeb({ query: 'test query' }, undefined, {
			apiKey: 'failing-key',
			provider: 'tavily'
		});

		expect(fetchMock).toHaveBeenCalledTimes(2);
		expect(result.sources).toEqual([
			{ title: 'Fallback result', url: 'https://fallback.com/', snippet: '' }
		]);
	});
});
