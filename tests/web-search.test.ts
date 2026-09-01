import { afterEach, describe, expect, it, vi } from 'vitest';
import { createWebSearchTool, searchWeb } from '../src/lib/server/ai/tools/web-search.tool';

afterEach(() => {
	vi.restoreAllMocks();
	delete process.env.WEB_SEARCH_API_KEY;
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
});
