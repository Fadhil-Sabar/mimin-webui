import { afterEach, describe, expect, it, vi } from 'vitest';
import { loadExtension, type AnyRecord } from './helpers/extension-harness';

/**
 * Navigation must commit before the extension reads or interacts.
 *
 * `tabs.get().status` stays "complete" for the document being navigated away
 * from, so `waitForTabLoad(tabId, true)` resolved immediately against the old
 * page. The snapshot then described the old document and the ref registry was
 * written into it, so the moment the real navigation replaced that document the
 * registry was gone and the next interaction reported "No matching element was
 * found to click".
 *
 * Taken from a real turn: after `navigate` to a Maps search URL the result showed
 * the previous URL, and the following click and type both failed with missing
 * elements (14:44:16, 14:44:19, 14:44:23 in the app database).
 */

const page = 'https://example.com/docs';
const target = 'https://example.com/search?q=kafe';

afterEach(() => {
	vi.unstubAllGlobals();
	vi.restoreAllMocks();
});

/**
 * A tab that navigates the way Firefox does: the old document keeps reporting
 * "complete" until the new document commits a tick later.
 */
function loadNavigatingTab(options: { commitDelayMs?: number; onCommit?: () => void } = {}) {
	const commitDelayMs = options.commitDelayMs ?? 30;
	const harness = loadExtension({
		tabs: [{ id: 11, url: page, status: 'complete' }],
		granted: ['https://*/*']
	});
	const timeline: string[] = [];
	const tab = harness.tabs[0];

	const commit = () => {
		tab.status = 'complete';
		// `tabs.get().url` reports the committed document, so the old URL stays
		// visible until the new page replaces it.
		tab.url = target;
		// A new document means a new injected world: the ref registry from the old
		// page is gone, and the snapshot now describes the new page.
		harness.snapshot.value = {
			...harness.snapshot.value,
			url: tab.url ?? page,
			title: 'Search results',
			text: 'Results for kafe',
			elements: [{ ref: 0, tag: 'input', name: 'Search', selector: 'input#q' }]
		};
		options.onCommit?.();
		timeline.push(`commit:${tab.url}`);
		for (const listener of harness.updateListeners) listener(11, { status: 'complete' });
	};

	// The old document answers "complete" until the navigation replaces it.
	harness.chromeMock.tabs = {
		...(harness.chromeMock.tabs as AnyRecord),
		update: async (id: number, props: AnyRecord) => {
			const current = harness.tabs.find((candidate) => candidate.id === id);
			// The navigation is pending: the new document has not replaced the old one
			// yet, so the tab still reports the previous document as loaded.
			if (current) current.status = 'loading';
			timeline.push(`update:${props.url}`);
			setTimeout(commit, commitDelayMs);
			return { ...current };
		}
	} as AnyRecord;

	const internals = harness.chromeMock.scripting as AnyRecord;
	const originalExecute = internals.executeScript as (injection: AnyRecord) => Promise<unknown>;
	internals.executeScript = async (injection: AnyRecord) => {
		const func = injection.func as { name?: string } | undefined;
		timeline.push(`inject:${func?.name ?? 'anonymous'}`);
		return originalExecute(injection);
	};

	return { harness, timeline };
}

function loadLateRenderingTab() {
	const render = () => {
		harness.snapshot.value = {
			...harness.snapshot.value,
			title: 'Rendered results',
			text: 'Late-rendered results for kafe',
			elements: [{ ref: 0, tag: 'button', name: 'First result', selector: '#first-result' }]
		};
		timeline.push('render');
	};
	const { harness, timeline } = loadNavigatingTab({
		commitDelayMs: 0,
		onCommit: () => {
			harness.snapshot.value = {
				...harness.snapshot.value,
				title: 'Google Maps',
				text: '',
				elements: []
			};
			setTimeout(render, 250);
		}
	});

	return { harness, timeline };
}

describe('navigation commit ordering', () => {
	it('waits for the navigation to commit before snapshotting the tab', async () => {
		const { harness, timeline } = loadNavigatingTab();
		harness.digests.push({ url: page, length: 90, hash: 111 });
		harness.digests.push({ url: target, length: 140, hash: 222 });

		const reply = await harness.send('browser_tab_interact', {
			tabId: 11,
			action: 'navigate',
			url: target
		});

		expect(reply.ok).toBe(true);
		const result = reply.result as AnyRecord;
		// The snapshot must describe the page we navigated to, not the one we left.
		expect(result.url).toBe(target);
		expect(result.title).toBe('Search results');
		// The injected snapshot has to run in the new document. Running it before the
		// commit is what produced a stale registry and the "No matching element" errors.
		expect(timeline.indexOf(`commit:${target}`)).toBeLessThan(
			timeline.indexOf('inject:pageSnapshot')
		);
		expect(result.changed).toBe(true);
	});

	it('does not report the page as unchanged when only the URL changed', async () => {
		const { harness } = loadNavigatingTab();
		harness.digests.push({ url: page, length: 90, hash: 111 });
		harness.digests.push({ url: target, length: 90, hash: 111 });

		const reply = await harness.send('browser_tab_interact', {
			tabId: 11,
			action: 'navigate',
			url: target
		});

		const result = reply.result as AnyRecord;
		expect(result.url).toBe(target);
		expect(result.changed).toBe(true);
	});

	it('reports a clear error instead of reading the page it failed to leave', async () => {
		// The pending navigation never commits, so the load timeout is what decides.
		vi.useFakeTimers();
		try {
			const { harness } = loadNavigatingTab({ commitDelayMs: 60_000 });
			const replyPromise = harness.send('browser_tab_interact', {
				tabId: 11,
				action: 'navigate',
				url: target
			});
			await vi.advanceTimersByTimeAsync(16_000);
			const reply = await replyPromise;

			// Reporting success with the previous page's content would tell the agent it
			// navigated when it did not.
			expect(reply.ok).toBe(false);
			expect(String(reply.error)).toContain('did not finish navigating in time');
		} finally {
			vi.useRealTimers();
		}
	});

	it('waits for content rendered after an instantly completed navigation', async () => {
		const { harness, timeline } = loadLateRenderingTab();
		harness.digests.push({ url: page, length: 90, hash: 111 });
		harness.digests.push({ url: target, length: 140, hash: 222 });

		const reply = await harness.send('browser_tab_interact', {
			tabId: 11,
			action: 'navigate',
			url: target
		});

		expect(reply.ok).toBe(true);
		const result = reply.result as AnyRecord;
		expect(result.text).toBe('Late-rendered results for kafe');
		expect(result.elements).toHaveLength(1);
		expect(timeline.indexOf('render')).toBeLessThan(timeline.length);
	});

	it('reports an ineffective scroll as unchanged', async () => {
		const { harness } = loadNavigatingTab();
		harness.digests.push({ url: page, length: 90, hash: 111 });
		harness.digests.push({ url: page, length: 90, hash: 111 });

		const reply = await harness.send('browser_tab_interact', {
			tabId: 11,
			action: 'scroll',
			direction: 'down',
			amount: 1_500
		});

		expect(reply.ok).toBe(true);
		expect((reply.result as AnyRecord).changed).toBe(false);
	});

	it('honors an explicit waitMs minimum after navigation commits', async () => {
		const { harness } = loadLateRenderingTab();
		const startedAt = Date.now();

		const reply = await harness.send('browser_tab_interact', {
			tabId: 11,
			action: 'navigate',
			url: target,
			waitMs: 100
		});

		expect(reply.ok).toBe(true);
		expect(Date.now() - startedAt).toBeGreaterThanOrEqual(95);
	});
});
