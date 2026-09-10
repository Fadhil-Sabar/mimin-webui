import { afterEach, describe, expect, it } from 'vitest';
import {
	createBrowserInteractTool,
	createBrowserOpenTool,
	createBrowserReadTabTool,
	createBrowserSearchTool,
	createBrowserTabsTool,
	buildBrowserSearchUrl,
	type BrowserToolEvent
} from '../src/lib/server/ai/tools/browser.tool';
import {
	clearAllBrowserConsentGrants,
	clearAllBrowserConsentRequests,
	grantConversationBrowserConsent,
	resolveBrowserConsent,
	type BrowserConsentEvent
} from '../src/lib/server/browser/consent';
import {
	settleBrowserRequest,
	type BrowserBridgeContext,
	type BrowserBridgeEvent
} from '../src/lib/server/browser/bridge';

const context: BrowserBridgeContext = {
	userId: 'user-agent-test',
	conversationId: 'conv-agent-test',
	turnToken: 'turn-agent-test'
};

describe('browser tools', () => {
	it('builds search URLs for google and scholar', () => {
		expect(buildBrowserSearchUrl('google', 'quantum computing')).toBe(
			'https://www.google.com/search?q=quantum%20computing'
		);
		expect(buildBrowserSearchUrl('scholar', 'graph neural networks')).toBe(
			'https://scholar.google.com/scholar?q=graph%20neural%20networks'
		);
		expect(buildBrowserSearchUrl('google_scholar', 'graph neural networks')).toBe(
			'https://scholar.google.com/scholar?q=graph%20neural%20networks'
		);
	});

	it('rejects invalid or private URLs in browser_open', async () => {
		const tool = createBrowserOpenTool(context, () => {});
		await expect(
			tool.execute('call-1', { url: 'http://localhost:5173' }, new AbortController().signal)
		).rejects.toThrow('BROWSER_BRIDGE_PRIVATE_URL');
		await expect(
			tool.execute('call-2', { url: 'ftp://example.com' }, new AbortController().signal)
		).rejects.toThrow('BROWSER_BRIDGE_INVALID_URL');
	});

	it('executes browser_open and formats readable page snapshots', async () => {
		let capturedEvent: BrowserBridgeEvent | null = null;
		const tool = createBrowserOpenTool(context, (event) => {
			capturedEvent = event;
			queueMicrotask(() => {
				settleBrowserRequest(context.userId, event.requestId, event.token, true, {
					url: 'https://www.google.com/search?q=test',
					readable: true,
					title: 'Google Search Test',
					text: 'Sample page text snippet',
					links: [{ title: 'Result 1', url: 'https://example.com/1' }]
				});
			});
		});

		const result = await tool.execute(
			'call-3',
			{ url: 'https://www.google.com/search?q=test' },
			new AbortController().signal
		);
		expect(capturedEvent).toBeDefined();
		const first = result.content[0];
		if (first.type !== 'text') throw new Error('Expected text content');
		expect(first.text).toContain('Browser tab opened');
		expect(first.text).toContain('Google Search Test');
		expect(first.text).toContain('<untrusted-browser-page>');
	});

	it('executes browser_search and formats structured search results', async () => {
		let capturedEvent: BrowserBridgeEvent | null = null;
		const tool = createBrowserSearchTool(context, (event) => {
			capturedEvent = event;
			queueMicrotask(() => {
				settleBrowserRequest(context.userId, event.requestId, event.token, true, {
					url: 'https://scholar.google.com/scholar?q=ai',
					readable: true,
					title: 'Google Scholar',
					results: [
						{
							title: 'Attention is all you need',
							url: 'https://arxiv.org/abs/1706.03762',
							snippet: 'The dominant sequence transduction models...'
						}
					]
				});
			});
		});

		const result = await tool.execute(
			'call-4',
			{ engine: 'google_scholar', query: 'ai' },
			new AbortController().signal
		);
		expect(capturedEvent).toBeDefined();
		const eventArgs = (capturedEvent as BrowserBridgeEvent | null)?.args;
		expect(eventArgs && 'engine' in eventArgs ? eventArgs.engine : null).toBe('scholar');
		const first = result.content[0];
		if (first.type !== 'text') throw new Error('Expected text content');
		expect(first.text).toContain('Untrusted browser search results');
		expect(first.text).toContain('Attention is all you need');
		expect(first.text).toContain('https://arxiv.org/abs/1706.03762');
		expect((result.details as { sources?: unknown[] })?.sources).toEqual([
			{
				title: 'Attention is all you need',
				url: 'https://arxiv.org/abs/1706.03762',
				snippet: 'The dominant sequence transduction models...'
			}
		]);
	});

	it('maps timeout errors to an instructional bridge-unavailable message', async () => {
		const tool = createBrowserOpenTool(context, (event) => {
			queueMicrotask(() => {
				settleBrowserRequest(
					context.userId,
					event.requestId,
					event.token,
					false,
					undefined,
					'TIMEOUT'
				);
			});
		});

		await expect(
			tool.execute('call-5', { url: 'https://example.com' }, new AbortController().signal)
		).rejects.toThrow(/BROWSER_BRIDGE_UNAVAILABLE/);
	});

	it('maps cancellation to a clean cancellation error', async () => {
		const tool = createBrowserOpenTool(context, (event) => {
			queueMicrotask(() => {
				settleBrowserRequest(
					context.userId,
					event.requestId,
					event.token,
					false,
					undefined,
					'CANCELED'
				);
			});
		});

		await expect(
			tool.execute('call-6', { url: 'https://example.com' }, new AbortController().signal)
		).rejects.toThrow(/BROWSER_BRIDGE_CANCELED/);
	});

	it('has updated explicit tool descriptions', () => {
		const openTool = createBrowserOpenTool(context, () => {});
		const searchTool = createBrowserSearchTool(context, () => {});

		expect(openTool.description).toBe(
			"Open and read a public HTTP/HTTPS webpage through the user's browser. Requires browser-extension host permission for the destination website."
		);
		expect(searchTool.description).toBe(
			"Search Google or Google Scholar through the user's browser. Use only when the user's request explicitly targets Google or Google Scholar, or clearly continues such a browser task."
		);
	});

	it('formats unreadable snapshot when host permission is required', async () => {
		const tool = createBrowserOpenTool(context, (event) => {
			queueMicrotask(() => {
				settleBrowserRequest(context.userId, event.requestId, event.token, true, {
					url: 'https://docs.example.com/',
					readable: false,
					reason: 'host_permission_required',
					title: '',
					links: []
				});
			});
		});

		const result = await tool.execute(
			'call-7',
			{ url: 'https://docs.example.com/' },
			new AbortController().signal
		);
		const first = result.content[0];
		if (first.type !== 'text') throw new Error('Expected text content');
		expect(first.text).toContain('Browser tab opened at https://docs.example.com/');
		expect(first.text).toContain('Page reading is unavailable: host_permission_required');
	});

	it('preserves tab continuity across browser_search and browser_open in the same conversation', async () => {
		const convContext: BrowserBridgeContext = {
			userId: 'user-tab-test',
			conversationId: 'conv-tab-continuity',
			turnToken: 'turn-1'
		};

		let capturedSearchEvent: BrowserBridgeEvent | null = null;
		const searchTool = createBrowserSearchTool(convContext, (event) => {
			capturedSearchEvent = event;
			queueMicrotask(() => {
				settleBrowserRequest(convContext.userId, event.requestId, event.token, true, {
					url: 'https://www.google.com/search?q=rsc',
					readable: true,
					tabId: 123,
					results: [
						{ title: 'RSC', url: 'https://react.dev/rsc', snippet: 'React Server Components' }
					]
				});
			});
		});

		await searchTool.execute(
			'call-tab-1',
			{ engine: 'google', query: 'rsc' },
			new AbortController().signal
		);
		expect(capturedSearchEvent).toBeDefined();

		// Next action in turn 2 of the same conversation: browser_open should propagate preferredTabId: 123
		let capturedOpenEvent: BrowserBridgeEvent | null = null;
		const openTool = createBrowserOpenTool({ ...convContext, turnToken: 'turn-2' }, (event) => {
			capturedOpenEvent = event;
			queueMicrotask(() => {
				settleBrowserRequest(convContext.userId, event.requestId, event.token, true, {
					url: 'https://react.dev/rsc',
					readable: true,
					tabId: 123,
					text: 'RSC documentation'
				});
			});
		});

		await openTool.execute(
			'call-tab-2',
			{ url: 'https://react.dev/rsc' },
			new AbortController().signal
		);
		expect(capturedOpenEvent).toBeDefined();
		expect((capturedOpenEvent as unknown as BrowserBridgeEvent | null)?.args?.preferredTabId).toBe(
			123
		);

		// Another turn: browser_search should also receive preferredTabId: 123
		let capturedSearchEvent2: BrowserBridgeEvent | null = null;
		const searchTool2 = createBrowserSearchTool(
			{ ...convContext, turnToken: 'turn-3' },
			(event) => {
				capturedSearchEvent2 = event;
				queueMicrotask(() => {
					settleBrowserRequest(convContext.userId, event.requestId, event.token, true, {
						url: 'https://www.google.com/search?q=nextjs',
						readable: true,
						tabId: 123,
						results: []
					});
				});
			}
		);

		await searchTool2.execute(
			'call-tab-3',
			{ engine: 'google', query: 'nextjs' },
			new AbortController().signal
		);
		expect(capturedSearchEvent2).toBeDefined();
		expect(
			(capturedSearchEvent2 as unknown as BrowserBridgeEvent | null)?.args?.preferredTabId
		).toBe(123);
	});

	it('isolates browser tabs between different conversations', async () => {
		const contextA: BrowserBridgeContext = {
			userId: 'user-shared',
			conversationId: 'conv-A',
			turnToken: 'turn-A'
		};
		const contextB: BrowserBridgeContext = {
			userId: 'user-shared',
			conversationId: 'conv-B',
			turnToken: 'turn-B'
		};

		// Seed conv-A with tab 123
		const toolA = createBrowserOpenTool(contextA, (event) => {
			queueMicrotask(() => {
				settleBrowserRequest(contextA.userId, event.requestId, event.token, true, {
					url: 'https://site-a.com',
					readable: true,
					tabId: 123
				});
			});
		});
		await toolA.execute('call-A1', { url: 'https://site-a.com' }, new AbortController().signal);

		// Seed conv-B with tab 456
		const toolB = createBrowserOpenTool(contextB, (event) => {
			queueMicrotask(() => {
				settleBrowserRequest(contextB.userId, event.requestId, event.token, true, {
					url: 'https://site-b.com',
					readable: true,
					tabId: 456
				});
			});
		});
		await toolB.execute('call-B1', { url: 'https://site-b.com' }, new AbortController().signal);

		// Subsequent action in conv-A must use preferredTabId 123, not 456
		let capturedA2: BrowserBridgeEvent | null = null;
		const toolA2 = createBrowserOpenTool({ ...contextA, turnToken: 'turn-A2' }, (event) => {
			capturedA2 = event;
			queueMicrotask(() => {
				settleBrowserRequest(contextA.userId, event.requestId, event.token, true, {
					url: 'https://site-a.com/page2',
					readable: true,
					tabId: 123
				});
			});
		});
		await toolA2.execute(
			'call-A2',
			{ url: 'https://site-a.com/page2' },
			new AbortController().signal
		);
		expect((capturedA2 as unknown as BrowserBridgeEvent | null)?.args?.preferredTabId).toBe(123);

		// Subsequent action in conv-B must use preferredTabId 456, not 123
		let capturedB2: BrowserBridgeEvent | null = null;
		const toolB2 = createBrowserOpenTool({ ...contextB, turnToken: 'turn-B2' }, (event) => {
			capturedB2 = event;
			queueMicrotask(() => {
				settleBrowserRequest(contextB.userId, event.requestId, event.token, true, {
					url: 'https://site-b.com/page2',
					readable: true,
					tabId: 456
				});
			});
		});
		await toolB2.execute(
			'call-B2',
			{ url: 'https://site-b.com/page2' },
			new AbortController().signal
		);
		expect((capturedB2 as unknown as BrowserBridgeEvent | null)?.args?.preferredTabId).toBe(456);
	});
});

describe('browser tab tools with consent', () => {
	afterEach(() => {
		clearAllBrowserConsentRequests();
		clearAllBrowserConsentGrants();
	});

	const tabContext = { userId: 'user-tabs', conversationId: 'conv-tabs', turnToken: 'turn-tabs' };

	function consentEvents(events: BrowserToolEvent[]) {
		return events.filter(
			(event): event is BrowserConsentEvent => event.type === 'browser.consent.request'
		);
	}

	it('asks for consent before listing tabs and formats the granted listing', async () => {
		const events: BrowserToolEvent[] = [];
		const tool = createBrowserTabsTool(tabContext, (event) => {
			events.push(event);
			if (event.type === 'browser.consent.request') {
				queueMicrotask(() => resolveBrowserConsent(event.requestId, tabContext.userId, 'once'));
				return;
			}
			queueMicrotask(() => {
				settleBrowserRequest(tabContext.userId, event.requestId, event.token, true, {
					tabs: [
						{
							tabId: 5,
							title: 'Docs',
							url: 'https://example.com/docs',
							active: true,
							readable: true
						},
						{ tabId: 6, title: 'Hidden', active: false, readable: false, reason: 'url_hidden' }
					],
					tabId: 5
				});
			});
		});

		const result = await tool.execute('call-tabs', {}, new AbortController().signal);
		expect(consentEvents(events)).toHaveLength(1);
		expect(consentEvents(events)[0].action).toBe('browser_tabs_list');

		const first = result.content[0];
		if (first.type !== 'text') throw new Error('Expected text content');
		expect(first.text).toContain('Open browser tabs');
		expect(first.text).toContain('tabId 5');
		expect(first.text).toContain('URL: https://example.com/docs');
		expect(first.text).toContain('URL hidden: an internal browser page');

		// The listing is also exposed as sources for the chat UI.
		const sources = (result.details as { sources: Array<{ url?: string }> }).sources;
		expect(sources.map((source) => source.url)).toEqual(['https://example.com/docs']);
	});

	it('never dispatches a bridge request when the user denies access', async () => {
		const events: BrowserToolEvent[] = [];
		const tool = createBrowserReadTabTool(tabContext, (event) => {
			events.push(event);
			if (event.type === 'browser.consent.request') {
				queueMicrotask(() => resolveBrowserConsent(event.requestId, tabContext.userId, 'deny'));
			}
		});

		await expect(
			tool.execute('call-deny', { tabId: 5 }, new AbortController().signal)
		).rejects.toThrow('BROWSER_CONSENT_DENIED');
		expect(consentEvents(events)).toHaveLength(1);
		expect(events.some((event) => event.type === 'browser.request')).toBe(false);
	});

	it('reads a tab and returns the interactive element list', async () => {
		const events: BrowserToolEvent[] = [];
		const tool = createBrowserReadTabTool(tabContext, (event) => {
			events.push(event);
			if (event.type === 'browser.consent.request') {
				queueMicrotask(() => resolveBrowserConsent(event.requestId, tabContext.userId, 'once'));
				return;
			}
			queueMicrotask(() => {
				settleBrowserRequest(tabContext.userId, event.requestId, event.token, true, {
					url: 'https://example.com/docs',
					readable: true,
					title: 'Docs',
					text: 'Body text',
					elements: [
						{ ref: 0, tag: 'a', name: 'Guide' },
						{ ref: 1, tag: 'button', name: 'Sign in' }
					]
				});
			});
		});

		const result = await tool.execute('call-read', { tabId: 5 }, new AbortController().signal);
		const first = result.content[0];
		if (first.type !== 'text') throw new Error('Expected text content');
		expect(first.text).toContain('Browser tab snapshot from https://example.com/docs');
		expect(first.text).toContain('Interactive elements (pass the ref to browser_interact)');
		expect(first.text).toContain('[ref 1] button "Sign in"');
	});

	it('forwards interact arguments and skips the prompt after a conversation grant', async () => {
		const events: BrowserToolEvent[] = [];
		const dispatched: Array<Record<string, unknown>> = [];
		const tool = createBrowserInteractTool(tabContext, (event) => {
			events.push(event);
			if (event.type === 'browser.consent.request') {
				queueMicrotask(() =>
					resolveBrowserConsent(event.requestId, tabContext.userId, 'conversation')
				);
				return;
			}
			dispatched.push(event.args);
			queueMicrotask(() => {
				settleBrowserRequest(tabContext.userId, event.requestId, event.token, true, {
					url: 'https://example.com/docs',
					readable: true,
					title: 'Docs'
				});
			});
		});

		await tool.execute(
			'call-interact-1',
			{ action: 'type', tabId: 5, ref: 2, text: 'hello', submit: true },
			new AbortController().signal
		);
		expect(dispatched[0]).toMatchObject({
			action: 'type',
			tabId: 5,
			ref: 2,
			text: 'hello',
			submit: true
		});
		expect(consentEvents(events)).toHaveLength(1);

		await tool.execute(
			'call-interact-2',
			{ action: 'scroll', direction: 'bottom' },
			new AbortController().signal
		);
		// The standing grant suppresses the second prompt.
		expect(consentEvents(events)).toHaveLength(1);
		expect(dispatched[1]).toMatchObject({ action: 'scroll', direction: 'bottom' });
	});

	it('validates navigate URLs before dispatch', async () => {
		const tool = createBrowserInteractTool(tabContext, () => {});
		grantConversationBrowserConsent(tabContext.userId, tabContext.conversationId);
		await expect(
			tool.execute(
				'call-navigate',
				{ action: 'navigate', url: 'http://localhost:5173' },
				new AbortController().signal
			)
		).rejects.toThrow('BROWSER_BRIDGE_PRIVATE_URL');
	});
});
