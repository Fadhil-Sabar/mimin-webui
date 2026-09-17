import { describe, expect, it, vi } from 'vitest';
import { render } from 'svelte/server';
import ChatMessage from '../src/routes/(app)/chat/ChatMessage.svelte';
import type { ConversationMessage } from '../src/routes/(app)/chat/chat-types';

function assistant(overrides: Partial<ConversationMessage> = {}): ConversationMessage {
	return {
		id: 'assistant-1',
		role: 'assistant',
		content: 'A complete response',
		createdAt: '2026-01-01T00:00:00.000Z',
		...overrides
	};
}

function renderMessage(message: ConversationMessage, options: Record<string, unknown> = {}) {
	return render(ChatMessage, {
		props: {
			message,
			isLast: true,
			onregenerate: vi.fn(),
			...options
		}
	}).body;
}

describe('ChatMessage assistant actions', () => {
	it('shows accessible copy and regenerate actions for the latest completed response', () => {
		const body = renderMessage(assistant(), { canRegenerate: true });

		expect(body).toContain('aria-label="Copy response"');
		expect(body).toContain('Copy response');
		expect(body).toContain('aria-label="Regenerate response"');
		expect(body).toContain('Regenerate');
	});

	it('does not show response actions for an empty or streaming assistant message', () => {
		expect(renderMessage(assistant({ content: '' }), { canRegenerate: true })).not.toContain(
			'Copy response'
		);
		expect(renderMessage(assistant({ isStreaming: true }), { canRegenerate: true })).not.toContain(
			'Regenerate response'
		);
	});

	it('renders regenerate disabled while a response is running', () => {
		const body = renderMessage(assistant(), { canRegenerate: true, regenerateDisabled: true });

		expect(body).toContain('aria-label="Regenerate response"');
		expect(body).toContain('disabled=""');
	});
});

describe('ChatMessage interrupted turns', () => {
	it('labels a partly written reply that was interrupted', () => {
		const body = renderMessage(assistant({ turnState: 'interrupted' }), {
			canRetry: true,
			canRegenerate: false
		});

		expect(body).toContain('This reply was interrupted before it finished.');
		// The notice carries the retry when the footer has no regenerate action to offer.
		expect(body).toContain('interrupted-retry');
	});

	it('does not repeat the retry the footer already offers', () => {
		const body = renderMessage(assistant({ turnState: 'interrupted' }), {
			canRetry: true,
			canRegenerate: true
		});

		expect(body).toContain('interrupted-notice');
		expect(body).not.toContain('interrupted-retry');
		expect(body).toContain('aria-label="Regenerate response"');
	});

	it('says the turn was interrupted rather than blaming the output budget', () => {
		const body = renderMessage(assistant({ content: '', turnState: 'interrupted' }), {
			canRetry: true
		});

		expect(body).toContain('This turn was interrupted before writing an answer.');
		expect(body).not.toContain('stopped before writing an answer');
	});

	it('stays quiet for a turn that finished normally', () => {
		expect(renderMessage(assistant())).not.toContain('interrupted-notice');
	});
});

describe('ChatMessage context line', () => {
	it('states the tokens and duration of a finished turn in the compact form', () => {
		const body = renderMessage(
			assistant({
				usage: { input: 1500, output: 300, totalTokens: 1800 },
				completedAt: '2026-01-01T00:00:04.000Z'
			}),
			{ contextAttachments: ['notes.md'], projectName: 'Launch' }
		);

		expect(body).toContain('context-line');
		expect(body).toContain('1.8k tokens');
		expect(body).toContain('4s');
		expect(body).toContain('1 file');
		// The full breakdown rides along as the tooltip so the short form loses nothing.
		expect(body).toContain('Input 1,500');
		expect(body).toContain('notes.md');
		expect(body).toContain('Project: Launch');
	});

	it('sits in the same row as the message actions', () => {
		const body = renderMessage(
			assistant({ usage: { totalTokens: 900 }, completedAt: '2026-01-01T00:00:01.000Z' }),
			{ canRegenerate: true }
		);

		expect(body).toContain('aria-label="Message actions"');
		expect(body).toContain('900 tokens');
	});

	it('is hidden when the preference is off', () => {
		const body = renderMessage(
			assistant({ usage: { totalTokens: 900 }, completedAt: '2026-01-01T00:00:01.000Z' }),
			{ showContext: false }
		);

		expect(body).not.toContain('context-line');
		expect(body).not.toContain('900 tokens');
		// The actions stay exactly where they were.
		expect(body).toContain('aria-label="Copy response"');
	});

	it('stays quiet when the turn reported nothing worth summarising', () => {
		const body = renderMessage(assistant());

		expect(body).not.toContain('context-line');
		expect(body).not.toContain('tokens');
	});

	it('does not put a line on every reply just because it is in a project', () => {
		const body = renderMessage(assistant(), { projectName: 'Launch' });

		expect(body).not.toContain('context-line');
	});
});
