import { Type } from 'typebox';
import type { AgentTool } from '@earendil-works/pi-agent-core';

const parameters = Type.Object({
	query: Type.String({ minLength: 2, maxLength: 500 }),
	maxResults: Type.Optional(Type.Integer({ minimum: 1, maximum: 10 }))
});

type TavilyResult = { title?: unknown; url?: unknown; content?: unknown };
type TavilyResponse = { answer?: unknown; results?: unknown };

export type WebSearchSource = { title: string; url: string; snippet: string };
export type WebSearchResult = { answer: string | null; sources: WebSearchSource[] };

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

export async function searchWeb(
	input: { query: string; maxResults?: number },
	signal?: AbortSignal
): Promise<WebSearchResult> {
	const apiKey = searchApiKey();
	const query = input.query.trim();
	if (query.length < 2 || query.length > 500) throw new Error('WEB_SEARCH_INVALID_QUERY');
	const maxResults = Math.min(Math.max(input.maxResults ?? 5, 1), 10);
	const timeout = new AbortController();
	const timer = setTimeout(() => timeout.abort(), 15_000);
	const abort = () => timeout.abort();
	signal?.addEventListener('abort', abort, { once: true });
	try {
		const response = apiKey
			? await fetch('https://api.tavily.com/search', {
					method: 'POST',
					headers: { 'content-type': 'application/json', authorization: `Bearer ${apiKey}` },
					body: JSON.stringify({
						query,
						topic: 'general',
						search_depth: 'advanced',
						max_results: maxResults,
						include_answer: true
					}),
					signal: timeout.signal
				})
			: await fetch(`https://html.duckduckgo.com/html/?q=${encodeURIComponent(query)}`, {
					headers: { accept: 'text/html', 'user-agent': 'Mimin-WebUI/1.0' },
					signal: timeout.signal
				});
		if (!response.ok) throw new Error(`WEB_SEARCH_FAILED_${response.status}`);
		if (!apiKey)
			return { answer: null, sources: parseDuckDuckGo(await response.text(), maxResults) };
		const payload = (await response.json()) as TavilyResponse;
		const rawSources = Array.isArray(payload.results) ? payload.results : [];
		return {
			answer:
				typeof payload.answer === 'string' && payload.answer.trim() ? payload.answer.trim() : null,
			sources: rawSources
				.map(asSource)
				.filter((source): source is WebSearchSource => Boolean(source))
		};
	} finally {
		clearTimeout(timer);
		signal?.removeEventListener('abort', abort);
	}
}

export function createWebSearchTool(): AgentTool<
	typeof parameters,
	{ sources: WebSearchSource[] }
> {
	return {
		name: 'web_search',
		label: 'Web Search',
		description:
			'Use this to search the public web when information may be current, uncertain, niche, or needs verification. Prefer it before answering such questions, and cite the returned source URLs in your response.',
		parameters,
		execute: async (_toolCallId, params, signal) => {
			const result = await searchWeb(params, signal);
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
