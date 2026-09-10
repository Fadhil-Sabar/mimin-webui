import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
	BROWSER_BRIDGE_STORAGE_KEY,
	getBrowserBridgeStatus,
	handleBrowserRequest,
	requestBrowserBridge,
	setBrowserBridgeEnabled
} from '../src/lib/client/browser-bridge';
import { streamMessage } from '../src/lib/client/api';

type Listener = (event: MessageEvent) => void;

function createWindowMock() {
	const listeners = new Set<Listener>();
	const location = { origin: 'http://localhost:5173' };
	const windowMock = {
		location,
		addEventListener: vi.fn((_type: string, listener: Listener) => listeners.add(listener)),
		removeEventListener: vi.fn((_type: string, listener: Listener) => listeners.delete(listener)),
		postMessage: vi.fn(),
		dispatchMessage(data: unknown, origin = location.origin, source?: unknown) {
			const event = {
				data,
				origin,
				source: source === undefined ? windowMock : source
			} as MessageEvent;
			for (const listener of [...listeners]) listener(event);
		}
	};
	return windowMock;
}

function createStorageMock() {
	const values = new Map<string, string>();
	return {
		getItem: vi.fn((key: string) => values.get(key) ?? null),
		setItem: vi.fn((key: string, value: string) => values.set(key, value)),
		removeItem: vi.fn((key: string) => values.delete(key))
	};
}

describe('browser bridge client', () => {
	let windowMock: ReturnType<typeof createWindowMock>;
	let storageMock: ReturnType<typeof createStorageMock>;

	beforeEach(() => {
		windowMock = createWindowMock();
		storageMock = createStorageMock();
		vi.stubGlobal('window', windowMock);
		vi.stubGlobal('localStorage', storageMock);
		vi.stubGlobal('fetch', vi.fn());
	});

	afterEach(() => {
		vi.restoreAllMocks();
		vi.unstubAllGlobals();
	});

	it('does not expose a capability when the local setting is disabled', async () => {
		setBrowserBridgeEnabled(false);

		expect(await getBrowserBridgeStatus()).toEqual({
			connected: false,
			updateRequired: false,
			message: 'Disabled on this browser.',
			requiredVersion: '0.4.1'
		});
		await expect(requestBrowserBridge('ping')).rejects.toThrow('Browser bridge is disabled.');
		expect(windowMock.postMessage).not.toHaveBeenCalled();
		expect(storageMock.getItem).toHaveBeenCalledWith(BROWSER_BRIDGE_STORAGE_KEY);
	});

	it('does not treat the old package-install preference as bridge consent', async () => {
		storageMock.setItem('mimin:browser-extension-enabled', 'true');

		expect(await getBrowserBridgeStatus()).toEqual({
			connected: false,
			updateRequired: false,
			message: 'Disabled on this browser.',
			requiredVersion: '0.4.1'
		});
		expect(windowMock.postMessage).not.toHaveBeenCalled();
	});

	it('reports an enabled bridge as unavailable when the request is canceled before reply', async () => {
		setBrowserBridgeEnabled(true);
		const controller = new AbortController();
		const statusPromise = getBrowserBridgeStatus(controller.signal);
		controller.abort();

		expect(await statusPromise).toEqual({
			connected: false,
			updateRequired: false,
			message: 'Browser request canceled.',
			requiredVersion: '0.4.1'
		});
		expect(windowMock.postMessage).toHaveBeenCalledWith(
			expect.objectContaining({ source: 'mimin-webui', action: 'ping' }),
			'http://localhost:5173'
		);
	});

	it('ignores replies from another origin or source', async () => {
		setBrowserBridgeEnabled(true);
		const controller = new AbortController();
		const request = requestBrowserBridge('ping', {}, controller.signal);
		const [message] = windowMock.postMessage.mock.calls[0];

		windowMock.dispatchMessage(
			{ source: 'mimin-extension', id: message.id, ok: true },
			'https://evil.test'
		);
		windowMock.dispatchMessage(
			{ source: 'mimin-extension', id: message.id, ok: true },
			windowMock.location.origin,
			null
		);
		await Promise.resolve();
		expect(windowMock.removeEventListener).not.toHaveBeenCalled();

		windowMock.dispatchMessage(
			{ source: 'mimin-extension', id: message.id, ok: true },
			windowMock.location.origin
		);
		await expect(request).resolves.toEqual(undefined);
		expect(windowMock.removeEventListener).toHaveBeenCalled();
	});

	it('relays a valid extension result to the authenticated browser result endpoint', async () => {
		setBrowserBridgeEnabled(true);
		vi.mocked(fetch).mockResolvedValue(new Response('{}', { status: 200 }));
		windowMock.postMessage.mockImplementation((message: { id: string; action: string }) => {
			if (message.action !== 'browser_open') return;
			queueMicrotask(() =>
				windowMock.dispatchMessage({
					source: 'mimin-extension',
					id: message.id,
					ok: true,
					result: { url: 'https://chatgpt.com/share/example', title: 'Shared chat' }
				})
			);
		});

		await handleBrowserRequest({
			requestId: '6a9d510f-bbc4-83ec-bd10-2c0767c67d92',
			token: '6a9d510f-bbc4-83ec-bd10-2c0767c67d92',
			action: 'browser_open',
			args: { url: 'https://chatgpt.com/share/6a9d510f-bbc4-83ec-bd10-2c0767c67d92' }
		});

		expect(fetch).toHaveBeenCalledWith(
			'/api/browser/result',
			expect.objectContaining({
				method: 'POST',
				headers: { 'content-type': 'application/json' },
				body: expect.stringContaining('"ok":true')
			})
		);
		const [, init] = vi.mocked(fetch).mock.calls[0];
		expect(JSON.parse(String((init as RequestInit).body))).toMatchObject({
			requestId: '6a9d510f-bbc4-83ec-bd10-2c0767c67d92',
			token: '6a9d510f-bbc4-83ec-bd10-2c0767c67d92',
			ok: true,
			result: { url: 'https://chatgpt.com/share/example', title: 'Shared chat' }
		});
	});

	it('reports extension failures to the result endpoint instead of losing the request', async () => {
		setBrowserBridgeEnabled(true);
		vi.mocked(fetch).mockResolvedValue(new Response('{}', { status: 200 }));
		windowMock.postMessage.mockImplementation((message: { id: string; action: string }) => {
			if (message.action !== 'browser_open') return;
			queueMicrotask(() =>
				windowMock.dispatchMessage({
					source: 'mimin-extension',
					id: message.id,
					ok: false,
					error: 'Blocked URL'
				})
			);
		});

		await handleBrowserRequest({
			requestId: '6a9d510f-bbc4-83ec-bd10-2c0767c67d92',
			token: '6a9d510f-bbc4-83ec-bd10-2c0767c67d92',
			action: 'browser_open',
			args: { url: 'https://chatgpt.com/share/example' }
		});

		const [, init] = vi.mocked(fetch).mock.calls[0];
		expect(JSON.parse(String((init as RequestInit).body))).toMatchObject({
			ok: false,
			error: 'Blocked URL'
		});
	});

	it('handles an SSE browser request and posts its result before continuing the stream', async () => {
		setBrowserBridgeEnabled(true);
		const events: unknown[] = [];
		const requestId = '6a9d510f-bbc4-83ec-bd10-2c0767c67d92';
		const token = '6a9d510f-bbc4-83ec-bd10-2c0767c67d92';
		windowMock.postMessage.mockImplementation((message: { id: string; action: string }) => {
			queueMicrotask(() =>
				windowMock.dispatchMessage({
					source: 'mimin-extension',
					id: message.id,
					ok: true,
					result:
						message.action === 'ping'
							? { version: '0.4.1', permissions: { google: true, publicWebsites: true } }
							: { url: 'https://chatgpt.com/share/example', title: 'Shared chat' }
				})
			);
		});
		vi.mocked(fetch)
			.mockResolvedValueOnce(
				new Response(
					`event: browser.request\ndata: ${JSON.stringify({
						type: 'browser.request',
						requestId,
						token,
						action: 'browser_open',
						args: { url: 'https://chatgpt.com/share/example' }
					})}\n\n` + `event: done\ndata: ${JSON.stringify({ type: 'done' })}\n\n`,
					{ status: 200, headers: { 'content-type': 'text/event-stream' } }
				)
			)
			.mockResolvedValueOnce(new Response('{}', { status: 200 }));

		await streamMessage('conversation-1', 'open the shared chat', (event) => events.push(event));

		expect(events).toEqual([{ type: 'done' }]);
		expect(fetch).toHaveBeenCalledTimes(2);
		expect(vi.mocked(fetch).mock.calls[0][1]).toEqual(
			expect.objectContaining({
				headers: expect.objectContaining({
					'x-mimin-browser-bridge': '1',
					accept: 'text/event-stream'
				})
			})
		);
		const [, resultInit] = vi.mocked(fetch).mock.calls[1];
		expect(JSON.parse(String((resultInit as RequestInit).body))).toMatchObject({
			requestId,
			token,
			ok: true
		});
	});

	it('sends no bridge capability header when the extension is disabled', async () => {
		setBrowserBridgeEnabled(false);
		vi.mocked(fetch).mockResolvedValue(
			new Response('event: done\ndata: {"type":"done"}\n\n', {
				status: 200,
				headers: { 'content-type': 'text/event-stream' }
			})
		);

		await streamMessage('conversation-1', 'hello', vi.fn());

		expect(windowMock.postMessage).not.toHaveBeenCalled();
		expect(vi.mocked(fetch).mock.calls[0][1]).toEqual(
			expect.objectContaining({
				headers: { 'content-type': 'application/json', accept: 'text/event-stream' }
			})
		);
	});

	it('detects outdated extension (installed 0.2.0, required 0.4.1) and marks update required', async () => {
		setBrowserBridgeEnabled(true);
		windowMock.postMessage.mockImplementation((message: { id: string; action: string }) => {
			if (message.action !== 'ping') return;
			queueMicrotask(() =>
				windowMock.dispatchMessage({
					source: 'mimin-extension',
					id: message.id,
					ok: true,
					result: {
						version: '0.2.0',
						permissions: { google: true, publicWebsites: false }
					}
				})
			);
		});

		const status = await getBrowserBridgeStatus();
		expect(status.connected).toBe(false);
		expect(status.updateRequired).toBe(true);
		expect(status.version).toBe('0.2.0');
		expect(status.requiredVersion).toBe('0.4.1');
		expect(status.message).toContain('Extension update required');
	});

	it('accepts a newer extension than required as connected and usable', async () => {
		setBrowserBridgeEnabled(true);
		windowMock.postMessage.mockImplementation((message: { id: string; action: string }) => {
			if (message.action !== 'ping') return;
			queueMicrotask(() =>
				windowMock.dispatchMessage({
					source: 'mimin-extension',
					id: message.id,
					ok: true,
					result: {
						// Newer than this client requires, so it must still be accepted.
						version: '0.4.2',
						permissions: { google: true, publicWebsites: true }
					}
				})
			);
		});

		const status = await getBrowserBridgeStatus();
		expect(status.connected).toBe(true);
		expect(status.updateRequired).toBe(false);
		expect(status.version).toBe('0.4.2');
		expect(status.requiredVersion).toBe('0.4.1');
		expect(status.permissions?.publicWebsites).toBe(true);
	});
});
