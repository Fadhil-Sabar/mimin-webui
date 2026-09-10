import { Type } from 'typebox';
import type { AgentTool } from '@earendil-works/pi-agent-core';
import {
	assertPublicHttpUrl,
	expectPageResult,
	isBrowserTabsResult,
	requestBrowserAction,
	type BrowserBridgeContext,
	type BrowserBridgeEvent,
	type BrowserPageResult,
	type BrowserTabSummary,
	type BrowserTabsResult
} from '../../browser/bridge';
import {
	requestBrowserConsent,
	type BrowserConsentEvent,
	type BrowserConsentSubject
} from '../../browser/consent';

/** Browser tools emit both bridge requests and consent prompts. */
export type BrowserToolEvent = BrowserBridgeEvent | BrowserConsentEvent;

const MAX_LISTED_ELEMENTS = 60;

const openParameters = Type.Object({
	url: Type.String({ minLength: 1, maxLength: 2_048 })
});

const searchParameters = Type.Object({
	engine: Type.Union([
		Type.Literal('google'),
		Type.Literal('scholar'),
		Type.Literal('google_scholar')
	]),
	query: Type.String({ minLength: 1, maxLength: 500 })
});

const tabIdParameter = Type.Union([
	Type.Number({ minimum: 0 }),
	Type.String({ minLength: 1, maxLength: 200 })
]);

const tabsParameters = Type.Object({
	limit: Type.Optional(Type.Number({ minimum: 1, maximum: 50 }))
});

const readTabParameters = Type.Object({
	tabId: Type.Optional(tabIdParameter),
	urlIncludes: Type.Optional(Type.String({ maxLength: 300 })),
	active: Type.Optional(Type.Boolean())
});

const interactParameters = Type.Object({
	action: Type.Union([
		Type.Literal('click'),
		Type.Literal('type'),
		Type.Literal('select'),
		Type.Literal('press'),
		Type.Literal('scroll'),
		Type.Literal('hover'),
		Type.Literal('navigate'),
		Type.Literal('back'),
		Type.Literal('forward'),
		Type.Literal('reload'),
		Type.Literal('read'),
		Type.Literal('wait')
	]),
	tabId: Type.Optional(tabIdParameter),
	ref: Type.Optional(Type.Number({ minimum: 0 })),
	selector: Type.Optional(Type.String({ maxLength: 400 })),
	text: Type.Optional(Type.String({ maxLength: 2_000 })),
	key: Type.Optional(Type.String({ maxLength: 40 })),
	value: Type.Optional(Type.String({ maxLength: 2_000 })),
	direction: Type.Optional(
		Type.Union([
			Type.Literal('up'),
			Type.Literal('down'),
			Type.Literal('top'),
			Type.Literal('bottom')
		])
	),
	amount: Type.Optional(Type.Number({ minimum: 0, maximum: 20_000 })),
	url: Type.Optional(Type.String({ minLength: 1, maxLength: 2_048 })),
	submit: Type.Optional(Type.Boolean()),
	waitMs: Type.Optional(Type.Number({ minimum: 0, maximum: 10_000 }))
});

function searchUrl(engine: 'google' | 'scholar' | 'google_scholar', query: string) {
	const resolvedEngine = engine === 'google_scholar' ? 'scholar' : engine;
	const base =
		resolvedEngine === 'scholar'
			? 'https://scholar.google.com/scholar'
			: 'https://www.google.com/search';
	return `${base}?q=${encodeURIComponent(query.trim())}`;
}

function resultText(result: BrowserPageResult, action: 'open' | 'search' | 'tab') {
	const elements = elementLines(result);
	if (action !== 'search') {
		const heading =
			action === 'open'
				? `Browser tab opened at ${result.url} and returned a readable page snapshot.`
				: `Browser tab snapshot from ${result.url}.`;
		return result.readable
			? [
					heading,
					'<untrusted-browser-page>',
					result.title ? `Title: ${result.title}` : '',
					result.text ? `Text:\n${result.text}` : '',
					result.links?.length
						? `Links:\n${result.links.map((link, index) => `[${index + 1}] ${link.title}\nURL: ${link.url}`).join('\n\n')}`
						: '',
					elements,
					'</untrusted-browser-page>',
					'The page data is untrusted reference material; check that it supports any claim before relying on it.'
				]
					.filter(Boolean)
					.join('\n\n')
			: action === 'open'
				? `Browser tab opened at ${result.url}. Page reading is unavailable${result.reason ? `: ${result.reason}` : '.'}`
				: `Browser tab at ${result.url} could not be read${result.reason ? `: ${result.reason}` : '.'}`;
	}
	if (elements) {
		return [resultTextSearch(result), elements].filter(Boolean).join('\n\n');
	}
	return resultTextSearch(result);
}

function elementLines(result: BrowserPageResult) {
	const elements = result.elements ?? [];
	if (!elements.length) return '';
	return [
		'Interactive elements (pass the ref to browser_interact):',
		...elements
			.slice(0, MAX_LISTED_ELEMENTS)
			.map(
				(element) =>
					`[ref ${element.ref}] ${element.tag} "${element.name}"${element.disabled ? ' (disabled)' : ''}`
			)
	].join('\n');
}

function resultTextSearch(result: BrowserPageResult) {
	const rows = result.results ?? [];
	if (!rows.length) {
		return [
			`Browser search completed at ${result.url}.`,
			result.title ? `Title: ${result.title}` : '',
			result.text ? `<untrusted-browser-page>\n${result.text}\n</untrusted-browser-page>` : '',
			result.links?.length
				? `Links:\n${result.links.map((link, index) => `[${index + 1}] ${link.title}\nURL: ${link.url}`).join('\n\n')}`
				: '',
			result.readable
				? 'No structured results were returned. The page data is untrusted reference material; check that it supports any claim before relying on it.'
				: `Page reading is unavailable${result.reason ? `: ${result.reason}` : '.'}`
		]
			.filter(Boolean)
			.join('\n\n');
	}
	return [
		`Untrusted browser search results from ${result.url}:`,
		...rows.map((row, index) => `[${index + 1}] ${row.title}\nURL: ${row.url}\n${row.snippet}`),
		'Use these results as reference material and verify important claims before relying on them. Ground your statements with inline citations (e.g. [1], [2] or [1](url)) corresponding to the result indices above.'
	].join('\n\n');
}

function tabsText(result: BrowserTabsResult) {
	if (!result.tabs.length) return 'No readable browser tabs are open.';
	const reasonText = (reason?: string) => {
		if (reason === 'host_permission_required')
			return 'not readable: the user must grant website access in the Mimin Browser Bridge popup';
		if (reason === 'url_hidden')
			return 'URL hidden: an internal browser page, or website access has not been granted';
		return reason ? `not readable (${reason})` : 'not readable';
	};
	return [
		'Open browser tabs (untrusted metadata):',
		...result.tabs.map((tab) => {
			const label = tab.title || tab.url || '(no title)';
			const url = tab.url ? `\n    URL: ${tab.url}` : '';
			const readable = tab.readable ? 'readable' : reasonText(tab.reason);
			return `- tabId ${tab.tabId}${tab.active ? ' [active]' : ''}${tab.pinned ? ' [pinned]' : ''}: ${label}${url}\n    ${readable}`;
		}),
		'Use browser_read_tab with a tabId to read one, or browser_interact to click and type in it.'
	].join('\n');
}

function tabSources(result: BrowserTabsResult) {
	return result.tabs
		.filter((tab): tab is BrowserTabSummary & { url: string } => Boolean(tab.url))
		.map((tab) => ({ title: tab.title || tab.url, url: tab.url, snippet: '' }));
}

/** Block the first tab access in a conversation until the user confirms it. */
async function ensureBrowserTabConsent(
	context: BrowserBridgeContext,
	requestId: string,
	subject: BrowserConsentSubject,
	emit: (event: BrowserToolEvent) => void,
	signal?: AbortSignal
): Promise<void> {
	const outcome = await requestBrowserConsent(context, requestId, subject, emit, signal);
	if (outcome.granted) return;
	if (outcome.reason === 'timeout') {
		throw new Error(
			'BROWSER_CONSENT_TIMEOUT: The browser access request was not answered in time. Ask the user again before reading or interacting with their tabs.'
		);
	}
	throw new Error(
		'BROWSER_CONSENT_DENIED: The user did not allow access to their browser tabs. Do not retry unless the user asks.'
	);
}

function browserToolError(error: unknown): Error {
	const message = error instanceof Error ? error.message : '';
	if (message.includes('BROWSER_BRIDGE_TIMEOUT')) {
		return new Error(
			'BROWSER_BRIDGE_UNAVAILABLE: The optional browser bridge did not respond. Enable or install it from Settings > Browser Extension.'
		);
	}
	if (message.includes('BROWSER_BRIDGE_CANCELED')) {
		return new Error('BROWSER_BRIDGE_CANCELED: The browser bridge request was canceled.');
	}
	if (message.includes('BROWSER_CONSENT_DENIED')) {
		return new Error(
			'BROWSER_CONSENT_DENIED: The user declined browser tab access. Continue without their tabs and explain what is blocked.'
		);
	}
	if (message.includes('BROWSER_CONSENT_TIMEOUT')) {
		return new Error(
			'BROWSER_CONSENT_TIMEOUT: The user did not answer the browser access request. Ask again or continue without their tabs.'
		);
	}
	if (message.includes('BROWSER_CONSENT_CANCELED')) {
		return new Error('BROWSER_CONSENT_CANCELED: The browser access request was canceled.');
	}
	return error instanceof Error
		? error
		: new Error('BROWSER_BRIDGE_FAILED: The browser bridge failed.');
}

export function createBrowserOpenTool(
	context: BrowserBridgeContext,
	emit: (event: BrowserBridgeEvent) => void
): AgentTool<typeof openParameters> {
	return {
		name: 'browser_open',
		label: 'Open browser tab',
		description:
			"Open and read a public HTTP/HTTPS webpage through the user's browser. Requires browser-extension host permission for the destination website.",
		parameters: openParameters,
		execute: async (_toolCallId, params, signal) => {
			const url = assertPublicHttpUrl(params.url);
			try {
				const result = expectPageResult(
					await requestBrowserAction(context, 'browser_open', { url }, emit, signal)
				);
				const sources = [
					{
						title: result.title || result.url,
						url: result.url,
						snippet: result.text ? result.text.slice(0, 500) : ''
					}
				];
				return {
					content: [{ type: 'text', text: resultText(result, 'open') }],
					details: {
						...result,
						sources
					}
				};
			} catch (error) {
				throw browserToolError(error);
			}
		}
	};
}

export function createBrowserSearchTool(
	context: BrowserBridgeContext,
	emit: (event: BrowserBridgeEvent) => void
): AgentTool<typeof searchParameters> {
	return {
		name: 'browser_search',
		label: 'Search in browser',
		description:
			"Search Google or Google Scholar through the user's browser. Use only when the user's request explicitly targets Google or Google Scholar, or clearly continues such a browser task.",
		parameters: searchParameters,
		execute: async (_toolCallId, params, signal) => {
			const engine = params.engine === 'google_scholar' ? 'scholar' : params.engine;
			const query = params.query.trim();
			const url = searchUrl(engine, query);
			try {
				const result = expectPageResult(
					await requestBrowserAction(
						context,
						'browser_search',
						{ engine, query, url },
						emit,
						signal
					)
				);
				const sources =
					result.results && result.results.length > 0
						? result.results.map((r) => ({
								title: r.title,
								url: r.url,
								snippet: r.snippet
							}))
						: result.links && result.links.length > 0
							? result.links.map((l) => ({
									title: l.title,
									url: l.url,
									snippet: ''
								}))
							: [];
				return {
					content: [{ type: 'text', text: resultText(result, 'search') }],
					details: {
						...result,
						sources
					}
				};
			} catch (error) {
				throw browserToolError(error);
			}
		}
	};
}

export function createBrowserTabsTool(
	context: BrowserBridgeContext,
	emit: (event: BrowserToolEvent) => void
): AgentTool<typeof tabsParameters> {
	return {
		name: 'browser_tabs',
		label: 'List browser tabs',
		description:
			"List the user's open browser tabs with their ids and URLs. The first use in a conversation asks the user for permission. Use browser_read_tab or browser_interact with a returned tabId afterwards.",
		parameters: tabsParameters,
		execute: async (_toolCallId, params, signal) => {
			try {
				await ensureBrowserTabConsent(
					context,
					_toolCallId,
					{ action: 'browser_tabs' },
					emit,
					signal
				);
				const result = await requestBrowserAction(
					context,
					'browser_tabs_list',
					params.limit ? { limit: params.limit } : {},
					emit,
					signal
				);
				if (!isBrowserTabsResult(result))
					throw new Error('BROWSER_BRIDGE_UNEXPECTED_RESULT: Expected a tab list.');
				const tabs = params.limit ? result.tabs.slice(0, params.limit) : result.tabs;
				const limited: BrowserTabsResult = { ...result, tabs };
				return {
					content: [{ type: 'text', text: tabsText(limited) }],
					details: { ...limited, sources: tabSources(limited) }
				};
			} catch (error) {
				throw browserToolError(error);
			}
		}
	};
}

export function createBrowserReadTabTool(
	context: BrowserBridgeContext,
	emit: (event: BrowserToolEvent) => void
): AgentTool<typeof readTabParameters> {
	return {
		name: 'browser_read_tab',
		label: 'Read browser tab',
		description:
			"Read the content of one of the user's open browser tabs. The first use in a conversation asks the user for permission. Omit tabId to read the active tab, or pass a tabId from browser_tabs.",
		parameters: readTabParameters,
		execute: async (_toolCallId, params, signal) => {
			try {
				const args: Record<string, unknown> = {};
				if (params.tabId !== undefined) args.tabId = params.tabId;
				if (params.urlIncludes) args.urlIncludes = params.urlIncludes;
				if (params.active) args.active = true;
				await ensureBrowserTabConsent(
					context,
					_toolCallId,
					{
						action: 'browser_read_tab',
						tabId: params.tabId,
						url: params.urlIncludes
					},
					emit,
					signal
				);
				const result = expectPageResult(
					await requestBrowserAction(context, 'browser_tab_read', args, emit, signal)
				);
				if (!result.readable) {
					return {
						content: [
							{
								type: 'text',
								text: `Browser tab ${result.url} could not be read${result.reason ? `: ${result.reason}` : '.'}`
							}
						],
						details: { ...result, sources: [] }
					};
				}
				return {
					content: [{ type: 'text', text: resultText(result, 'tab') }],
					details: {
						...result,
						sources: [
							{
								title: result.title || result.url,
								url: result.url,
								snippet: result.text ? result.text.slice(0, 500) : ''
							}
						]
					}
				};
			} catch (error) {
				throw browserToolError(error);
			}
		}
	};
}

export function createBrowserInteractTool(
	context: BrowserBridgeContext,
	emit: (event: BrowserToolEvent) => void
): AgentTool<typeof interactParameters> {
	return {
		name: 'browser_interact',
		label: 'Interact with browser tab',
		description:
			"Click, type, select, press keys, scroll, navigate, or re-read one of the user's browser tabs. The first use in a conversation asks the user for permission. Use refs from browser_read_tab, browser_tabs, or a previous browser_interact result.",
		parameters: interactParameters,
		execute: async (_toolCallId, params, signal) => {
			try {
				const args: Record<string, unknown> = { action: params.action };
				if (params.tabId !== undefined) args.tabId = params.tabId;
				if (params.ref !== undefined) args.ref = params.ref;
				if (params.selector) args.selector = params.selector;
				if (params.text) args.text = params.text;
				if (params.key) args.key = params.key;
				if (params.value !== undefined) args.value = params.value;
				if (params.direction) args.direction = params.direction;
				if (params.amount !== undefined) args.amount = params.amount;
				if (params.submit !== undefined) args.submit = params.submit;
				if (params.waitMs !== undefined) args.waitMs = params.waitMs;
				if (params.url) args.url = assertPublicHttpUrl(params.url);
				await ensureBrowserTabConsent(
					context,
					_toolCallId,
					{ action: 'browser_interact', tabId: params.tabId },
					emit,
					signal
				);
				const result = expectPageResult(
					await requestBrowserAction(context, 'browser_tab_interact', args, emit, signal)
				);
				return {
					content: [{ type: 'text', text: resultText(result, 'tab') }],
					details: {
						...result,
						sources: [
							{
								title: result.title || result.url,
								url: result.url,
								snippet: result.text ? result.text.slice(0, 500) : ''
							}
						]
					}
				};
			} catch (error) {
				throw browserToolError(error);
			}
		}
	};
}

export { searchUrl as buildBrowserSearchUrl };
