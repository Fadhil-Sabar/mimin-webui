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
import { runInThisContext } from 'node:vm';
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
