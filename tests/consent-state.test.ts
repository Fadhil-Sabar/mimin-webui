import { describe, expect, it } from 'vitest';
import {
	applyConsentDecision,
	attachConsent,
	consentFromEvent,
	isConsentPending,
	type ConsentState
} from '../src/lib/client/consent-state';

type Message = {
	id: string;
	toolCalls?: Array<{ toolCallId: string; toolName: string; consent?: ConsentState }>;
};

function conversation(): Message[] {
	return [
		{ id: 'user-1' },
		{
			id: 'assistant-1',
			toolCalls: [
				{ toolCallId: 'call-a', toolName: 'browser_tabs' },
				{ toolCallId: 'call-b', toolName: 'ask_question' }
			]
		}
	];
}

describe('browser consent SSE state', () => {
	it('parses a consent request event into consent state', () => {
		const consent = consentFromEvent({
			type: 'browser.consent.request',
			requestId: 'call-a',
			conversationId: 'conv-1',
			turnToken: 'turn-1',
			action: 'browser_read_tab',
			tabId: 42,
			url: 'https://example.com',
			title: 'Example',
			expiresInMs: 300_000
		});

		expect(consent).toEqual({
			requestId: 'call-a',
			action: 'browser_read_tab',
			tabId: 42,
			url: 'https://example.com',
			title: 'Example'
		});
		expect(isConsentPending(consent ?? undefined)).toBe(true);
	});

	it('tolerates missing optional fields and string tab ids', () => {
		expect(consentFromEvent({ requestId: 'call-1', tabId: 'tab-9' })).toEqual({
			requestId: 'call-1',
			action: undefined,
			tabId: 'tab-9',
			url: undefined,
			title: undefined
		});
	});

	it('ignores events without a request id', () => {
		expect(consentFromEvent({ action: 'browser_tabs_list' })).toBeNull();
		expect(consentFromEvent({ requestId: '' })).toBeNull();
		expect(consentFromEvent({ requestId: 7 })).toBeNull();
	});

	it('attaches consent to the matching tool call only', () => {
		const messages = conversation();
		const next = attachConsent(messages, 'call-a', {
			requestId: 'call-a',
			action: 'browser_tabs_list'
		});

		expect(next[1].toolCalls?.[0].consent).toEqual({
			requestId: 'call-a',
			action: 'browser_tabs_list'
		});
		expect(next[1].toolCalls?.[1].consent).toBeUndefined();
		expect(next[0]).toBe(messages[0]);
		// The original array is never mutated in place.
		expect(messages[1].toolCalls?.[0].consent).toBeUndefined();
	});

	it('returns the same array when no tool call matches', () => {
		const messages = conversation();
		expect(attachConsent(messages, 'missing', { requestId: 'missing' })).toBe(messages);
		expect(applyConsentDecision(messages, 'missing', 'once')).toBe(messages);
	});

	it('records a decision on an attached request', () => {
		const attached = attachConsent(conversation(), 'call-a', {
			requestId: 'call-a',
			action: 'browser_read_tab',
			tabId: 3
		});
		const decided = applyConsentDecision(attached, 'call-a', 'conversation');

		expect(decided[1].toolCalls?.[0].consent).toEqual({
			requestId: 'call-a',
			action: 'browser_read_tab',
			tabId: 3,
			decision: 'conversation'
		});
		expect(isConsentPending(decided[1].toolCalls?.[0].consent)).toBe(false);
	});

	it('does not invent consent for a tool call that never asked', () => {
		// A decision arriving without a matching prompt must not fabricate state.
		const messages = conversation();
		expect(applyConsentDecision(messages, 'call-b', 'once')).toBe(messages);
		expect(messages[1].toolCalls?.[1].consent).toBeUndefined();
	});
});
