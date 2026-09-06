import { afterEach, describe, expect, it, vi } from 'vitest';
import {
	BROWSER_BRIDGE_TIMEOUT_MS,
	browserPageResultSchema,
	browserResultSchema,
	cancelBrowserRequests,
	isBrowserBridgeAbortError,
	pendingBrowserRequestCount,
	requestBrowserAction,
	settleBrowserRequest
} from '../src/lib/server/browser/bridge';

const context = {
	userId: 'user-1',
	conversationId: 'conversation-1',
	turnToken: 'turn-1'
};

const pageResult = {
	url: 'https://chatgpt.com/share/example',
	readable: false,
	title: 'Shared chat',
	reason: 'Navigation only'
};

afterEach(() => {
	vi.useRealTimers();
	if (pendingBrowserRequestCount() > 0) cancelBrowserRequests(context.conversationId, context.turnToken);
});

describe('browser bridge broker', () => {
	it('emits a request with a per-request token and settles only the matching user request', async () => {
		const events: Array<Record<string, unknown>> = [];
		const pending = requestBrowserAction(
			context,
			'browser_open',
			{ url: pageResult.url },
			(event) => events.push(event)
		);
		const event = events[0] as {
			requestId: string;
			token: string;
			action: string;
			args: Record<string, unknown>;
		};

		expect(event).toMatchObject({
			type: 'browser.request',
			action: 'browser_open',
			args: { url: pageResult.url }
		});
		expect(event.requestId).toMatch(/^[0-9a-f-]{36}$/);
		expect(event.token).toMatch(/^[0-9a-f-]{36}$/);
		expect(pendingBrowserRequestCount()).toBe(1);

		expect(settleBrowserRequest('another-user', event.requestId, event.token, true, pageResult)).toBe(
			false
		);
		expect(settleBrowserRequest(context.userId, event.requestId, 'wrong-token', true, pageResult)).toBe(
			false
		);
		expect(pendingBrowserRequestCount()).toBe(1);

		expect(settleBrowserRequest(context.userId, event.requestId, event.token, true, pageResult)).toBe(
			true
		);
		await expect(pending).resolves.toEqual(pageResult);
		expect(pendingBrowserRequestCount()).toBe(0);
		expect(settleBrowserRequest(context.userId, event.requestId, event.token, true, pageResult)).toBe(
			false
		);
	});

	it('rejects when dispatch fails and removes the pending request', async () => {
		const pending = requestBrowserAction(context, 'browser_search', { query: 'papers' }, () => {
			throw new Error('extension unavailable');
		});

		await expect(pending).rejects.toThrow('extension unavailable');
		expect(pendingBrowserRequestCount()).toBe(0);
	});

	it('cancels only requests belonging to the canceled conversation turn', async () => {
		const first = requestBrowserAction(context, 'browser_open', { url: pageResult.url }, () => {});
		const otherEvents: Array<{ requestId: string; token: string }> = [];
		const other = requestBrowserAction(
			{ ...context, turnToken: 'turn-2' },
			'browser_search',
			{ query: 'papers' },
			(event) => otherEvents.push(event)
		);

		cancelBrowserRequests(context.conversationId, context.turnToken);
		await expect(first).rejects.toThrow('BROWSER_BRIDGE_CANCELED');
		expect(pendingBrowserRequestCount()).toBe(1);
		expect(otherEvents).toHaveLength(1);
		expect(isBrowserBridgeAbortError(new Error('BROWSER_BRIDGE_CANCELED'))).toBe(true);
		cancelBrowserRequests(context.conversationId, 'turn-2');
		await expect(other).rejects.toThrow('BROWSER_BRIDGE_CANCELED');
	});

	it('rejects canceled signals before emitting a browser request', async () => {
		const controller = new AbortController();
		controller.abort();
		const emit = vi.fn();

		await expect(
			requestBrowserAction(context, 'browser_open', { url: pageResult.url }, emit, controller.signal)
		).rejects.toThrow('BROWSER_BRIDGE_CANCELED');
		expect(emit).not.toHaveBeenCalled();
		expect(pendingBrowserRequestCount()).toBe(0);
	});

	it('times out an unanswered request and identifies timeout as an abort-style bridge error', async () => {
		vi.useFakeTimers();
		const pending = requestBrowserAction(context, 'browser_open', { url: pageResult.url }, () => {});

		vi.advanceTimersByTime(BROWSER_BRIDGE_TIMEOUT_MS);
		await expect(pending).rejects.toThrow('BROWSER_BRIDGE_TIMEOUT');
		expect(isBrowserBridgeAbortError(new Error('BROWSER_BRIDGE_TIMEOUT'))).toBe(true);
		expect(pendingBrowserRequestCount()).toBe(0);
	});
});

describe('browser bridge result schema', () => {
	it('requires a readable flag and accepts only public HTTP(S) page data', () => {
		expect(browserPageResultSchema.safeParse(pageResult).success).toBe(true);
		expect(browserPageResultSchema.safeParse({ ...pageResult, captcha: false }).success).toBe(true);
		expect(
			browserPageResultSchema.safeParse({ ...pageResult, url: 'file:///etc/passwd' }).success
		).toBe(false);
		expect(
			browserPageResultSchema.safeParse({ ...pageResult, extra: 'ignored data' }).success
		).toBe(false);
	});

	it('requires result data for success and an error for failure', () => {
		const base = {
			requestId: '6a9d510f-bbc4-83ec-bd10-2c0767c67d92',
			token: '6a9d510f-bbc4-83ec-bd10-2c0767c67d92'
		};
		expect(browserResultSchema.safeParse({ ...base, ok: true, result: pageResult }).success).toBe(true);
		expect(browserResultSchema.safeParse({ ...base, ok: true }).success).toBe(false);
		expect(browserResultSchema.safeParse({ ...base, ok: false, error: 'tab blocked' }).success).toBe(true);
		expect(browserResultSchema.safeParse({ ...base, ok: false }).success).toBe(false);
	});
});
