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
