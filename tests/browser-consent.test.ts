import { afterEach, describe, expect, it, vi } from 'vitest';
import {
	cancelBrowserConsents,
	clearAllBrowserConsentGrants,
	clearAllBrowserConsentRequests,
	grantConversationBrowserConsent,
	hasConversationBrowserConsent,
	pendingBrowserConsentCount,
	requestBrowserConsent,
	resolveBrowserConsent,
	revokeConversationBrowserConsent,
	type BrowserConsentEvent
} from '../src/lib/server/browser/consent';

const context = { userId: 'user-1', conversationId: 'conv-1', turnToken: 'turn-1' };

afterEach(() => {
	vi.useRealTimers();
	clearAllBrowserConsentRequests();
	clearAllBrowserConsentGrants();
});

describe('browser consent broker', () => {
	it('skips the prompt when the conversation already has a standing grant', async () => {
		grantConversationBrowserConsent('user-1', 'conv-1');
		expect(hasConversationBrowserConsent('user-1', 'conv-1')).toBe(true);

		let emitted = 0;
		const outcome = await requestBrowserConsent(
			context,
			'call-1',
			{ action: 'browser_tab_read', tabId: 7 },
			() => {
				emitted += 1;
			}
		);

		expect(outcome).toEqual({ granted: true, decision: 'conversation' });
		expect(emitted).toBe(0);
	});

	it('emits a request and grants a single use without storing a grant', async () => {
		let event: BrowserConsentEvent | undefined;
		const pending = requestBrowserConsent(
			context,
			'call-2',
			{ action: 'browser_tab_read', tabId: 7, url: 'https://example.com', title: 'Example' },
			(emitted) => {
				event = emitted;
			}
		);

		expect(pendingBrowserConsentCount()).toBe(1);
		expect(event?.type).toBe('browser.consent.request');
		expect(event?.requestId).toBe('call-2');
		expect(event?.conversationId).toBe('conv-1');
		expect(event?.action).toBe('browser_tab_read');
		expect(event?.tabId).toBe(7);
		expect(event?.url).toBe('https://example.com');
		expect(event?.expiresInMs).toBeGreaterThan(0);

		expect(resolveBrowserConsent('call-2', 'user-1', 'once')).toBe(true);
		await expect(pending).resolves.toEqual({ granted: true, decision: 'once' });
		expect(hasConversationBrowserConsent('user-1', 'conv-1')).toBe(false);
		expect(pendingBrowserConsentCount()).toBe(0);
	});

	it('stores a long-lived grant when the user allows the conversation', async () => {
		const pending = requestBrowserConsent(
			context,
			'call-3',
			{ action: 'browser_tabs_list' },
			() => {}
		);
		expect(resolveBrowserConsent('call-3', 'user-1', 'conversation')).toBe(true);
		await expect(pending).resolves.toEqual({ granted: true, decision: 'conversation' });
		expect(hasConversationBrowserConsent('user-1', 'conv-1')).toBe(true);
		// Other conversations are unaffected.
		expect(hasConversationBrowserConsent('user-1', 'conv-2')).toBe(false);
		expect(hasConversationBrowserConsent('user-2', 'conv-1')).toBe(false);
	});

	it('denies access when the user declines', async () => {
		const pending = requestBrowserConsent(
			context,
			'call-4',
			{ action: 'browser_tab_interact', tabId: 3 },
			() => {}
		);
		expect(resolveBrowserConsent('call-4', 'user-1', 'deny')).toBe(true);
		await expect(pending).resolves.toEqual({ granted: false, decision: 'deny' });
		expect(hasConversationBrowserConsent('user-1', 'conv-1')).toBe(false);
	});

	it('ignores answers from another user or unknown requests', async () => {
		const pending = requestBrowserConsent(
			context,
			'call-5',
			{ action: 'browser_tabs_list' },
			() => {}
		);

		expect(resolveBrowserConsent('call-5', 'user-2', 'once')).toBe(false);
		expect(resolveBrowserConsent('missing-request', 'user-1', 'once')).toBe(false);
		expect(pendingBrowserConsentCount()).toBe(1);

		expect(resolveBrowserConsent('call-5', 'user-1', 'deny')).toBe(true);
		await expect(pending).resolves.toEqual({ granted: false, decision: 'deny' });
	});

	it('reports a timeout as not granted', async () => {
		vi.useFakeTimers();
		const pending = requestBrowserConsent(
			context,
			'call-6',
			{ action: 'browser_tabs_list' },
			() => {},
			undefined,
			50
		);
		vi.advanceTimersByTime(60);
		await expect(pending).resolves.toEqual({ granted: false, reason: 'timeout' });
		expect(pendingBrowserConsentCount()).toBe(0);
	});

	it('rejects pending prompts when the turn is canceled', async () => {
		const pending = requestBrowserConsent(
			context,
			'call-7',
			{ action: 'browser_tabs_list' },
			() => {}
		);
		const assertion = expect(pending).rejects.toThrow('BROWSER_CONSENT_CANCELED');
		expect(cancelBrowserConsents('conv-1', 'turn-1')).toBe(1);
		await assertion;
		expect(pendingBrowserConsentCount()).toBe(0);
	});

	it('rejects immediately when the signal is already aborted', async () => {
		const controller = new AbortController();
		controller.abort();
		await expect(
			requestBrowserConsent(
				context,
				'call-8',
				{ action: 'browser_tabs_list' },
				() => {},
				controller.signal
			)
		).rejects.toThrow('BROWSER_CONSENT_CANCELED');
	});

	it('revokes a conversation grant', () => {
		grantConversationBrowserConsent('user-1', 'conv-1');
		expect(revokeConversationBrowserConsent('user-1', 'conv-1')).toBe(true);
		expect(hasConversationBrowserConsent('user-1', 'conv-1')).toBe(false);
		expect(revokeConversationBrowserConsent('user-1', 'conv-1')).toBe(false);
	});
});
