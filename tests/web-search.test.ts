import { afterEach, describe, expect, it, vi } from 'vitest';
import { EventEmitter } from 'node:events';
import https from 'node:https';
import { createWebSearchTool, searchWeb } from '../src/lib/server/ai/tools/web-search.tool';

function stubHttpsResponse(status: number, body: string) {
	const response = new EventEmitter() as EventEmitter & {
		statusCode: number;
		headers: Record<string, string>;
	};
	response.statusCode = status;
	response.headers = { 'content-type': 'text/html' };
	queueMicrotask(() => {
		response.emit('data', body);
		response.emit('end');
	});
	return response;
}

function stubHttpsRequest(status: number, body: string) {
	return vi.spyOn(https, 'request').mockImplementation(((
		options: unknown,
		callback: (response: EventEmitter) => void
	) => {
		const request = new EventEmitter() as EventEmitter & { end: () => void };
		request.end = () => queueMicrotask(() => callback(stubHttpsResponse(status, body)));
		return request;
	}) as typeof https.request);
}

afterEach(() => {
	vi.restoreAllMocks();
	delete process.env.WEB_SEARCH_API_KEY;
	delete process.env.SEARXNG_URL;
	delete process.env.WEB_SEARCH_URL;
	delete process.env.OUTBOUND_ALLOWED_ORIGINS;
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

	it('uses the DoH IP fallback with hostname SNI and parses real result sources', async () => {
		const fetchMock = vi.spyOn(globalThis, 'fetch').mockImplementation(async (url) => {
			if (String(url).includes('duckduckgo.com/html')) throw new Error('ISP DNS/TLS failure');
			if (String(url).includes('cloudflare-dns.com')) {
				return new Response(JSON.stringify({ Answer: [{ type: 1, data: '20.43.161.105' }] }), {
					status: 200
				});
			}
			throw new Error(`Unexpected URL: ${String(url)}`);
		});
		const requestMock = stubHttpsRequest(
			200,
			'<a class="result__a" href="https://bintaro.example/cafe">Cafe Bintaro</a>'
		);

		const result = await searchWeb({ query: 'cafe Bintaro Tangerang Selatan' });

		expect(result.sources).toEqual([
			{ title: 'Cafe Bintaro', url: 'https://bintaro.example/cafe', snippet: '' }
		]);
		expect(fetchMock).toHaveBeenCalledWith(
			expect.stringContaining('cloudflare-dns.com'),
			expect.objectContaining({ headers: { accept: 'application/dns-json' } })
		);
		expect(requestMock).toHaveBeenCalledWith(
			expect.objectContaining({
				hostname: 'html.duckduckgo.com',
				servername: 'html.duckduckgo.com',
				rejectUnauthorized: true,
				headers: expect.objectContaining({ host: 'html.duckduckgo.com' }),
				lookup: expect.any(Function)
			}),
			expect.any(Function)
		);
		const requestOptions = requestMock.mock.calls[0]?.[0] as unknown as {
			lookup: (
				hostname: string,
				options: { all?: boolean },
				callback: (error: Error | null, address: string, family: number) => void
			) => void;
		};
		const lookupResult = await new Promise<{ address: string; family: number }>(
			(resolve, reject) => {
				requestOptions.lookup(
					'html.duckduckgo.com',
					{},
					(error: Error | null, address: string, family: number) => {
						if (error) reject(error);
						else resolve({ address, family });
					}
				);
			}
		);
		expect(lookupResult).toEqual({ address: '20.43.161.105', family: 4 });
	});

	it('rejects an ISP block page and reports an ISP-specific diagnostic', async () => {
		vi.spyOn(globalThis, 'fetch').mockImplementation(async (url) => {
			const value = String(url);
			if (value.includes('duckduckgo.com/html')) {
				return new Response('<html>internetpositif internetsehatku</html>', { status: 200 });
			}
			if (value.includes('wikipedia.org')) {
				return new Response(JSON.stringify({ query: { search: [] } }), { status: 200 });
			}
			throw new Error(`Unexpected URL: ${value}`);
		});
		stubHttpsRequest(200, '<html>internetpositif internetsehatku</html>');

		await expect(searchWeb({ query: 'blocked search' })).rejects.toMatchObject({
			diagnostics: expect.arrayContaining(['DuckDuckGo: blocked by ISP'])
		});
		await expect(searchWeb({ query: 'blocked search' })).rejects.toThrow(/browser_search/);
	});

	it('treats a successful stub response with zero results as a failed engine', async () => {
		vi.spyOn(globalThis, 'fetch').mockImplementation(async (url) => {
			const value = String(url);
			if (value.includes('duckduckgo.com/html')) return new Response('', { status: 202 });
			if (value.includes('wikipedia.org')) {
				return new Response(JSON.stringify({ query: { search: [] } }), { status: 200 });
			}
			throw new Error(`Unexpected URL: ${value}`);
		});
		stubHttpsRequest(202, '');

		await expect(searchWeb({ query: 'stub response' })).rejects.toMatchObject({
			diagnostics: expect.arrayContaining(['DuckDuckGo: zero results', 'Wikipedia: zero results'])
		});
	});

	it('reports a DuckDuckGo anti-bot challenge instead of zero results', async () => {
		const challenge =
			'<html><body>bots use DuckDuckGo too <div class="captcha">Select the duck</div></body></html>';
		vi.spyOn(globalThis, 'fetch').mockImplementation(async (url) => {
			const value = String(url);
			if (value.includes('duckduckgo.com/html')) return new Response(challenge, { status: 202 });
			if (value.includes('cloudflare-dns.com')) {
				return new Response(JSON.stringify({ Answer: [{ type: 1, data: '20.43.161.105' }] }), {
					status: 200
				});
			}
			if (value.includes('wikipedia.org')) {
				return new Response(JSON.stringify({ query: { search: [] } }), { status: 200 });
			}
			throw new Error(`Unexpected URL: ${value}`);
		});
		stubHttpsRequest(202, challenge);

		await expect(searchWeb({ query: 'challenge response' })).rejects.toMatchObject({
			diagnostics: expect.arrayContaining([
				'DuckDuckGo: anti-bot challenge (server IP rate limited)'
			])
		});
		await expect(searchWeb({ query: 'challenge response' })).rejects.not.toMatchObject({
			diagnostics: expect.arrayContaining(['DuckDuckGo: zero results'])
		});
	});

	it('exposes model-facing instructions to verify uncertain or current information', () => {
		const tool = createWebSearchTool();
		expect(tool.name).toBe('web_search');
		expect(tool.description).toMatch(/current|uncertain|verify/i);
	});

	it('supports a custom Tavily endpoint and custom user API key', async () => {
		process.env.OUTBOUND_ALLOWED_ORIGINS = 'https://my-proxy.internal';
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

	it('rejects private user-selected endpoints', async () => {
		const fetchMock = vi
			.spyOn(globalThis, 'fetch')
			.mockRejectedValue(new Error('Unexpected fetch'));
		await expect(
			searchWeb({ query: 'internal probe' }, undefined, {
				provider: 'custom',
				searchUrl: 'http://127.0.0.1:8080/search'
			})
		).rejects.toThrow('OUTBOUND_URL_NOT_ALLOWED');
		expect(fetchMock).not.toHaveBeenCalled();
	});

	it('supports SearXNG search endpoints', async () => {
		process.env.OUTBOUND_ALLOWED_ORIGINS = 'https://searx.example.com';
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

	it('names the missing JSON API when a SearXNG instance answers with HTML', async () => {
		const fetchMock = vi.spyOn(globalThis, 'fetch').mockImplementation(async (url) => {
			const target = new URL(String(url));
			if (target.hostname === 'searx.example.com') {
				return new Response('<!doctype html><html></html>', {
					status: 200,
					headers: { 'content-type': 'text/html' }
				});
			}
			if (target.hostname === 'html.duckduckgo.com') return new Response('', { status: 202 });
			if (target.hostname === 'cloudflare-dns.com' || target.hostname === 'dns.google') {
				return new Response(JSON.stringify({ Answer: [{ type: 1, data: '20.43.161.105' }] }), {
					status: 200
				});
			}
			if (target.hostname === 'en.wikipedia.org') {
				return new Response(JSON.stringify({ query: { search: [] } }), { status: 200 });
			}
			throw new Error(`Unexpected URL: ${target.href}`);
		});
		stubHttpsRequest(202, '');

		await expect(
			searchWeb({ query: 'searx html instance' }, undefined, {
				searchUrl: 'https://searx.example.com/search',
				provider: 'searxng'
			})
		).rejects.toMatchObject({
			diagnostics: expect.arrayContaining([expect.stringMatching(/SearXNG: .*JSON API/)])
		});
		expect(fetchMock).toHaveBeenCalled();
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

	it('reports every exhausted engine and suggests the approved browser fallback', async () => {
		vi.spyOn(globalThis, 'fetch').mockImplementation(async (url) => {
			const value = String(url);
			if (value.includes('duckduckgo.com/html')) return new Response('', { status: 202 });
			if (value.includes('wikipedia.org')) {
				return new Response(JSON.stringify({ query: { search: [] } }), { status: 200 });
			}
			throw new Error(`Unexpected URL: ${value}`);
		});
		stubHttpsRequest(202, '');

		const tool = createWebSearchTool();
		const result = await tool.execute(
			'test-call',
			{ query: 'no results anywhere' },
			new AbortController().signal
		);
		const text = result.content[0]?.type === 'text' ? result.content[0].text : '';
		expect(text).toContain('DuckDuckGo: zero results');
		expect(text).toContain('Wikipedia: zero results');
		expect(text).toContain('browser_search');
		expect(text).toContain("user's approval");
	});

	it('does not add a failure notice to an ordinary successful primary search', async () => {
		process.env.WEB_SEARCH_API_KEY = 'test-search-key';
		vi.spyOn(globalThis, 'fetch').mockResolvedValue(
			new Response(
				JSON.stringify({
					results: [{ title: 'Primary', url: 'https://primary.example', content: 'ok' }]
				}),
				{ status: 200, headers: { 'content-type': 'application/json' } }
			)
		);

		const tool = createWebSearchTool();
		const result = await tool.execute(
			'test-call',
			{ query: 'primary success' },
			new AbortController().signal
		);
		const text = result.content[0]?.type === 'text' ? result.content[0].text : '';
		expect(text).toContain('Primary');
		expect(text).not.toContain('diagnostic');
		expect(text).not.toContain('browser_search');
		expect(text).not.toContain('Wikipedia only');
	});

	it('falls back to Wikipedia if DuckDuckGo fails and marks the result as Wikipedia-only', async () => {
		const fetchMock = vi.spyOn(globalThis, 'fetch').mockImplementation(async (url) => {
			const str = String(url);
			if (str.includes('duckduckgo.com') || str.includes('dns')) {
				throw new Error('Network failure');
			}
			if (str.includes('wikipedia.org')) {
				return new Response(
					JSON.stringify({
						query: {
							search: [
								{
									title: 'TypeScript Programming',
									snippet: 'TypeScript is a strongly typed programming language'
								}
							]
						}
					}),
					{ status: 200, headers: { 'content-type': 'application/json' } }
				);
			}
			throw new Error('Unexpected URL: ' + str);
		});
		stubHttpsRequest(200, '');

		const result = await searchWeb({ query: 'TypeScript Programming' });
		expect(fetchMock).toHaveBeenCalled();
		expect(result.sources).toEqual([
			{
				title: 'TypeScript Programming',
				url: 'https://en.wikipedia.org/wiki/TypeScript_Programming',
				snippet: 'TypeScript is a strongly typed programming language'
			}
		]);
		expect(result.notice).toBe(
			'Notice: Results come from Wikipedia only because the primary search engine was unavailable.'
		);
	});

	it('includes the Wikipedia-only notice in the tool result text', async () => {
		vi.spyOn(globalThis, 'fetch').mockImplementation(async (url) => {
			const str = String(url);
			if (str.includes('duckduckgo.com') || str.includes('dns')) throw new Error('Network failure');
			if (str.includes('wikipedia.org')) {
				return new Response(
					JSON.stringify({
						query: {
							search: [{ title: 'Wikipedia result', snippet: 'Encyclopedic result' }]
						}
					}),
					{ status: 200, headers: { 'content-type': 'application/json' } }
				);
			}
			throw new Error('Unexpected URL: ' + str);
		});
		stubHttpsRequest(200, '');

		const tool = createWebSearchTool();
		const result = await tool.execute(
			'test-call',
			{ query: 'encyclopedic fallback' },
			new AbortController().signal
		);
		const text = result.content[0]?.type === 'text' ? result.content[0].text : '';
		expect(text).toContain(
			'Notice: Results come from Wikipedia only because the primary search engine was unavailable.'
		);
	});
});
