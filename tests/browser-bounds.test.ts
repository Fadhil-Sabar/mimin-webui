import { afterEach, describe, expect, it, vi } from 'vitest';
import {
	cancelBrowserRequests,
	clearBrowserSession,
	getBrowserSession,
	pendingBrowserRequestCount,
	requestBrowserAction,
	setBrowserSession
} from '../src/lib/server/browser/bridge';

const context = { userId: 'user-1', conversationId: 'conversation-1', turnToken: 'turn-1' };
const pageResult = {
	url: 'https://chatgpt.com/share/example',
	readable: false,
	title: 'Shared chat'
};

afterEach(() => {
	vi.useRealTimers();
	cancelBrowserRequests(context.conversationId, context.turnToken);
	clearBrowserSession('user-1', 'conv-1');
	clearBrowserSession('user-1', 'conv-expired');
});

describe('bounded browser state', () => {
	it('evicts old browser sessions when the session bound is reached', () => {
		for (let index = 0; index < 520; index += 1)
			setBrowserSession('bounded-user', `conv-${index}`, index);
		expect(getBrowserSession('bounded-user', 'conv-0')).toBeUndefined();
		expect(getBrowserSession('bounded-user', 'conv-519')?.tabId).toBe(519);
	});

	it('rejects and removes the oldest pending request at the pending bound', async () => {
		const requests = Array.from({ length: 257 }, () =>
			requestBrowserAction(context, 'browser_open', { url: pageResult.url }, () => {})
		);
		await expect(requests[0]).rejects.toThrow('BROWSER_BRIDGE_CAPACITY');
		expect(pendingBrowserRequestCount()).toBe(256);
		cancelBrowserRequests(context.conversationId, context.turnToken);
		for (const request of requests.slice(1))
			await expect(request).rejects.toThrow('BROWSER_BRIDGE_CANCELED');
	});
});
