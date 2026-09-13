import { Type } from 'typebox';
import type { AgentTool } from '@earendil-works/pi-agent-core';
import { lookup } from 'node:dns/promises';
import { isIP } from 'node:net';
import { assertAllowedOutboundUrl, isPrivateHostname, OutboundUrlError } from '../../outbound';
import {
	expectPageResult,
	requestBrowserAction,
	type BrowserBridgeContext,
	type BrowserBridgeEvent
} from '../../browser/bridge';

const parameters = Type.Object({
	url: Type.String({ minLength: 8, maxLength: 2048 }),
	maxChars: Type.Optional(Type.Integer({ minimum: 500, maximum: 50_000 }))
});

export const WEB_FETCH_MAX_BYTES = 2 * 1024 * 1024;
export const WEB_FETCH_DEFAULT_MAX_CHARS = 12_000;
export const WEB_FETCH_MAX_CHARS = 50_000;
export const WEB_FETCH_MAX_REDIRECTS = 5;
const TIMEOUT_MS = 15_000;
const REDIRECT_STATUSES = new Set([301, 302, 303, 307, 308]);
/** The same browser user agent web_search uses; unknown bots are served challenges or empty pages. */
const USER_AGENT =
	'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36';
const SPARSE_PAGE_NOTICE =
	'Notice: the page returned no readable text. If it builds its content with JavaScript, web_fetch cannot run that; read it with the browser bridge instead.';
/** Below this much readable text, a script-heavy document is almost certainly an app shell. */
const CLIENT_RENDERED_TEXT_THRESHOLD = 200;
const APP_SHELL_PATTERN =
	/<(?:div|main|section)[^>]+(?:id|class)=["'][^"']*(?:root|app|__next|__nuxt|svelte)[^"']*["'][^>]*>\s*<\/(?:div|main|section)>/i;
const NOSCRIPT_REQUIRES_SCRIPT =
	/<noscript[^>]*>[\s\S]{0,400}?(?:enable|requires?|aktifkan|javascript)/i;

export type WebFetchResult = {
	url: string;
	title: string | null;
	contentType: string;
	text: string;
	truncated: boolean;
	notice?: string;
	/** True when the HTML looks like a shell that only JavaScript can fill in. */
	clientRendered?: boolean;
	clientRenderedReason?: string;
};

export type ClientRenderedSignal = { clientRendered: boolean; reason?: string };

/**
 * Decide whether a response is a JavaScript shell rather than content.
 *
 * The check is deliberately conservative: a false positive only costs one browser
 * round trip, while a false negative leaves the agent reading "Loading…" as if it
 * were the page.
 */
export function detectClientRenderedPage(html: string, text: string): ClientRenderedSignal {
	if (!html.trimStart().startsWith('<')) return { clientRendered: false };

	if (NOSCRIPT_REQUIRES_SCRIPT.test(html))
		return {
			clientRendered: true,
			reason: 'The page states that it needs JavaScript enabled in a browser.'
		};

	if (text.length >= CLIENT_RENDERED_TEXT_THRESHOLD) return { clientRendered: false };

	if (APP_SHELL_PATTERN.test(html))
		return {
			clientRendered: true,
			reason: 'The HTML contains an empty application root element instead of content.'
		};

	const scriptBytes = (html.match(/<script\b[\s\S]*?<\/script>/gi) ?? []).join('').length;
	if (scriptBytes > Math.max(2_000, html.length * 0.15))
		return {
			clientRendered: true,
			reason: 'Almost all of the HTML is script tags, with little readable text.'
		};

	return { clientRendered: false };
}

export class WebFetchError extends Error {
	constructor(
		public readonly code: string,
		message: string
	) {
		super(
			`WEB_FETCH_FAILED (${code}): ${message} Do not describe or summarize this page from memory; tell the user it could not be read.`
		);
		this.name = 'WebFetchError';
	}
}

type FetchLike = (input: string, init: RequestInit) => Promise<Response>;

export type WebFetchOptions = {
	signal?: AbortSignal;
	fetcher?: FetchLike;
	lookupHost?: (hostname: string) => Promise<string[]>;
};

const DROPPED_ELEMENTS =
	/<(head|title|script|style|noscript|template|svg|iframe|canvas|nav|aside|footer|button|select)\b[^>]*>[\s\S]*?<\/\1\s*>/gi;
const BLOCK_BOUNDARY =
	/<\/(?:p|div|section|article|main|header|li|ul|ol|tr|table|thead|tbody|tfoot|h[1-6]|blockquote|pre|figure|figcaption|dd|dt|dl|form)\s*>|<br\s*\/?>/gi;

const NAMED_ENTITIES: Record<string, string> = {
	amp: '&',
	lt: '<',
	gt: '>',
	quot: '"',
	apos: "'",
	nbsp: ' ',
	ndash: '–',
	mdash: '—',
	hellip: '…',
	middot: '·',
	bull: '•',
	lsquo: '‘',
	rsquo: '’',
	ldquo: '“',
	rdquo: '”',
	laquo: '«',
	raquo: '»',
	copy: '©',
	reg: '®',
	trade: '™',
	deg: '°',
	times: '×'
};

function fromCodePoint(value: number) {
	if (!Number.isFinite(value) || value < 0 || value > 0x10ffff) return '';
	try {
		return String.fromCodePoint(value);
	} catch {
		return '';
	}
}

export function decodeEntities(value: string) {
	return value
		.replace(/&#(\d+);/g, (_match, code: string) => fromCodePoint(Number(code)))
		.replace(/&#x([0-9a-f]+);/gi, (_match, code: string) => fromCodePoint(parseInt(code, 16)))
		.replace(
			/&([a-z][a-z0-9]*);/gi,
			(match, name: string) => NAMED_ENTITIES[name.toLowerCase()] ?? match
		);
}

/** Convert an HTML document into plain readable text, keeping block boundaries as line breaks. */
export function htmlToReadableText(html: string) {
	const text = decodeEntities(
		html
			.replace(/<!--[\s\S]*?-->/g, ' ')
			.replace(DROPPED_ELEMENTS, ' ')
			.replace(BLOCK_BOUNDARY, '\n')
			.replace(/<[^>]*>/g, ' ')
	).replace(/\u00a0/g, ' ');

	return text
		.replace(/\r\n?/g, '\n')
		.split('\n')
		.map((line) => line.replace(/[ \t\f\v]+/g, ' ').trim())
		.join('\n')
		.replace(/\n{3,}/g, '\n\n')
		.trim();
}

export function extractHtmlTitle(html: string) {
	const match = html.match(/<title[^>]*>([\s\S]*?)<\/title>/i);
	if (!match) return null;
	return decodeEntities(match[1]).replace(/\s+/g, ' ').trim() || null;
}

async function defaultLookupHost(hostname: string) {
	const records = await lookup(hostname, { all: true });
	return records.map((record) => record.address);
}

function decodeBody(bytes: Buffer, contentType: string) {
	const charset = /charset\s*=\s*["']?([\w-]+)/i.exec(contentType)?.[1];
	if (charset && !/^utf-?8$/i.test(charset)) {
		try {
			return new TextDecoder(charset).decode(bytes);
		} catch {
			// Unknown label: fall through to UTF-8.
		}
	}
	return new TextDecoder('utf-8').decode(bytes);
}

type BodyKind = 'html' | 'json' | 'text' | 'binary';

export function classifyContentType(contentType: string, body: string): BodyKind {
	const type = contentType.split(';')[0].trim().toLowerCase();
	if (type === 'text/html' || type === 'application/xhtml+xml') return 'html';
	if (/\bjson\b/.test(type)) return 'json';
	if (
		type.startsWith('text/') ||
		type === 'application/xml' ||
		type.endsWith('+xml') ||
		type === 'application/javascript'
	) {
		return 'text';
	}
	if (!type || type === 'application/octet-stream') {
		if (body.includes('\u0000')) return 'binary';
		return body.trimStart().startsWith('<') ? 'html' : 'text';
	}
	return 'binary';
}

function prettyJson(value: string) {
	try {
		return JSON.stringify(JSON.parse(value), null, 2);
	} catch {
		return value;
	}
}

function timeoutError() {
	return new WebFetchError('WEB_FETCH_TIMEOUT', 'The page did not respond in time.');
}

function normalizeError(error: unknown) {
	if (error instanceof WebFetchError) return error;
	if (error instanceof OutboundUrlError) {
		return new WebFetchError('WEB_FETCH_URL_NOT_ALLOWED', error.message);
	}
	if (error instanceof Error && error.name === 'AbortError') return timeoutError();
	return new WebFetchError('WEB_FETCH_UNAVAILABLE', 'The page could not be reached.');
}

/** Read at most `limit` bytes, so a large or endless response cannot exhaust memory. */
async function readBounded(response: Response, limit: number) {
	if (!response.body) return { bytes: Buffer.alloc(0), truncated: false };
	const declared = Number(response.headers.get('content-length') ?? '');
	const reader = response.body.getReader();
	const chunks: Buffer[] = [];
	let read = 0;
	let truncated = false;

	for (;;) {
		const { done, value } = await reader.read();
		if (done) break;
		if (!value) continue;
		if (read + value.byteLength > limit) {
			chunks.push(Buffer.from(value.subarray(0, limit - read)));
			truncated = true;
			await reader.cancel().catch(() => undefined);
			break;
		}
		chunks.push(Buffer.from(value));
		read += value.byteLength;
	}

	return {
		bytes: Buffer.concat(chunks),
		truncated: truncated || (Number.isFinite(declared) && declared > limit)
	};
}

type RequestDeps = {
	fetcher: FetchLike;
	lookupHost: (hostname: string) => Promise<string[]>;
	signal: AbortSignal;
};

/**
 * Follow redirects one hop at a time so every hop is validated: an allowed public URL must not
 * be able to bounce the request into a private address. The hostname is also resolved first,
 * because a name that looks public can still point at loopback or a metadata service.
 */
async function requestWithRedirects(startUrl: string, deps: RequestDeps) {
	let current = startUrl;

	for (let redirects = 0; ;) {
		let url: URL;
		try {
			assertAllowedOutboundUrl(current);
			url = new URL(current);
		} catch (error) {
			if (error instanceof OutboundUrlError) {
				throw new WebFetchError('WEB_FETCH_URL_NOT_ALLOWED', error.message);
			}
			throw new WebFetchError('WEB_FETCH_INVALID_URL', 'That is not a valid http(s) URL.');
		}
		if (isPrivateHostname(url.hostname)) {
			throw new WebFetchError(
				'WEB_FETCH_PRIVATE_ADDRESS',
				'web_fetch only reads public pages, and that address is a private, loopback, or link-local host.'
			);
		}
		if (!isIP(url.hostname.replace(/^\[|\]$/g, ''))) {
			let addresses: string[];
			try {
				addresses = await deps.lookupHost(url.hostname);
			} catch {
				throw new WebFetchError(
					'WEB_FETCH_DNS_FAILED',
					`The host ${url.hostname} could not be resolved.`
				);
			}
			if (addresses.length === 0) {
				throw new WebFetchError(
					'WEB_FETCH_DNS_FAILED',
					`The host ${url.hostname} could not be resolved.`
				);
			}
			if (addresses.some(isPrivateHostname)) {
				throw new WebFetchError(
					'WEB_FETCH_PRIVATE_ADDRESS',
					`The host ${url.hostname} resolves to a private or local address.`
				);
			}
		}

		const response = await deps.fetcher(current, {
			redirect: 'manual',
			headers: {
				accept:
					'text/html,application/xhtml+xml,application/json,text/plain;q=0.9,application/xml;q=0.8,*/*;q=0.5',
				'accept-language': 'en-US,en;q=0.9,id;q=0.8',
				'user-agent': USER_AGENT
			},
			signal: deps.signal
		});

		if (!REDIRECT_STATUSES.has(response.status)) return { response, url: response.url || current };

		const location = response.headers.get('location');
		await response.body?.cancel().catch(() => undefined);
		if (!location) {
			throw new WebFetchError('WEB_FETCH_BAD_REDIRECT', 'The page redirected without a target.');
		}
		try {
			current = new URL(location, current).href;
		} catch {
			throw new WebFetchError('WEB_FETCH_BAD_REDIRECT', 'The page redirected to an invalid URL.');
		}
		redirects += 1;
		if (redirects > WEB_FETCH_MAX_REDIRECTS) {
			throw new WebFetchError(
				'WEB_FETCH_TOO_MANY_REDIRECTS',
				`The page redirected more than ${WEB_FETCH_MAX_REDIRECTS} times.`
			);
		}
	}
}

export async function fetchWebPage(
	input: { url: string; maxChars?: number },
	options: WebFetchOptions = {}
): Promise<WebFetchResult> {
	const maxChars = Math.min(
		Math.max(input.maxChars ?? WEB_FETCH_DEFAULT_MAX_CHARS, 500),
		WEB_FETCH_MAX_CHARS
	);
	const controller = new AbortController();
	const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
	const abort = () => controller.abort();
	options.signal?.addEventListener('abort', abort, { once: true });

	try {
		const { response, url } = await requestWithRedirects(input.url.trim(), {
			fetcher: options.fetcher ?? ((target, init) => fetch(target, init)),
			lookupHost: options.lookupHost ?? defaultLookupHost,
			signal: controller.signal
		});
		if (!response.ok) {
			throw new WebFetchError(
				'WEB_FETCH_HTTP_STATUS',
				`The page responded with HTTP ${response.status}.`
			);
		}

		const contentType = response.headers.get('content-type') ?? '';
		const { bytes, truncated: bytesTruncated } = await readBounded(response, WEB_FETCH_MAX_BYTES);
		const raw = decodeBody(bytes, contentType);
		if (bytesTruncated) {
			throw new WebFetchError(
				'WEB_FETCH_TOO_LARGE',
				`The page is larger than ${Math.floor(WEB_FETCH_MAX_BYTES / 1024 / 1024)} MB, which web_fetch does not read in full.`
			);
		}

		const kind = classifyContentType(contentType, raw);
		if (kind === 'binary') {
			throw new WebFetchError(
				'WEB_FETCH_UNSUPPORTED_CONTENT',
				`web_fetch reads HTML, JSON, and text. That URL returned ${contentType || 'an unknown binary type'}; download the file and attach it instead.`
			);
		}

		const title = kind === 'html' ? extractHtmlTitle(raw) : null;
		const text = (
			kind === 'html' ? htmlToReadableText(raw) : kind === 'json' ? prettyJson(raw) : raw
		)
			.replace(/\r\n?/g, '\n')
			.trim();

		const truncated = text.length > maxChars;
		const content = truncated ? text.slice(0, maxChars) : text;
		const clientRendered = kind === 'html' ? detectClientRenderedPage(raw, text) : undefined;
		return {
			url,
			title,
			contentType: contentType.split(';')[0].trim() || 'unknown',
			text: content,
			truncated,
			...(clientRendered?.clientRendered
				? { clientRendered: true, clientRenderedReason: clientRendered.reason }
				: {}),
			...(content ? {} : { notice: SPARSE_PAGE_NOTICE })
		};
	} catch (error) {
		throw normalizeError(error);
	} finally {
		clearTimeout(timer);
		options.signal?.removeEventListener('abort', abort);
	}
}

/** The browser bridge a fetch may borrow when a page only JavaScript can fill in. */
export type WebFetchBridge = {
	context: BrowserBridgeContext;
	emit: (event: BrowserBridgeEvent) => void;
};

const NO_BRIDGE_NOTICE =
	'Notice: this page renders its content with JavaScript and web_fetch cannot run scripts. Ask the user to connect the browser extension under Settings > Browser Extension, then read the page with browser_open, or ask them to paste the content you need. Do not guess what the page says.';

const BRIDGE_FAILED_NOTICE =
	'Notice: this page renders its content with JavaScript. Reading it through the browser bridge did not work (the extension may be disconnected and no tab may have opened, or the user declined). Tell the user what is blocked instead of guessing the page contents.';

type BrowserReadResult = { text: string; title: string | null };

async function readThroughBridge(
	url: string,
	bridge: WebFetchBridge,
	signal?: AbortSignal
): Promise<BrowserReadResult | null> {
	const result = expectPageResult(
		await requestBrowserAction(bridge.context, 'browser_open', { url }, bridge.emit, signal)
	);
	const text = (result.text ?? '').trim();
	if (!text) return null;
	return { text, title: result.title ?? null };
}

export function createWebFetchTool(
	bridge?: WebFetchBridge
): AgentTool<
	typeof parameters,
	{ url: string; title: string; contentType: string; truncated: boolean; renderedBy: string }
> {
	return {
		name: 'web_fetch',
		label: 'Web Fetch',
		description:
			"Read one specific public web page or JSON/text URL and return its readable text. Use it for a URL the user names, or to read a page that a web_search result points to before relying on its snippet. It follows redirects, reads at most 2 MB, and does not run JavaScript: when a page turns out to be a JavaScript shell it is read through the optional browser bridge instead, which needs the user's extension to be connected. If that is unavailable, say so instead of guessing the contents. It cannot read private, loopback, or link-local addresses, or non-HTTPS origins the server administrator has not approved.",
		parameters,
		execute: async (_toolCallId, params, signal) => {
			const result = await fetchWebPage(params, { signal });

			if (result.clientRendered && bridge) {
				try {
					const rendered = await readThroughBridge(result.url, bridge, signal);
					if (rendered) {
						const heading = [
							`Fetched page in the user's browser: ${result.url}`,
							`Title: ${rendered.title ?? result.title ?? '(none)'}`,
							`Content type: ${result.contentType}`
						].join('\n');
						return {
							content: [
								{
									type: 'text' as const,
									text: `${heading}\n\nThe server could not read this page (${result.clientRenderedReason ?? 'it needs JavaScript'}), so it was rendered by the browser extension.\n\n${rendered.text}`
								}
							],
							details: {
								url: result.url,
								title: rendered.title ?? result.title ?? result.url,
								contentType: result.contentType,
								truncated: false,
								renderedBy: 'browser'
							}
						};
					}
				} catch {
					// Fall through to the explanation below: a failed bridge must not fail the turn.
				}
			}

			const heading = [
				`Fetched page: ${result.url}`,
				`Title: ${result.title ?? '(none)'}`,
				`Content type: ${result.contentType}`
			].join('\n');
			const footer = [
				result.truncated ? `\n\n[Content truncated to ${result.text.length} characters.]` : '',
				result.clientRendered
					? `\n\n${bridge ? BRIDGE_FAILED_NOTICE : NO_BRIDGE_NOTICE}`
					: result.notice
						? `\n\n${result.notice}`
						: ''
			].join('');
			return {
				content: [
					{
						type: 'text' as const,
						text: `${heading}\n\n${result.text || '(no readable text)'}${footer}`
					}
				],
				details: {
					url: result.url,
					title: result.title ?? result.url,
					contentType: result.contentType,
					truncated: result.truncated,
					renderedBy: 'server'
				}
			};
		}
	};
}
