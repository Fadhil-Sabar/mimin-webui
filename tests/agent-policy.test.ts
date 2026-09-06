import { describe, expect, it } from 'vitest';
import {
	AGENT_SYSTEM_PROMPT,
	beginConversationTurn,
	isConversationTurnCanceled,
	releaseConversationTurn,
	stopConversation
} from '../src/lib/server/ai/agent.service';

describe('agent tool-use policy', () => {
	it('allows iterative tool use until the answer is sufficiently grounded', () => {
		expect(AGENT_SYSTEM_PROMPT).toMatch(/repeatedly|again/i);
		expect(AGENT_SYSTEM_PROMPT).toMatch(/sufficient|enough/i);
	});

	it('requires project knowledge lookup for project-specific questions', () => {
		expect(AGENT_SYSTEM_PROMPT).toMatch(
			/when project_knowledge_search is available, use it before answering questions about the active project/i
		);
	});

	it('reserves one turn per conversation and releases only its own token', () => {
		expect(beginConversationTurn('conversation-a', 'token-a')).toBe(true);
		expect(beginConversationTurn('conversation-a', 'token-b')).toBe(false);
		releaseConversationTurn('conversation-a', 'token-b');
		expect(beginConversationTurn('conversation-a', 'token-b')).toBe(false);
		releaseConversationTurn('conversation-a', 'token-a');
		expect(beginConversationTurn('conversation-a', 'token-b')).toBe(true);
		releaseConversationTurn('conversation-a', 'token-b');
		expect(stopConversation('conversation-a')).toBe(false);
	});

	it('remembers an early stop and ignores cancellation from an older turn', () => {
		expect(beginConversationTurn('setup-conversation', 'setup-token')).toBe(true);
		expect(stopConversation('setup-conversation', 'older-token')).toBe(false);
		expect(isConversationTurnCanceled('setup-token')).toBe(false);
		expect(stopConversation('setup-conversation', 'setup-token')).toBe(true);
		expect(isConversationTurnCanceled('setup-token')).toBe(true);
		releaseConversationTurn('setup-conversation', 'setup-token');
		expect(isConversationTurnCanceled('setup-token')).toBe(false);
		expect(beginConversationTurn('setup-conversation', 'next-token')).toBe(true);
		expect(stopConversation('setup-conversation', 'setup-token')).toBe(false);
		releaseConversationTurn('setup-conversation', 'next-token');
	});
});
