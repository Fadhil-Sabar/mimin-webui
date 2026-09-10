import { afterEach, describe, expect, it, vi } from 'vitest';
import {
	createBrowserInteractTool,
	createBrowserOpenTool,
	createBrowserReadTabTool,
	createBrowserTabsTool,
	type BrowserToolEvent
} from '../src/lib/server/ai/tools/browser.tool';
import {
	browserResultSchema,
	cancelBrowserRequests,
	clearBrowserSession,
	getBrowserSession,
	pendingBrowserRequestCount,
	settleBrowserRequest,
	type BrowserBridgeEvent
} from '../src/lib/server/browser/bridge';
import {
	clearAllBrowserConsentGrants,
	clearAllBrowserConsentRequests,
	grantConversationBrowserConsent,
	resolveBrowserConsent
} from '../src/lib/server/browser/consent';
import { loadExtension, type AnyRecord, type MockTab } from './helpers/extension-harness';

/**
 * End-to-end transport test across the real seam.
 *
 * The agent tool (real server code) emits a `browser.request`; that exact event
 * is handed to the shipped extension background handler (real extension code)
 * with only the browser API mocked; its reply is fed back through the real
 * result-schema validation and the real pending-request resolver. This is what
 * catches action-name or argument-shape drift between the two halves, which the
 * per-side unit tests cannot see.
 */

const context = { userId: 'user-e2e', conversationId: 'conv-e2e', turnToken: 'turn-e2e' };

const tabs: MockTab[] = [
	{ id: 11, url: 'https://example.com/docs', title: 'Example Docs', active: true },
	{ id: 12, url: 'https://news.example.org/', title: 'News' }
];

afterEach(() => {
	vi.unstubAllGlobals();
	vi.restoreAllMocks();
	cancelBrowserRequests(context.conversationId, context.turnToken);
	clearBrowserSession(context.userId, context.conversationId);
	clearAllBrowserConsentRequests();
	clearAllBrowserConsentGrants();
});

/**
 * Wire the server bridge to the extension: every emitted request is dispatched
 * to the extension, validated against the production result schema, and settled
 * back into the pending-request registry.
 */
function connect(harness: ReturnType<typeof loadExtension>) {
	const dispatched: Array<{ action: string; args: AnyRecord }> = [];
	const schemaRejections: string[] = [];
	const consentPrompts: string[] = [];
	return {
		dispatched,
		schemaRejections,
		consentPrompts,
		emit(event: BrowserToolEvent) {
			if (event.type === 'browser.consent.request') {
				// These tests cover transport, not the gate, so allow once. The gate
				// itself is asserted separately below.
				consentPrompts.push(event.action);
				resolveBrowserConsent(event.requestId, context.userId, 'once');
				return;
			}
			const request = event as BrowserBridgeEvent;
			dispatched.push({ action: request.action, args: request.args });
			queueMicrotask(async () => {
				const reply = await harness.send(request.action, request.args);
				// The extension's payload must satisfy the schema production uses.
				const parsed = browserResultSchema.safeParse({
					requestId: request.requestId,
					token: request.token,
					ok: reply.ok === true,
					...(reply.ok === true ? { result: reply.result } : { error: String(reply.error) })
				});
				if (!parsed.success) {
					schemaRejections.push(JSON.stringify(parsed.error.issues.slice(0, 3)));
					return;
				}
				settleBrowserRequest(
					context.userId,
					request.requestId,
					request.token,
					parsed.data.ok,
					parsed.data.result,
					parsed.data.error
				);
			});
		}
	};
}

function textOf(result: { content: Array<{ type: string; text?: string }> }) {
	const first = result.content[0];
	if (first.type !== 'text' || typeof first.text !== 'string')
		throw new Error('Expected text content');
	return first.text;
}

describe('browser tab flow end to end', () => {
	it('lists real tabs through the extension and into the model output', async () => {
		const harness = loadExtension({ tabs, granted: ['https://*/*'] });
		const wire = connect(harness);
		const tool = createBrowserTabsTool(context, wire.emit);

		const text = textOf(await tool.execute('call-e2e-1', {}, new AbortController().signal));

		expect(wire.schemaRejections).toEqual([]);
		// The consent gate sits on the path even when the user allows it.
		expect(wire.consentPrompts).toEqual(['browser_tabs']);
		expect(wire.dispatched.map((d) => d.action)).toEqual(['browser_tabs_list']);
		expect(text).toContain('Open browser tabs');
		expect(text).toContain('tabId 11');
		expect(text).toContain('URL: https://example.com/docs');
		expect(text).toContain('tabId 12');
		expect(text).toContain('Example Docs');
		expect(pendingBrowserRequestCount()).toBe(0);
	});

	it('reads a tab and returns the extension snapshot with interactive elements', async () => {
		const harness = loadExtension({ tabs, granted: ['https://*/*'] });
		const wire = connect(harness);
		const tool = createBrowserReadTabTool(context, wire.emit);

		const result = await tool.execute('call-e2e-2', { tabId: 11 }, new AbortController().signal);
		const text = textOf(result);

		expect(wire.schemaRejections).toEqual([]);
		expect(wire.dispatched).toEqual([{ action: 'browser_tab_read', args: { tabId: 11 } }]);
		expect(text).toContain('Browser tab snapshot from https://example.com/docs');
		expect(text).toContain('Example Docs');
		expect(text).toContain('Documentation body');
		expect(text).toContain('[ref 0] a "More"');
		// The read was executed by the real injected function through the real handler.
		expect(harness.executeCalls.map((call) => call.name)).toEqual(['pageSnapshot']);
	});

	it('forwards a click through the extension and reports the refreshed snapshot', async () => {
		const harness = loadExtension({ tabs, granted: ['https://*/*'] });
		const wire = connect(harness);
		const tool = createBrowserInteractTool(context, wire.emit);

		const result = await tool.execute(
			'call-e2e-3',
			{ action: 'click', tabId: 11, ref: 0 },
			new AbortController().signal
		);
		const text = textOf(result);

		expect(wire.schemaRejections).toEqual([]);
		expect(wire.dispatched).toEqual([
			{ action: 'browser_tab_interact', args: { action: 'click', tabId: 11, ref: 0 } }
		]);
		// A click is fingerprinted first so the result can report a site that ignored
		// it. No digest is configured here, so there is nothing to compare against.
		expect(harness.executeCalls.map((call) => call.name)).toEqual([
			'pageDigest',
			'interactPage',
			'pageSnapshot'
		]);
		expect(harness.executeCalls[1].args[0]).toEqual({ action: 'click', tabId: 11, ref: 0 });
		expect(text).toContain('Browser tab snapshot from');
	});

	it('reports that the page ignored the interaction instead of a success', async () => {
		const harness = loadExtension({ tabs, granted: ['https://*/*'] });
		// Same fingerprints before and after, which is what Google Maps looks like
		// when scripted typing is accepted by the DOM but ignored by the site.
		harness.digests.push({ url: 'https://example.com/docs', length: 120, hash: 4242 });
		harness.digests.push({ url: 'https://example.com/docs', length: 120, hash: 4242 });
		const wire = connect(harness);
		const tool = createBrowserInteractTool(context, wire.emit);

		const result = await tool.execute(
			'call-e2e-ignored',
			{ action: 'type', tabId: 11, ref: 0, text: 'cafe', submit: true },
			new AbortController().signal
		);
		const text = textOf(result);

		// The result schema must accept the new field, or the bridge rejects it.
		expect(wire.schemaRejections).toEqual([]);
		expect(text).toContain('Nothing on the page changed');
		expect(text).toContain('Do not tell the user the action worked');
		expect(text).not.toContain('Documentation body'.repeat(0) + 'was typed');
	});

	it('does not warn when the page did change', async () => {
		const harness = loadExtension({ tabs, granted: ['https://*/*'] });
		harness.digests.push({ url: 'https://example.com/docs', length: 120, hash: 4242 });
		harness.digests.push({ url: 'https://example.com/search?q=cafe', length: 300, hash: 9001 });
		const wire = connect(harness);
		const tool = createBrowserInteractTool(context, wire.emit);

		const result = await tool.execute(
			'call-e2e-changed',
			{ action: 'type', tabId: 11, ref: 0, text: 'cafe', submit: true },
			new AbortController().signal
		);
		const text = textOf(result);

		expect(wire.schemaRejections).toEqual([]);
		expect(text).not.toContain('Nothing on the page changed');
		expect(text).toContain('Browser tab snapshot from');
	});

	it('gates the first tab access on consent, then dispatches after the user allows once', async () => {
		const harness = loadExtension({ tabs, granted: ['https://*/*'] });
		let consentPrompts = 0;
		const dispatched: string[] = [];
		const tool = createBrowserReadTabTool(context, (event) => {
			if (event.type === 'browser.consent.request') {
				consentPrompts += 1;
				// Answer only after the prompt exists, as the chat UI does.
				queueMicrotask(() => resolveBrowserConsent(event.requestId, context.userId, 'once'));
				return;
			}
			dispatched.push(event.action);
			queueMicrotask(async () => {
				const reply = await harness.send(event.action, event.args);
				settleBrowserRequest(
					context.userId,
					event.requestId,
					event.token,
					reply.ok === true,
					reply.result as never,
					reply.error as string
				);
			});
		});

		const text = textOf(
			await tool.execute('call-e2e-4', { tabId: 11 }, new AbortController().signal)
		);

		expect(consentPrompts).toBe(1);
		expect(dispatched).toEqual(['browser_tab_read']);
		expect(text).toContain('Documentation body');
	});

	it('blocks the tab read when the user denies, without touching the extension', async () => {
		const harness = loadExtension({ tabs, granted: ['https://*/*'] });
		const dispatched: string[] = [];
		const tool = createBrowserReadTabTool(context, (event) => {
			if (event.type === 'browser.consent.request') {
				queueMicrotask(() => resolveBrowserConsent(event.requestId, context.userId, 'deny'));
				return;
			}
			dispatched.push(event.action);
		});

		await expect(
			tool.execute('call-e2e-5', { tabId: 11 }, new AbortController().signal)
		).rejects.toThrow('BROWSER_CONSENT_DENIED');
		expect(dispatched).toEqual([]);
		expect(harness.executeCalls).toEqual([]);
	});

	it('skips the prompt when the conversation already has a standing grant', async () => {
		const harness = loadExtension({ tabs, granted: ['https://*/*'] });
		grantConversationBrowserConsent(context.userId, context.conversationId);
		const wire = connect(harness);
		let prompts = 0;
		const tool = createBrowserTabsTool(context, (event) => {
			if (event.type === 'browser.consent.request') prompts += 1;
			wire.emit(event);
		});

		const text = textOf(await tool.execute('call-e2e-6', {}, new AbortController().signal));

		expect(prompts).toBe(0);
		expect(wire.dispatched.map((d) => d.action)).toEqual(['browser_tabs_list']);
		expect(text).toContain('tabId 11');
	});

	it('keeps browser_open working end to end', async () => {
		const harness = loadExtension({ tabs: [], granted: ['https://*/*'] });
		const wire = connect(harness);
		const tool = createBrowserOpenTool(context, wire.emit);

		const text = textOf(
			await tool.execute(
				'call-e2e-7',
				{ url: 'https://example.com/open' },
				new AbortController().signal
			)
		);
		expect(wire.schemaRejections).toEqual([]);
		expect(wire.dispatched).toEqual([
			{ action: 'browser_open', args: { url: 'https://example.com/open' } }
		]);
		expect(harness.createCalls[0]).toMatchObject({ url: 'https://example.com/open' });
		expect(text).toContain('Browser tab opened at');
	});

	it('carries tab continuity from a read into the next open request', async () => {
		const harness = loadExtension({ tabs, granted: ['https://*/*'] });
		const wire = connect(harness);

		// Read a user tab, which records the conversation's current tab.
		await createBrowserReadTabTool(context, wire.emit).execute(
			'call-e2e-9a',
			{ tabId: 11 },
			new AbortController().signal
		);
		expect(getBrowserSession(context.userId, context.conversationId)?.tabId).toBe(11);

		// The next request in the same conversation must carry preferredTabId, so
		// the extension acts on the same tab rather than the user's active one.
		await createBrowserOpenTool(context, wire.emit).execute(
			'call-e2e-9b',
			{ url: 'https://example.com/open' },
			new AbortController().signal
		);
		expect(wire.dispatched.at(-1)).toEqual({
			action: 'browser_open',
			args: { url: 'https://example.com/open', preferredTabId: 11 }
		});
		expect(wire.schemaRejections).toEqual([]);
	});

	it('surfaces an unreadable tab from the extension without a schema failure', async () => {
		// No host permission granted anywhere: the extension must refuse to read.
		const harness = loadExtension({ tabs, granted: [] });
		const wire = connect(harness);
		const tool = createBrowserReadTabTool(context, wire.emit);

		const text = textOf(
			await tool.execute('call-e2e-8', { tabId: 11 }, new AbortController().signal)
		);

		expect(wire.schemaRejections).toEqual([]);
		expect(text).toContain('could not be read: host_permission_required');
		expect(harness.executeCalls).toEqual([]);
	});
});
