import { Type } from 'typebox';
import type { AgentTool } from '@earendil-works/pi-agent-core';
import { assertAllowedOutboundUrl, OutboundUrlError } from '../../outbound';

const parameters = Type.Object({
	query: Type.String({ minLength: 2, maxLength: 500 }),
	maxResults: Type.Optional(Type.Integer({ minimum: 1, maximum: 10 }))
});

type TavilyResult = { title?: unknown; url?: unknown; content?: unknown };
type TavilyResponse = { answer?: unknown; results?: unknown };
type SearxResponse = { results?: unknown };

export type WebSearchSource = { title: string; url: string; snippet: string };
export type WebSearchResult = { answer: string | null; sources: WebSearchSource[] };

export type WebSearchConfig = {
	apiKey?: string | null;
	searchUrl?: string | null;
	provider?: 'tavily' | 'searxng' | 'duckduckgo' | 'custom' | string | null;
};

async function safeFetch(url: string, init: RequestInit) {
	assertAllowedOutboundUrl(url);
	return fetch(url, { ...init, redirect: 'error' });
}

function searchApiKey() {
	const key = process.env.WEB_SEARCH_API_KEY;
	return key?.trim() || undefined;
}

function asSource(value: unknown): WebSearchSource | null {
	if (!value || typeof value !== 'object') return null;
	const result = value as TavilyResult;
	if (typeof result.url !== 'string' || !/^https?:\/\//i.test(result.url)) return null;
	return {
		title:
			typeof result.title === 'string' && result.title.trim() ? result.title.trim() : result.url,
		url: result.url,
		snippet: typeof result.content === 'string' ? result.content.trim().slice(0, 1200) : ''
	};
}

const BROWSER_USER_AGENT =
	'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36';

function htmlText(value: string) {
	return value
		.replace(/<[^>]+>/g, ' ')
		.replace(/&amp;/g, '&')
		.replace(/&quot;/g, '"')
		.replace(/&#x27;|&#39;/g, "'")
		.replace(/&lt;/g, '<')
		.replace(/&gt;/g, '>')
		.replace(/\s+/g, ' ')
		.trim();
}

function parseDuckDuckGo(html: string, maxResults: number): WebSearchSource[] {
	if (html.includes('internetsehatku') || html.includes('internetpositif')) {
		return [];
	}

	const sources: WebSearchSource[] = [];

	// 1. Match full result blocks if available to extract title + snippet
	const blockPattern =
		/<div class="[^"]*result results_links[^"]*"[\s\S]*?<\/div>\s*<\/div>\s*<\/div>/gi;
	const blocks = Array.from(html.matchAll(blockPattern));

	if (blocks.length > 0) {
		for (const bMatch of blocks) {
			const blockHtml = bMatch[0];
			const titleMatch = blockHtml.match(
				/<a[^>]+class="[^"]*result__a[^"]*"[^>]+href="([^"]+)"[^>]*>([\s\S]*?)<\/a>/i
			);
			if (!titleMatch) continue;
			let url = titleMatch[1];
			try {
				const parsed = new URL(url, 'https://duckduckgo.com');
				url = parsed.searchParams.get('uddg')
					? decodeURIComponent(parsed.searchParams.get('uddg')!)
					: parsed.href;
			} catch {
				continue;
			}
			if (!/^https?:\/\//i.test(url) || sources.some((s) => s.url === url)) continue;

			const snippetMatch = blockHtml.match(
				/<a[^>]+class="[^"]*result__snippet[^"]*"[^>]*>([\s\S]*?)<\/a>/i
			);
			const snippet = snippetMatch ? htmlText(snippetMatch[1]).slice(0, 1200) : '';

			sources.push({
				title: htmlText(titleMatch[2]),
				url,
				snippet
			});
			if (sources.length >= maxResults) break;
		}
	}

	// 2. Fallback to extracting just result__a links if blocks didn't match
	if (sources.length === 0) {
		const pattern = /<a[^>]+class="[^"]*result__a[^"]*"[^>]+href="([^"]+)"[^>]*>([\s\S]*?)<\/a>/gi;
		for (const match of html.matchAll(pattern)) {
			let url = match[1];
			try {
				const parsed = new URL(url, 'https://duckduckgo.com');
				url = parsed.searchParams.get('uddg')
					? decodeURIComponent(parsed.searchParams.get('uddg')!)
					: parsed.href;
			} catch {
				continue;
			}
			if (!/^https?:\/\//i.test(url) || sources.some((source) => source.url === url)) continue;
			sources.push({ title: htmlText(match[2]), url, snippet: '' });
			if (sources.length >= maxResults) break;
		}
	}

	return sources;
}

let cachedDdgIp: string | null = null;
let lastDdgIpFetch = 0;

async function resolveDdgIp(signal?: AbortSignal): Promise<string | null> {
	if (cachedDdgIp && Date.now() - lastDdgIpFetch < 3600_000) {
		return cachedDdgIp;
	}
	const dohEndpoints = [
		'https://cloudflare-dns.com/dns-query?name=html.duckduckgo.com&type=A',
		'https://dns.google/resolve?name=html.duckduckgo.com&type=A'
	];
	for (const endpoint of dohEndpoints) {
		try {
			assertAllowedOutboundUrl(endpoint);
			const res = await fetch(endpoint, {
				headers: { accept: 'application/dns-json' },
				signal: signal ?? AbortSignal.timeout(3000)
			});
			if (!res.ok) continue;
			const data = (await res.json()) as { Answer?: Array<{ type: number; data: string }> };
			const aRecord = data.Answer?.find((a) => a.type === 1);
			if (aRecord?.data && /^(\d{1,3}\.){3}\d{1,3}$/.test(aRecord.data)) {
				cachedDdgIp = aRecord.data;
				lastDdgIpFetch = Date.now();
				return cachedDdgIp;
			}
		} catch {
			// Try next DoH endpoint
		}
	}
	return null;
}

async function searchDuckDuckGo(
	query: string,
	maxResults: number,
	signal?: AbortSignal,
	customUrl?: string
): Promise<WebSearchResult> {
	const targetUrl = customUrl
		? customUrl.includes('{query}')
			? customUrl.replace('{query}', encodeURIComponent(query))
			: `${customUrl}${customUrl.includes('?') ? '&' : '?'}q=${encodeURIComponent(query)}`
		: `https://html.duckduckgo.com/html/?q=${encodeURIComponent(query)}`;

	let html: string | null = null;

	if (!customUrl) {
		// 1. Try standard safeFetch first
		try {
			const response = await safeFetch(targetUrl, {
				headers: { accept: 'text/html,application/xhtml+xml', 'user-agent': BROWSER_USER_AGENT },
				signal
			});
			if (response.ok) {
				const text = await response.text();
				if (!text.includes('internetsehatku') && !text.includes('internetpositif')) {
					html = text;
				}
			}
		} catch {
			// standard fetch failed (e.g. ISP DNS censorship / SSL alert)
		}

		// 2. If standard fetch failed or was blocked by ISP, resolve real IP via DoH
		if (!html) {
			const ddgIp = await resolveDdgIp(signal);
			if (ddgIp) {
				try {
					const ipUrl = `https://${ddgIp}/html/?q=${encodeURIComponent(query)}`;
					const fetchOptions: RequestInit & { tls?: { serverName?: string } } = {
						headers: {
							accept: 'text/html,application/xhtml+xml',
							'user-agent': BROWSER_USER_AGENT,
							Host: 'html.duckduckgo.com'
						},
						signal,
						redirect: 'error',
						tls: { serverName: 'html.duckduckgo.com' }
					};
					const ipResponse = await fetch(ipUrl, fetchOptions as RequestInit);
					if (ipResponse.ok) {
						const text = await ipResponse.text();
						if (!text.includes('internetsehatku') && !text.includes('internetpositif')) {
							html = text;
						}
					}
				} catch {
					// direct IP fetch failed
				}
			}
		}
	} else {
		const response = await safeFetch(targetUrl, {
			headers: { accept: 'text/html', 'user-agent': BROWSER_USER_AGENT },
			signal
		});
		if (!response.ok) throw new Error(`WEB_SEARCH_FAILED_${response.status}`);
		html = await response.text();
	}

	if (!html) throw new Error('WEB_SEARCH_FAILED');
	const sources = parseDuckDuckGo(html, maxResults);
	if (sources.length === 0) throw new Error('WEB_SEARCH_EMPTY_RESULTS');
	return { answer: null, sources };
}

type WikiSearchItem = {
	title: string;
	snippet: string;
};

type WikiSearchResponse = {
	query?: {
		search?: WikiSearchItem[];
	};
};

async function searchWikipedia(
	query: string,
	maxResults: number,
	signal?: AbortSignal
): Promise<WebSearchResult> {
	const targetUrl = `https://en.wikipedia.org/w/api.php?action=query&list=search&srsearch=${encodeURIComponent(query)}&srlimit=${maxResults}&format=json`;
	const response = await safeFetch(targetUrl, {
		headers: {
			accept: 'application/json',
			'user-agent': BROWSER_USER_AGENT
		},
		signal
	});
	if (!response.ok) throw new Error(`WEB_SEARCH_FAILED_${response.status}`);
	const payload = (await response.json()) as WikiSearchResponse;
	const searchItems = Array.isArray(payload.query?.search) ? payload.query!.search : [];
	const sources: WebSearchSource[] = searchItems.map((item) => ({
		title: item.title,
		url: `https://en.wikipedia.org/wiki/${encodeURIComponent(item.title.replace(/\s+/g, '_'))}`,
		snippet: htmlText(item.snippet).slice(0, 1200)
	}));
	return { answer: null, sources };
}

async function searchSearxng(
	query: string,
	maxResults: number,
	signal?: AbortSignal,
	customUrl?: string,
	apiKey?: string
): Promise<WebSearchResult> {
	let targetUrl: string;
	if (customUrl) {
		if (customUrl.includes('{query}')) {
			targetUrl = customUrl.replace('{query}', encodeURIComponent(query));
		} else {
			try {
				const parsed = new URL(customUrl);
				parsed.searchParams.set('q', query);
				if (!parsed.searchParams.has('format')) parsed.searchParams.set('format', 'json');
				targetUrl = parsed.toString();
			} catch {
				targetUrl = `${customUrl}${customUrl.includes('?') ? '&' : '?'}q=${encodeURIComponent(query)}&format=json`;
			}
		}
	} else {
		targetUrl = `https://searx.be/search?q=${encodeURIComponent(query)}&format=json`;
	}

	const headers: Record<string, string> = {
		accept: 'application/json',
		'user-agent': BROWSER_USER_AGENT
	};
	if (apiKey) headers.authorization = `Bearer ${apiKey}`;

	const response = await safeFetch(targetUrl, { headers, signal });
	if (!response.ok) throw new Error(`WEB_SEARCH_FAILED_${response.status}`);
	const contentType = response.headers.get('content-type') ?? '';
	if (!contentType.includes('application/json')) {
		throw new Error('SEARXNG_INVALID_JSON_RESPONSE');
	}
	const payload = (await response.json()) as SearxResponse;
	const rawSources = Array.isArray(payload.results) ? payload.results : [];
	return {
		answer: null,
		sources: rawSources
			.map(asSource)
			.filter((source): source is WebSearchSource => Boolean(source))
			.slice(0, maxResults)
	};
}

async function searchTavilyOrCustom(
	query: string,
	maxResults: number,
	signal?: AbortSignal,
	customUrl?: string,
	apiKey?: string
): Promise<WebSearchResult> {
	const endpointUrl = customUrl || 'https://api.tavily.com/search';

	if (customUrl && customUrl.includes('{query}')) {
		const getUrl = customUrl.replace('{query}', encodeURIComponent(query));
		const headers: Record<string, string> = {
			accept: 'application/json, text/html',
			'user-agent': BROWSER_USER_AGENT
		};
		if (apiKey) headers.authorization = `Bearer ${apiKey}`;
		const response = await safeFetch(getUrl, { headers, signal });
		if (!response.ok) throw new Error(`WEB_SEARCH_FAILED_${response.status}`);
		const contentType = response.headers.get('content-type') ?? '';
		if (contentType.includes('application/json')) {
			const payload = (await response.json()) as TavilyResponse;
			const rawSources = Array.isArray(payload.results) ? payload.results : [];
			return {
				answer:
					typeof payload.answer === 'string' && payload.answer.trim()
						? payload.answer.trim()
						: null,
				sources: rawSources
					.map(asSource)
					.filter((source): source is WebSearchSource => Boolean(source))
					.slice(0, maxResults)
			};
		} else {
			return { answer: null, sources: parseDuckDuckGo(await response.text(), maxResults) };
		}
	}

	const headers: Record<string, string> = {
		'content-type': 'application/json',
		'user-agent': BROWSER_USER_AGENT
	};
	if (apiKey) headers.authorization = `Bearer ${apiKey}`;

	const response = await safeFetch(endpointUrl, {
		method: 'POST',
		headers,
		body: JSON.stringify({
			query,
			topic: 'general',
			search_depth: 'advanced',
			max_results: maxResults,
			include_answer: true
		}),
		signal
	});

	if (!response.ok) throw new Error(`WEB_SEARCH_FAILED_${response.status}`);
	const payload = (await response.json()) as TavilyResponse;
	const rawSources = Array.isArray(payload.results) ? payload.results : [];
	return {
		answer:
			typeof payload.answer === 'string' && payload.answer.trim() ? payload.answer.trim() : null,
		sources: rawSources.map(asSource).filter((source): source is WebSearchSource => Boolean(source))
	};
}

export async function searchWeb(
	input: { query: string; maxResults?: number },
	signal?: AbortSignal,
	config?: WebSearchConfig
): Promise<WebSearchResult> {
	const envSearx = process.env.SEARXNG_URL?.trim();
	const envCustom = process.env.WEB_SEARCH_URL?.trim();
	const effectiveApiKey =
		config?.apiKey !== undefined ? config.apiKey?.trim() || undefined : searchApiKey();
	const customUrl =
		config?.searchUrl !== undefined
			? config.searchUrl?.trim() || undefined
			: envSearx || envCustom || undefined;
	const provider =
		config?.provider ??
		(envSearx && (!config?.searchUrl || customUrl === envSearx)
			? 'searxng'
			: customUrl
				? customUrl.includes('searx')
					? 'searxng'
					: 'custom'
				: effectiveApiKey
					? 'tavily'
					: 'duckduckgo');

	const query = input.query.trim();
	if (customUrl) assertAllowedOutboundUrl(customUrl);
	if (query.length < 2 || query.length > 500) throw new Error('WEB_SEARCH_INVALID_QUERY');
	const maxResults = Math.min(Math.max(input.maxResults ?? 5, 1), 10);
	const timeout = new AbortController();
	const timer = setTimeout(() => timeout.abort(), 15_000);
	const abort = () => timeout.abort();
	signal?.addEventListener('abort', abort, { once: true });

	try {
		if (provider === 'duckduckgo') {
			try {
				return await searchDuckDuckGo(query, maxResults, timeout.signal, customUrl);
			} catch (ddgError) {
				if (customUrl) throw ddgError;
				try {
					return await searchWikipedia(query, maxResults, timeout.signal);
				} catch {
					throw ddgError;
				}
			}
		}

		if (provider === 'searxng') {
			try {
				return await searchSearxng(query, maxResults, timeout.signal, customUrl, effectiveApiKey);
			} catch (primaryError) {
				if (primaryError instanceof OutboundUrlError) throw primaryError;
				// Automatic runtime fallback to DuckDuckGo, then Wikipedia if primary fails
				try {
					return await searchDuckDuckGo(query, maxResults, timeout.signal);
				} catch {
					try {
						return await searchWikipedia(query, maxResults, timeout.signal);
					} catch {
						throw primaryError;
					}
				}
			}
		}

		if (!effectiveApiKey && !customUrl) {
			try {
				return await searchDuckDuckGo(query, maxResults, timeout.signal);
			} catch (ddgError) {
				try {
					return await searchWikipedia(query, maxResults, timeout.signal);
				} catch {
					throw ddgError;
				}
			}
		}

		try {
			return await searchTavilyOrCustom(
				query,
				maxResults,
				timeout.signal,
				customUrl,
				effectiveApiKey
			);
		} catch (primaryError) {
			if (primaryError instanceof OutboundUrlError) throw primaryError;
			// Automatic runtime fallback to DuckDuckGo, then Wikipedia if Tavily / custom endpoint fails
			try {
				return await searchDuckDuckGo(query, maxResults, timeout.signal);
			} catch {
				try {
					return await searchWikipedia(query, maxResults, timeout.signal);
				} catch {
					throw primaryError;
				}
			}
		}
	} finally {
		clearTimeout(timer);
		signal?.removeEventListener('abort', abort);
	}
}

export function createWebSearchTool(
	config?:
		WebSearchConfig | (() => Promise<WebSearchConfig | undefined> | WebSearchConfig | undefined)
): AgentTool<typeof parameters, { sources: WebSearchSource[] }> {
	return {
		name: 'web_search',
		label: 'Web Search',
		description:
			'Use this to search the public web when information may be current, uncertain, niche, or needs verification. Prefer it before answering such questions, and cite the returned source URLs in your response using Markdown links (e.g. [1](url) or [Source Title](url)).',
		parameters,
		execute: async (_toolCallId, params, signal) => {
			const resolvedConfig = typeof config === 'function' ? await config() : config;
			const result = await searchWeb(params, signal, resolvedConfig);
			const sourceText = result.sources.length
				? result.sources
						.map(
							(source, index) =>
								`[${index + 1}] ${source.title}\nURL: ${source.url}\n${source.snippet}`
						)
						.join('\n\n')
				: 'No sources found.';
			return {
				content: [
					{
						type: 'text',
						text: `${result.answer ? `Search answer:\n${result.answer}\n\n` : ''}Sources:\n${sourceText}`
					}
				],
				details: { sources: result.sources }
			};
		}
	};
}
