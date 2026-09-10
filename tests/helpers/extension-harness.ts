/**
 * Loads the real `browser-extension/src/background-core.js` into a test process
 * with a mocked `chrome` API.
 *
 * This exercises the shipped background handler rather than a copy of it, so
 * action names, argument shapes, and result payloads cannot drift from the
 * extension that ships. Only the browser API, storage, and injected scripts are
 * mocked.
 */
import { readFileSync } from 'node:fs';
import { createContext, runInContext, runInThisContext } from 'node:vm';
import { vi } from 'vitest';

export type AnyRecord = Record<string, unknown>;

export type MockTab = {
	id: number;
	url?: string;
	title?: string;
	active?: boolean;
	pinned?: boolean;
	status?: string;
};

export const PROBE_ORIGIN = 'http://localhost:5173';

function matchesPattern(pattern: string, origin: string) {
	if (pattern === 'http://*/*') return origin.startsWith('http://');
	if (pattern === 'https://*/*') return origin.startsWith('https://');
	return pattern.replace(/\/\*$/, '') === origin.replace(/\/\*$/, '');
}

export function loadExtension(options: { tabs: MockTab[]; granted?: string[] }) {
	const hooks: AnyRecord = {};
	const messageListeners: Array<(message: unknown, sender: unknown, reply: unknown) => unknown> =
		[];
	const updateListeners = new Set<(id: number, info: AnyRecord) => void>();
	const executeCalls: Array<{ name: string; args: unknown[] }> = [];
	const granted = options.granted ?? [];
	const tabs: MockTab[] = options.tabs.map((tab) => ({ ...tab }));
	const stored: AnyRecord = {};
	const snapshot = {
		value: {
			url: 'https://example.com/docs',
			title: 'Example Docs',
			text: 'Documentation body',
			links: [{ title: 'More', url: 'https://example.com/more' }],
			results: [],
			elements: [{ ref: 0, tag: 'a', name: 'More', selector: 'a' }],
			captcha: false
		} as AnyRecord
	};
	const interactOutcome = {
		value: { ok: true, action: 'click', performed: 'clicked' } as AnyRecord
	};
	const updateCalls: Array<{ id: number; props: AnyRecord }> = [];
	const createCalls: AnyRecord[] = [];

	const chromeMock: AnyRecord = {
		runtime: {
			onMessage: { addListener: (listener: unknown) => messageListeners.push(listener as never) },
			lastError: undefined
		},
		storage: {
			session: {
				get: async (key: string) => (key in stored ? { [key]: stored[key] } : {}),
				set: async (values: AnyRecord) => {
					Object.assign(stored, values);
				},
				remove: async (key: string) => {
					delete stored[key];
				}
			}
		},
		tabs: {
			get: async (id: number) => {
				const tab = tabs.find((candidate) => candidate.id === id);
				if (!tab) throw new Error(`No tab with id ${id}`);
				return { ...tab, status: tab.status ?? 'complete' };
			},
			query: async (query: AnyRecord = {}) =>
				tabs
					.filter((tab) => (query.active ? Boolean(tab.active) : true))
					.map((tab) => ({ ...tab, status: tab.status ?? 'complete' })),
			create: async (props: AnyRecord) => {
				createCalls.push(props);
				const id = 900 + tabs.length;
				const tab: MockTab = { id, url: props.url as string, active: Boolean(props.active) };
				tabs.push(tab);
				return { ...tab, status: 'complete' };
			},
			update: async (id: number, props: AnyRecord) => {
				updateCalls.push({ id, props });
				const tab = tabs.find((candidate) => candidate.id === id);
				if (tab) Object.assign(tab, props);
				return { ...tab, status: 'complete' };
			},
			remove: async () => {},
			reload: async () => {},
			goBack: async () => {},
			goForward: async () => {},
			onUpdated: {
				addListener: (listener: (id: number, info: AnyRecord) => void) =>
					updateListeners.add(listener),
				removeListener: (listener: (id: number, info: AnyRecord) => void) =>
					updateListeners.delete(listener)
			},
			onRemoved: { addListener: () => {}, removeListener: () => {} }
		},
		scripting: {
			executeScript: async (injection: AnyRecord) => {
				const func = injection.func as { name?: string } | undefined;
				const name = func?.name ?? 'anonymous';
				executeCalls.push({ name, args: (injection.args as unknown[]) ?? [] });
				if (name === 'pageSnapshot') return [{ result: snapshot.value }];
				if (name === 'interactPage') return [{ result: interactOutcome.value }];
				return [{ result: undefined }];
			}
		},
		permissions: {
			contains: async ({ origins = [] }: AnyRecord) =>
				(origins as string[]).every((origin) =>
					granted.some((pattern) => matchesPattern(pattern, origin))
				),
			request: async () => true,
			remove: async () => true
		}
	};

	vi.stubGlobal('chrome', chromeMock);
	vi.stubGlobal('MIMIN_EXTENSION_CONFIG', {
		version: '0.4.0',
		allowedOrigins: [PROBE_ORIGIN]
	});
	vi.stubGlobal('MIMIN_EXTENSION_TEST_HOOKS', hooks);

	const code = readFileSync(
		new URL('../../browser-extension/src/background-core.js', import.meta.url),
		'utf8'
	);
	runInThisContext(code);

	/** Dispatch a bridge request exactly as the content script would. */
	const send = (action: string, args: AnyRecord = {}, senderOrigin = PROBE_ORIGIN) =>
		new Promise<AnyRecord>((resolve) => {
			const listener = messageListeners[0];
			listener(
				{
					type: 'mimin:request',
					request: { source: 'mimin-webui', id: `req-${action}`, action, args },
					pageOrigin: senderOrigin
				},
				{ origin: senderOrigin },
				resolve
			);
		});

	return {
		send,
		hooks,
		executeCalls,
		snapshot,
		interactOutcome,
		tabs,
		stored,
		updateCalls,
		createCalls,
		chromeMock
	};
}

export type FakeWindow = {
	location: { origin: string };
	addEventListener: (type: string, listener: (event: AnyRecord) => void) => void;
	removeEventListener: (type: string, listener: (event: AnyRecord) => void) => void;
	postMessage: (data: unknown, origin?: string) => void;
	/** Simulate a message arriving on the page, as the extension would post it. */
	dispatchMessage: (data: unknown, origin?: string, source?: unknown) => void;
	listenerCount: () => number;
	posted: Array<{ data: AnyRecord; origin?: string }>;
	deliveries: Array<{ data: AnyRecord; origin?: string }>;
};

/**
 * A minimal `window` that dispatches `message` events, so the page-side
 * `postMessage` protocol can be driven without a DOM.
 */
export function createFakeWindow(origin = PROBE_ORIGIN): FakeWindow {
	const listeners = new Set<(event: AnyRecord) => void>();
	const posted: Array<{ data: AnyRecord; origin?: string }> = [];
	const deliveries: Array<{ data: AnyRecord; origin?: string }> = [];
	const fakeWindow: FakeWindow = {
		location: { origin },
		addEventListener: (type, listener) => {
			if (type === 'message') listeners.add(listener);
		},
		removeEventListener: (type, listener) => {
			if (type === 'message') listeners.delete(listener);
		},
		postMessage: (data, targetOrigin) => {
			const origin2 = targetOrigin ?? origin;
			posted.push({ data: data as AnyRecord, origin: origin2 });
			// Real postMessage is asynchronous and reaches only same-origin listeners.
			queueMicrotask(() => {
				if (origin2 !== origin) return;
				deliveries.push({ data: data as AnyRecord, origin: origin2 });
				for (const listener of [...listeners])
					listener({ data, origin: origin2, source: fakeWindow });
			});
		},
		dispatchMessage: (data, messageOrigin = origin, source) => {
			for (const listener of [...listeners])
				listener({
					data,
					origin: messageOrigin,
					source: source === undefined ? fakeWindow : source
				});
		},
		listenerCount: () => listeners.size,
		posted,
		deliveries
	};
	return fakeWindow;
}

/**
 * Loads the real `browser-extension/src/content.js` relay against a fake window
 * and a mocked extension runtime.
 */
export function loadContentScript(options: {
	window: FakeWindow;
	allowedOrigins?: string[];
	sendMessage?: (message: AnyRecord) => unknown;
}) {
	const sent: AnyRecord[] = [];
	const sendMessage =
		options.sendMessage ??
		(async (message: AnyRecord) => {
			void message;
			return { ok: true, result: { version: '0.4.0' } };
		});
	const sandbox: AnyRecord = {
		window: options.window,
		console,
		chrome: {
			runtime: {
				lastError: undefined,
				sendMessage: (message: AnyRecord) => {
					sent.push(message);
					return sendMessage(message);
				}
			}
		},
		MIMIN_EXTENSION_CONFIG: {
			version: '0.4.0',
			allowedOrigins: options.allowedOrigins ?? [PROBE_ORIGIN]
		}
	};
	sandbox.globalThis = sandbox;
	const context = createContext(sandbox);
	runInContext(
		readFileSync(new URL('../../browser-extension/src/content.js', import.meta.url), 'utf8'),
		context
	);
	return { sent };
}
