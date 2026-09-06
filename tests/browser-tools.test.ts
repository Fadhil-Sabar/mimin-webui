import { describe, expect, it } from 'vitest';
import {
	createBrowserOpenTool,
	createBrowserSearchTool,
	buildBrowserSearchUrl
} from '../src/lib/server/ai/tools/browser.tool';
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
		expect((capturedEvent as any)?.args?.engine).toBe('scholar');
		const first = result.content[0];
		if (first.type !== 'text') throw new Error('Expected text content');
		expect(first.text).toContain('Untrusted browser search results');
		expect(first.text).toContain('Attention is all you need');
		expect(first.text).toContain('https://arxiv.org/abs/1706.03762');
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
});
