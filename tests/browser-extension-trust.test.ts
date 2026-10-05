import { afterEach, describe, expect, it, vi } from 'vitest';
import {
	EXTENSION_ID,
	loadExtension,
	PROBE_ORIGIN,
	type AnyRecord
} from './helpers/extension-harness';

/**
 * Who may drive the browser bridge.
 *
 * One signed package has to serve every self-hosted instance, so the set of allowed origins cannot
 * be baked in at build time. These tests pin down what replaces it: the origins the package was
 * built for, localhost on any port, and whatever the user connected through the popup — and
 * nothing else. A regression here is a page on an unrelated site driving the user's browser.
 */

const PROBE_TAB = { id: 1, url: `${PROBE_ORIGIN}/`, active: true };
const LAN_ORIGIN = 'http://192.168.1.50:3200';
/** What the popup grants for `LAN_ORIGIN`: a match pattern cannot carry a port. */
const LAN_PATTERN = 'http://192.168.1.50/*';

afterEach(() => {
	vi.unstubAllGlobals();
	vi.restoreAllMocks();
});

describe('bridge trust policy', () => {
	it('trusts the built-in origin and localhost on any port, and nothing else', () => {
		const { hooks } = loadExtension({ tabs: [PROBE_TAB] });
		const trusted = hooks.isTrustedOrigin as (origin: string) => boolean;

		expect(trusted(PROBE_ORIGIN)).toBe(true);
		expect(trusted('http://localhost:3200')).toBe(true);
		expect(trusted('http://127.0.0.1:3200')).toBe(true);
		// A host that merely starts with the word localhost is a different site entirely.
		expect(trusted('http://localhost.evil.test')).toBe(false);
		expect(trusted('http://192.168.1.50:3200')).toBe(false);
		expect(trusted('https://mimin.example.com')).toBe(false);
		expect(trusted('')).toBe(false);
	});

	it('builds a match pattern without the port, which is what the permission covers', () => {
		const { hooks } = loadExtension({ tabs: [PROBE_TAB] });
		const pattern = hooks.originMatchPattern as (origin: string) => string;

		expect(pattern(LAN_ORIGIN)).toBe(LAN_PATTERN);
		expect(pattern('https://mimin.example.com')).toBe('https://mimin.example.com/*');
	});

	it('rejects a request from an origin that is neither built in nor connected', async () => {
		const { send } = loadExtension({ tabs: [PROBE_TAB] });

		const reply = await send('browser_tabs_list', {}, LAN_ORIGIN);

		expect(reply.ok).toBe(false);
		expect(String(reply.error)).toContain('not connected');
	});

	it('serves a request from localhost on another port without connecting it', async () => {
		const { send } = loadExtension({ tabs: [PROBE_TAB] });

		const reply = await send('browser_tabs_list', {}, 'http://localhost:3200');

		expect(reply.ok).toBe(true);
	});

	it('connects a site only once its host permission is granted', async () => {
		const granted: string[] = [];
		const harness = loadExtension({ tabs: [PROBE_TAB], granted });

		// Without the permission there is nothing to register, so nothing is trusted.
		const refused = await harness.sendMessage({
			type: 'mimin:connect-site',
			origin: LAN_ORIGIN,
			tabId: 1
		});
		expect(refused.ok).toBe(false);
		expect(String(refused.error)).toContain(LAN_PATTERN);
		expect(harness.registeredScripts.size).toBe(0);
		expect((await harness.send('browser_tabs_list', {}, LAN_ORIGIN)).ok).toBe(false);

		// The popup requests the permission, and only then asks the background to connect the site.
		granted.push(LAN_PATTERN);
		const connected = await harness.sendMessage({
			type: 'mimin:connect-site',
			origin: LAN_ORIGIN,
			tabId: 1
		});

		expect(connected.ok).toBe(true);
		expect((connected.result as AnyRecord).connectedOrigins).toEqual([LAN_ORIGIN]);
		expect((await harness.send('browser_tabs_list', {}, LAN_ORIGIN)).ok).toBe(true);
		// A content script is registered for the site, and the open tab is injected right away, so
		// connecting never needs a reload.
		expect([...harness.registeredScripts.values()]).toEqual([
			expect.objectContaining({
				matches: [LAN_PATTERN],
				js: ['content.js'],
				runAt: 'document_start'
			})
		]);
		expect(
			harness.executeCalls.some((call) => call.files?.includes('content.js'))
		).toBe(true);
	});

	it('forgets a disconnected site and drops its content script', async () => {
		const harness = loadExtension({ tabs: [PROBE_TAB], granted: [LAN_PATTERN] });
		await harness.sendMessage({ type: 'mimin:connect-site', origin: LAN_ORIGIN, tabId: 1 });
		expect(harness.registeredScripts.size).toBe(1);

		const reply = await harness.sendMessage({ type: 'mimin:disconnect-site', origin: LAN_ORIGIN });

		expect(reply.ok).toBe(true);
		expect((reply.result as AnyRecord).connectedOrigins).toEqual([]);
		expect(harness.registeredScripts.size).toBe(0);
		expect((await harness.send('browser_tabs_list', {}, LAN_ORIGIN)).ok).toBe(false);
	});

	it('keeps connected sites across a restart', async () => {
		const granted = [LAN_PATTERN];
		const first = loadExtension({ tabs: [PROBE_TAB], granted });
		await first.sendMessage({ type: 'mimin:connect-site', origin: LAN_ORIGIN, tabId: 1 });

		// A new background script over the same storage is what a browser restart looks like.
		const second = loadExtension({ tabs: [PROBE_TAB], granted });
		Object.assign(second.stored, first.stored);
		await (second.hooks.syncConnectedContentScripts as () => Promise<void>)();

		expect(await (second.hooks.ensureConnectedOrigins as () => Promise<string[]>)()).toEqual([
			LAN_ORIGIN
		]);
		expect(second.registeredScripts.size).toBe(1);
		expect((await second.send('browser_tabs_list', {}, LAN_ORIGIN)).ok).toBe(true);
	});

	it('refuses a page that asks to connect itself', async () => {
		const harness = loadExtension({ tabs: [PROBE_TAB], granted: [LAN_PATTERN] });

		// A content-script sender carries the tab it came from, which a popup message never does.
		const reply = await harness.sendMessage(
			{ type: 'mimin:connect-site', origin: LAN_ORIGIN },
			{ id: EXTENSION_ID, tab: { id: 1 }, origin: LAN_ORIGIN }
		);

		expect(reply.ok).toBe(false);
		expect(harness.registeredScripts.size).toBe(0);
	});

	it('refuses to connect anything that is not an http(s) origin', async () => {
		const harness = loadExtension({ tabs: [PROBE_TAB], granted: ['http://*/*'] });

		for (const origin of ['file:///tmp/x', 'javascript:alert(1)', 'not a url', '']) {
			const reply = await harness.sendMessage({ type: 'mimin:connect-site', origin });
			expect(reply.ok).toBe(false);
		}
		expect(harness.registeredScripts.size).toBe(0);
	});

	it('trusts the site an address belongs to, whatever path it was sent with', async () => {
		const harness = loadExtension({ tabs: [PROBE_TAB], granted: ['http://*/*'] });

		// Trust is per origin, so a message naming a path or query on a granted site connects the
		// site itself; the pattern never carries a path either.
		const reply = await harness.sendMessage({
			type: 'mimin:connect-site',
			origin: `${LAN_ORIGIN}/settings?tab=1`
		});

		expect(reply.ok).toBe(true);
		expect((reply.result as AnyRecord).connectedOrigins).toEqual([LAN_ORIGIN]);
		expect([...harness.registeredScripts.values()]).toEqual([
			expect.objectContaining({ matches: [LAN_PATTERN] })
		]);
	});

	it('reports what it serves and what it trusts', async () => {
		const harness = loadExtension({ tabs: [PROBE_TAB] });

		const reply = await harness.sendMessage({ type: 'mimin:status' });

		expect(reply.result).toMatchObject({
			version: '0.4.3',
			allowedOrigins: [PROBE_ORIGIN],
			connectedOrigins: [],
			universal: true,
			trustLocalhost: true
		});
	});

	it('can be narrowed to a fixed build that trusts neither localhost nor new sites', async () => {
		const harness = loadExtension({
			tabs: [PROBE_TAB],
			config: { universal: false, trustLocalhost: false }
		});
		const trusted = harness.hooks.isTrustedOrigin as (origin: string) => boolean;

		expect(trusted(PROBE_ORIGIN)).toBe(true);
		expect(trusted('http://localhost:3200')).toBe(false);
		expect((await harness.send('browser_tabs_list', {})).ok).toBe(true);
		expect(
			(await harness.sendMessage({ type: 'mimin:connect-site', origin: 'http://localhost:3200' }))
				.ok
		).toBe(false);
	});
});
