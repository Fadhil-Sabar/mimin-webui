import { Type } from 'typebox';
import type { AgentTool } from '@earendil-works/pi-agent-core';

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

function htmlText(value: string) {
	return value
		.replace(/<[^>]+>/g, ' ')
		.replace(/&amp;/g, '&')
		.replace(/&quot;/g, '"')
		.replace(/&#x27;|&#39;/g, "'")
		.replace(/\s+/g, ' ')
		.trim();
}

function parseDuckDuckGo(html: string, maxResults: number): WebSearchSource[] {
	const sources: WebSearchSource[] = [];
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
	return sources;
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

	const response = await fetch(targetUrl, {
		headers: { accept: 'text/html', 'user-agent': 'Mimin-WebUI/1.0' },
		signal
	});
	if (!response.ok) throw new Error(`WEB_SEARCH_FAILED_${response.status}`);
	return { answer: null, sources: parseDuckDuckGo(await response.text(), maxResults) };
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
		'user-agent': 'Mimin-WebUI/1.0'
	};
	if (apiKey) headers.authorization = `Bearer ${apiKey}`;

	const response = await fetch(targetUrl, { headers, signal });
	if (!response.ok) throw new Error(`WEB_SEARCH_FAILED_${response.status}`);
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
			'user-agent': 'Mimin-WebUI/1.0'
		};
		if (apiKey) headers.authorization = `Bearer ${apiKey}`;
		const response = await fetch(getUrl, { headers, signal });
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

	const headers: Record<string, string> = { 'content-type': 'application/json' };
	if (apiKey) headers.authorization = `Bearer ${apiKey}`;

	const response = await fetch(endpointUrl, {
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
	if (query.length < 2 || query.length > 500) throw new Error('WEB_SEARCH_INVALID_QUERY');
	const maxResults = Math.min(Math.max(input.maxResults ?? 5, 1), 10);
	const timeout = new AbortController();
	const timer = setTimeout(() => timeout.abort(), 15_000);
	const abort = () => timeout.abort();
	signal?.addEventListener('abort', abort, { once: true });

	try {
		if (provider === 'duckduckgo') {
			return await searchDuckDuckGo(query, maxResults, timeout.signal, customUrl);
		}

		if (provider === 'searxng') {
			try {
				return await searchSearxng(query, maxResults, timeout.signal, customUrl, effectiveApiKey);
			} catch (primaryError) {
				// Automatic runtime fallback to DuckDuckGo if primary fails
				try {
					return await searchDuckDuckGo(query, maxResults, timeout.signal);
				} catch {
					throw primaryError;
				}
			}
		}

		if (!effectiveApiKey && !customUrl) {
			return await searchDuckDuckGo(query, maxResults, timeout.signal);
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
			// Automatic runtime fallback to DuckDuckGo if Tavily / custom endpoint fails
			try {
				return await searchDuckDuckGo(query, maxResults, timeout.signal);
			} catch {
				throw primaryError;
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
			'Use this to search the public web when information may be current, uncertain, niche, or needs verification. Prefer it before answering such questions, and cite the returned source URLs in your response.',
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
