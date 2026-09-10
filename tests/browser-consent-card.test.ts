import { describe, expect, it, vi } from 'vitest';
import { render } from 'svelte/server';
import BrowserConsentCard from '../src/lib/components/BrowserConsentCard.svelte';
import type { ConsentState as BrowserConsentState } from '../src/lib/client/consent-state';

function renderCard(options: {
	consent?: BrowserConsentState;
	active?: boolean;
	disabled?: boolean;
	summary?: string;
	input?: unknown;
}) {
	return render(BrowserConsentCard, {
		props: {
			toolCall: { consent: options.consent, input: options.input },
			active: options.active ?? false,
			disabled: options.disabled ?? false,
			summary: options.summary ?? '',
			onsubmit: vi.fn()
		}
	}).body;
}

describe('BrowserConsentCard', () => {
	it('offers exactly the three choices while waiting, and names the target', () => {
		const body = renderCard({
			active: true,
			consent: {
				requestId: 'call-a',
				action: 'browser_read_tab',
				tabId: 42,
				url: 'https://example.com/docs'
			}
		});

		expect(body).toContain('Browser access needed');
		expect(body).toContain('Waiting for your answer');
		expect(body).toContain('read a tab');
		expect(body).toContain('https://example.com/docs');
		expect(body).toContain('Deny');
		expect(body).toContain('Allow just once');
		expect(body).toContain('Allow for this conversation');
		expect(body).not.toContain('Expired');
	});

	it('falls back to the tab id when no title or URL is known', () => {
		const body = renderCard({
			active: true,
			consent: { requestId: 'call-a', action: 'browser_interact', tabId: 7 }
		});

		expect(body).toContain('click, type, or navigate in a tab');
		expect(body).toContain('tab 7');
	});

	it('describes listing tabs when no tab is targeted yet', () => {
		const body = renderCard({
			active: true,
			consent: { requestId: 'call-a', action: 'browser_tabs' }
		});

		expect(body).toContain('list your open tabs');
		expect(body).toContain('Your browser tabs');
	});

	it('shows the interaction detail from the tool input', () => {
		const body = renderCard({
			active: true,
			consent: { requestId: 'call-a', action: 'browser_interact', tabId: 7 },
			input: { action: 'type', ref: 3, text: 'hello world' }
		});

		expect(body).toContain('action: type');
		expect(body).toContain('ref 3');
		expect(body).toContain('hello world');
	});

	it('records an allowed-for-conversation outcome and hides the buttons', () => {
		const body = renderCard({
			consent: {
				requestId: 'call-a',
				action: 'browser_read_tab',
				decision: 'conversation'
			},
			summary: 'Tab read'
		});

		expect(body).toContain('Browser access allowed');
		expect(body).toContain('Allowed for this chat');
		expect(body).toContain('Mimin may read a tab in this chat without asking again.');
		expect(body).toContain('Tab read');
		expect(body).not.toContain('Allow just once');
	});

	it('records a single-use outcome', () => {
		const body = renderCard({
			consent: { requestId: 'call-a', action: 'browser_tabs', decision: 'once' }
		});

		expect(body).toContain('Allowed once');
		expect(body).toContain('one time');
		expect(body).not.toContain('Allow for this conversation');
	});

	it('records a denial without showing a result', () => {
		const body = renderCard({
			consent: { requestId: 'call-a', action: 'browser_tabs', decision: 'deny' },
			summary: 'Tabs listed'
		});

		expect(body).toContain('Browser access denied');
		expect(body).toContain('You declined this browser access request.');
		expect(body).not.toContain('Tabs listed');
	});

	it('treats a prompt with no decision as expired once the turn ended', () => {
		const body = renderCard({
			consent: { requestId: 'call-a', action: 'browser_tabs' }
		});

		expect(body).toContain('Expired');
		expect(body).toContain('ended before you answered');
		expect(body).not.toContain('Allow just once');
	});
});
