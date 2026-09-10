import { readFileSync } from 'node:fs';
import { runInThisContext } from 'node:vm';
import { afterEach, describe, expect, it, vi } from 'vitest';

type AnyRecord = Record<string, unknown>;

type MockTab = {
	id: number;
	url?: string;
	title?: string;
	active?: boolean;
	pinned?: boolean;
	status?: string;
};

const LOCAL_ORIGIN = 'http://localhost:5173';

function matchesPattern(pattern: string, origin: string) {
	if (pattern === 'http://*/*') return origin.startsWith('http://');
	if (pattern === 'https://*/*') return origin.startsWith('https://');
	return pattern.replace(/\/\*$/, '') === origin.replace(/\/\*$/, '');
}

function loadExtension(options: { tabs: MockTab[]; granted?: string[] }) {
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
			elements: [{ ref: 0, tag: 'a', name: 'More' }],
			captcha: false
		}
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
		allowedOrigins: [LOCAL_ORIGIN]
	});
	vi.stubGlobal('MIMIN_EXTENSION_TEST_HOOKS', hooks);

	const code = readFileSync(
		new URL('../browser-extension/src/background-core.js', import.meta.url),
		'utf8'
	);
	runInThisContext(code);

	const send = (action: string, args: AnyRecord = {}, senderOrigin = LOCAL_ORIGIN) =>
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
		createCalls
	};
}

afterEach(() => {
	vi.unstubAllGlobals();
	vi.restoreAllMocks();
});

const exampleTabs: MockTab[] = [
	{ id: 1, url: 'https://example.com/docs', title: 'Example Docs' },
	{ id: 2, url: 'https://news.example.org/', title: 'News', active: true },
	{ id: 3, url: 'chrome://extensions', title: 'Extensions' },
	{ id: 4, url: 'http://192.168.1.10/admin', title: 'Router' },
	{ id: 5, title: 'Hidden' }
];

describe('extension tab actions', () => {
	it('lists only permitted tabs and never exposes private or internal URLs', async () => {
		const harness = loadExtension({ tabs: exampleTabs, granted: ['https://example.com/*'] });
		const reply = await harness.send('browser_tabs_list');

		expect(reply.ok).toBe(true);
		const result = reply.result as { tabs: AnyRecord[]; tabId: number };
		// chrome:// and the private 192.168 address are omitted entirely.
		expect(result.tabs.map((tab) => tab.tabId)).toEqual([2, 1, 5]);
		expect(result.tabId).toBe(2);

		const permitted = result.tabs.find((tab) => tab.tabId === 1);
		expect(permitted).toMatchObject({
			url: 'https://example.com/docs',
			title: 'Example Docs',
			readable: true
		});

		const unpermitted = result.tabs.find((tab) => tab.tabId === 2);
		expect(unpermitted).toMatchObject({ readable: false, reason: 'host_permission_required' });

		const hidden = result.tabs.find((tab) => tab.tabId === 5);
		expect(hidden).toMatchObject({ readable: false, reason: 'url_hidden' });
		expect(hidden?.url).toBeUndefined();
	});

	it('prefers the tab Mimin last used over an unrelated active tab', async () => {
		const harness = loadExtension({ tabs: exampleTabs, granted: ['https://*/*'] });
		const active = await (harness.hooks.resolveTab as (args: AnyRecord) => Promise<AnyRecord>)({});
		expect(active?.url).toBe('https://news.example.org/');

		await harness.send('browser_tab_interact', { tabId: 1, action: 'read' });
		const continued = await (harness.hooks.resolveTab as (args: AnyRecord) => Promise<AnyRecord>)(
			{}
		);
		expect(continued?.id).toBe(1);
	});

	it('reads a permitted tab and returns a snapshot with interactive elements', async () => {
		const harness = loadExtension({ tabs: exampleTabs, granted: ['https://example.com/*'] });
		const reply = await harness.send('browser_tab_read', { tabId: 1 });

		expect(reply.ok).toBe(true);
		const result = reply.result as AnyRecord;
		expect(result).toMatchObject({
			readable: true,
			tabId: 1,
			title: 'Example Docs',
			url: 'https://example.com/docs'
		});
		expect(result.elements).toEqual([{ ref: 0, tag: 'a', name: 'More' }]);
		expect(harness.executeCalls).toEqual([{ name: 'pageSnapshot', args: [{ google: false }] }]);
	});

	it('reports host_permission_required instead of reading an unpermitted tab', async () => {
		const harness = loadExtension({ tabs: exampleTabs, granted: [] });
		const reply = await harness.send('browser_tab_read', { tabId: 1 });

		expect(reply.ok).toBe(true);
		expect(reply.result).toMatchObject({
			readable: false,
			reason: 'host_permission_required',
			tabId: 1
		});
		expect(harness.executeCalls).toEqual([]);
	});

	it('does not retarget an explicit tabId that does not exist', async () => {
		const harness = loadExtension({ tabs: exampleTabs, granted: ['https://*/*'] });
		const reply = await harness.send('browser_tab_read', { tabId: 999 });

		expect(reply.ok).toBe(false);
		expect(String(reply.error)).toContain('No matching open tab');
		expect(harness.executeCalls).toEqual([]);
	});

	it('clicks a referenced element and returns a fresh snapshot', async () => {
		const harness = loadExtension({ tabs: exampleTabs, granted: ['https://*/*'] });
		const reply = await harness.send('browser_tab_interact', {
			tabId: 1,
			action: 'click',
			ref: 0
		});

		expect(reply.ok).toBe(true);
		expect(harness.executeCalls.map((call) => call.name)).toEqual(['interactPage', 'pageSnapshot']);
		expect(harness.executeCalls[0].args[0]).toMatchObject({ action: 'click', ref: 0 });
		expect((reply.result as AnyRecord).readable).toBe(true);
	});

	it('surfaces interaction failures from the page', async () => {
		const harness = loadExtension({ tabs: exampleTabs, granted: ['https://*/*'] });
		harness.interactOutcome.value = { ok: false, error: 'No matching element was found to click.' };
		const reply = await harness.send('browser_tab_interact', {
			tabId: 1,
			action: 'click',
			ref: 4
		});

		expect(reply.ok).toBe(false);
		expect(String(reply.error)).toContain('No matching element');
	});

	it('validates navigate targets through tabs.update', async () => {
		const harness = loadExtension({ tabs: exampleTabs, granted: ['https://*/*'] });
		const reply = await harness.send('browser_tab_interact', {
			tabId: 1,
			action: 'navigate',
			url: 'https://example.com/next'
		});

		expect(reply.ok).toBe(true);
		expect(harness.updateCalls).toEqual([{ id: 1, props: { url: 'https://example.com/next' } }]);
		// Navigation does not need to inject the interaction function.
		expect(harness.executeCalls.map((call) => call.name)).toEqual(['pageSnapshot']);

		const blocked = await harness.send('browser_tab_interact', {
			tabId: 1,
			action: 'navigate',
			url: 'http://127.0.0.1/'
		});
		expect(blocked.ok).toBe(false);
		expect(String(blocked.error)).toContain('Private or local URLs');
	});

	it('keeps browser_open working for explicitly requested URLs', async () => {
		const harness = loadExtension({ tabs: [], granted: ['https://*/*'] });
		const reply = await harness.send('browser_open', { url: 'https://example.com/open' });

		expect(reply.ok).toBe(true);
		expect(harness.createCalls[0]).toMatchObject({ url: 'https://example.com/open' });
		expect((reply.result as AnyRecord).readable).toBe(true);
	});

	it('rejects unsupported bridge actions', async () => {
		const harness = loadExtension({ tabs: exampleTabs, granted: ['https://*/*'] });
		const reply = await harness.send('browser_wat');
		expect(reply.ok).toBe(false);
		expect(reply.error).toBe('Unsupported bridge action.');
	});

	it('refuses requests from a page that is not an allowed Mimin origin', async () => {
		const harness = loadExtension({ tabs: exampleTabs, granted: ['https://*/*'] });
		const reply = await harness.send('browser_tabs_list', {}, 'https://evil.example.com');
		expect(reply.ok).toBe(false);
		expect(reply.error).toBe('This page is not an allowed Mimin origin.');
	});
});

function fakeElement(tag: string, props: AnyRecord = {}) {
	const attributes = (props.attributes as AnyRecord) ?? {};
	const element: AnyRecord = {
		tagName: tag.toUpperCase(),
		isConnected: true,
		disabled: false,
		hidden: false,
		...props,
		dispatched: [] as string[],
		clicked: 0,
		focused: false,
		dispatchEvent(event: { type: string }) {
			(element.dispatched as string[]).push(event.type);
			return true;
		},
		getAttribute(name: string) {
			return attributes[name] ?? null;
		},
		focus() {
			element.focused = true;
		},
		scrollIntoView() {},
		click() {
			element.clicked = Number(element.clicked) + 1;
		},
		select() {}
	};
	return element;
}

describe('injected page interaction', () => {
	it('resolves refs, clicks, and reports unsupported targets', async () => {
		const harness = loadExtension({ tabs: exampleTabs, granted: ['https://*/*'] });
		const interactPage = harness.hooks.interactPage as (payload: AnyRecord) => AnyRecord;
		const button = fakeElement('button', { innerText: 'Sign in' });

		vi.stubGlobal('__miminElementRefs', [button]);
		expect(interactPage({ action: 'click', ref: 0 })).toMatchObject({
			ok: true,
			performed: 'clicked'
		});
		expect(button.clicked).toBe(1);
		expect(button.focused).toBe(true);

		expect(interactPage({ action: 'click', ref: 9 })).toMatchObject({ ok: false });
		expect(interactPage({ action: 'teleport' })).toMatchObject({ ok: false });
	});

	it('types into inputs by dispatching input and change events', async () => {
		const harness = loadExtension({ tabs: exampleTabs, granted: ['https://*/*'] });
		const interactPage = harness.hooks.interactPage as (payload: AnyRecord) => AnyRecord;
		const input = fakeElement('input', { value: '' });

		vi.stubGlobal('__miminElementRefs', [input]);
		expect(interactPage({ action: 'type', ref: 0, text: 'hello' })).toMatchObject({
			ok: true,
			performed: 'typed'
		});
		expect(input.value).toBe('hello');
		expect(input.dispatched).toEqual(['input', 'change']);

		vi.stubGlobal(
			'KeyboardEvent',
			class {
				type: string;
				constructor(type: string) {
					this.type = type;
				}
			}
		);
		expect(interactPage({ action: 'type', ref: 0, text: 'world', submit: true })).toMatchObject({
			ok: true,
			performed: 'typed'
		});
		expect(input.dispatched).toEqual([
			'input',
			'change',
			'input',
			'change',
			'keydown',
			'keypress',
			'keyup'
		]);
	});

	it('scrolls the window by direction', async () => {
		const harness = loadExtension({ tabs: exampleTabs, granted: ['https://*/*'] });
		const interactPage = harness.hooks.interactPage as (payload: AnyRecord) => AnyRecord;
		const calls: Array<{ kind: string; value: AnyRecord }> = [];
		vi.stubGlobal('scrollTo', (value: AnyRecord) => calls.push({ kind: 'to', value }));
		vi.stubGlobal('scrollBy', (value: AnyRecord) => calls.push({ kind: 'by', value }));

		expect(interactPage({ action: 'scroll', direction: 'down', amount: 400 })).toMatchObject({
			ok: true,
			performed: 'scrolled'
		});
		expect(interactPage({ action: 'scroll', direction: 'top' })).toMatchObject({ ok: true });
		expect(calls).toEqual([
			{ kind: 'by', value: { top: 400, behavior: 'instant' } },
			{ kind: 'to', value: { top: 0, behavior: 'instant' } }
		]);
	});
});
