import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { requestBrowserBridge, setBrowserBridgeEnabled } from '../src/lib/client/browser-bridge';
import {
	createFakeWindow,
	loadContentScript,
	PROBE_ORIGIN,
	type AnyRecord,
	type FakeWindow
} from './helpers/extension-harness';

/**
 * The page-to-extension protocol, tested with both real halves.
 *
 * `src/lib/client/browser-bridge.ts` posts `{ source: 'mimin-webui', id, action,
 * args }` and waits for `{ source: 'mimin-extension', id, ok, result|error }`.
 * `browser-extension/src/content.js` is the mirror image. Wiring the real client
 * to the real relay verifies they agree on shape, origin, and error handling,
 * which no other test covers.
 */

describe('page to extension content-script relay', () => {
	let windowMock: FakeWindow;

	beforeEach(() => {
		windowMock = createFakeWindow();
		vi.stubGlobal('window', windowMock);
		vi.stubGlobal('localStorage', {
			getItem: () => 'true',
			setItem: () => {},
			removeItem: () => {}
		});
	});

	afterEach(() => {
		vi.unstubAllGlobals();
		vi.restoreAllMocks();
	});

	it('relays a real client request to the extension and resolves with its result', async () => {
		const { sent } = loadContentScript({
			window: windowMock,
			sendMessage: async (message) => {
				expect(message.type).toBe('mimin:request');
				return { ok: true, result: { tabs: [], tabId: 4 } };
			}
		});
		setBrowserBridgeEnabled(true);

		const result = await requestBrowserBridge('browser_tabs_list', {});

		expect(result).toEqual({ tabs: [], tabId: 4 });
		expect(sent).toHaveLength(1);
		expect(sent[0]).toMatchObject({
			type: 'mimin:request',
			pageOrigin: PROBE_ORIGIN,
			request: { source: 'mimin-webui', action: 'browser_tabs_list', args: {} }
		});
		// The relayed request keeps the id the client is waiting on.
		const relayedId = (sent[0].request as AnyRecord).id;
		expect(typeof relayedId).toBe('string');
		const reply = windowMock.posted.find((entry) => entry.data.source === 'mimin-extension');
		expect(reply?.data.id).toBe(relayedId);
		expect(reply?.data.ok).toBe(true);
	});

	it('carries every action the app can ask for, including the new tab actions', async () => {
		const { sent } = loadContentScript({ window: windowMock });
		setBrowserBridgeEnabled(true);

		for (const action of [
			'ping',
			'browser_search',
			'browser_open',
			'browser_tabs_list',
			'browser_tab_read',
			'browser_tab_interact'
		] as const) {
			await requestBrowserBridge(action, {});
		}

		expect(sent.map((message) => (message.request as AnyRecord).action)).toEqual([
			'ping',
			'browser_search',
			'browser_open',
			'browser_tabs_list',
			'browser_tab_read',
			'browser_tab_interact'
		]);
	});

	it('propagates an extension-side failure as a rejected client request', async () => {
		loadContentScript({
			window: windowMock,
			sendMessage: async () => ({ ok: false, error: 'Private or local URLs cannot be opened.' })
		});
		setBrowserBridgeEnabled(true);

		await expect(requestBrowserBridge('browser_open', { url: 'http://x/' })).rejects.toThrow(
			'Private or local URLs cannot be opened.'
		);
	});

	it('turns a thrown runtime error into a rejected client request', async () => {
		loadContentScript({
			window: windowMock,
			sendMessage: () => {
				throw new Error('Receiving end does not exist.');
			}
		});
		setBrowserBridgeEnabled(true);

		await expect(requestBrowserBridge('ping', {})).rejects.toThrow('Receiving end does not exist.');
	});

	it('ignores page messages from a non-allowed origin', async () => {
		const { sent } = loadContentScript({
			window: windowMock,
			allowedOrigins: ['https://other.example']
		});
		setBrowserBridgeEnabled(true);

		windowMock.dispatchMessage({
			source: 'mimin-webui',
			id: 'spoofed-1',
			action: 'browser_open',
			args: { url: 'https://example.com' }
		});

		await Promise.resolve();
		expect(sent).toEqual([]);
	});

	it('ignores page messages whose source is not the page itself', async () => {
		const { sent } = loadContentScript({ window: windowMock });
		setBrowserBridgeEnabled(true);

		windowMock.dispatchMessage(
			{ source: 'mimin-webui', id: 'iframe-1', action: 'browser_open', args: {} },
			PROBE_ORIGIN,
			{ notTheWindow: true }
		);

		await Promise.resolve();
		expect(sent).toEqual([]);
	});

	it.each([
		['unknown action', { source: 'mimin-webui', id: 'a', action: 'browser_delete_everything' }],
		['missing id', { source: 'mimin-webui', action: 'browser_open', args: {} }],
		['empty id', { source: 'mimin-webui', id: '', action: 'browser_open', args: {} }],
		['oversized id', { source: 'mimin-webui', id: 'x'.repeat(129), action: 'browser_open' }],
		['wrong source', { source: 'evil', id: 'a', action: 'browser_open' }],
		['array args', { source: 'mimin-webui', id: 'a', action: 'browser_open', args: [] }],
		['string args', { source: 'mimin-webui', id: 'a', action: 'browser_open', args: 'nope' }]
	])('ignores a malformed page message: %s', async (_label, payload) => {
		const { sent } = loadContentScript({ window: windowMock });
		setBrowserBridgeEnabled(true);

		windowMock.dispatchMessage(payload);
		await Promise.resolve();
		expect(sent).toEqual([]);
	});

	it('does not let a spoofed reply resolve a client request', async () => {
		let relayedId = '';
		loadContentScript({
			window: windowMock,
			sendMessage: (message) => {
				relayedId = String((message.request as AnyRecord).id);
				return new Promise(() => {}); // never resolves; the spoof must not settle it
			}
		});
		setBrowserBridgeEnabled(true);

		const pending = requestBrowserBridge('browser_tabs_list', {});
		await Promise.resolve();

		// Same id but the wrong source, then the right source with a wrong id.
		windowMock.dispatchMessage({ source: 'evil', id: relayedId, ok: true, result: { tabs: [] } });
		windowMock.dispatchMessage({ source: 'mimin-extension', id: 'other-id', ok: true, result: {} });
		await Promise.resolve();

		let settled = false;
		void pending.then(
			() => {
				settled = true;
			},
			() => {
				settled = true;
			}
		);
		await Promise.resolve();
		expect(settled).toBe(false);

		// The genuine reply still resolves it.
		windowMock.dispatchMessage({
			source: 'mimin-extension',
			id: relayedId,
			ok: true,
			result: { tabs: [1] }
		});
		await expect(pending).resolves.toEqual({ tabs: [1] });
	});
});
