import { describe, expect, it, vi } from 'vitest';

vi.mock('$lib/server/db/client', async () => {
	const { createTurnStore, activeTurnsSchema } = await import('./helpers/turn-store');
	const store = createTurnStore();
	(globalThis as Record<string, unknown>).__turnStore = store;
	return { getDb: () => store.db, schema: activeTurnsSchema };
});

import {
	AGENT_SYSTEM_PROMPT,
	getToolFailurePolicy,
	beginConversationTurn,
	isConversationTurnCanceled,
	releaseConversationTurn,
	stopConversation
} from '../src/lib/server/ai/agent.service';
import {
	forgetLocalTurnState,
	refreshConversationTurnCanceled
} from '../src/lib/server/ai/turn-registry';

/** Ages the stored lease into the past, as if the owning instance had died. */
async function expireLease(conversationId: string) {
	const store = (globalThis as { __turnStore?: { rows: Map<string, { leaseUntil: Date }> } })
		.__turnStore;
	const row = store?.rows.get(conversationId);
	if (row) row.leaseUntil = new Date(Date.now() - 1_000);
}

describe('agent tool-use policy', () => {
	it('allows iterative tool use until the answer is sufficiently grounded', () => {
		expect(AGENT_SYSTEM_PROMPT).toMatch(/repeatedly|again/i);
		expect(AGENT_SYSTEM_PROMPT).toMatch(/sufficient|enough/i);
	});

	it('tells the model to stop after a dead end instead of retrying the same tool', () => {
		expect(AGENT_SYSTEM_PROMPT).toMatch(/empty, failed, or unavailable result is a dead end/i);
		expect(AGENT_SYSTEM_PROMPT).toMatch(/do not call the same tool again/i);
		expect(AGENT_SYSTEM_PROMPT).toMatch(/answer from the context you already have/i);
	});

	it('requires project knowledge lookup for project-specific questions', () => {
		expect(AGENT_SYSTEM_PROMPT).toMatch(
			/when project_knowledge_search is available, use it before answering questions about the active project/i
		);
	});

	it('terminates a failed web search with explicit model-facing guidance', () => {
		const policy = getToolFailurePolicy('web_search', true);
		expect(policy?.terminate).toBe(true);
		expect(policy?.content[0]).toMatchObject({
			type: 'text',
			text: expect.stringMatching(/failed|could not be reached/i)
		});
		expect(getToolFailurePolicy('web_search', false)).toBeUndefined();
		expect(getToolFailurePolicy('project_knowledge_search', true)).toBeUndefined();
	});

	it('reserves one turn per conversation and releases only its own token', async () => {
		expect(await beginConversationTurn('conversation-a', 'token-a')).toBe(true);
		expect(await beginConversationTurn('conversation-a', 'token-b')).toBe(false);
		await releaseConversationTurn('conversation-a', 'token-b');
		expect(await beginConversationTurn('conversation-a', 'token-b')).toBe(false);
		await releaseConversationTurn('conversation-a', 'token-a');
		expect(await beginConversationTurn('conversation-a', 'token-b')).toBe(true);
		await releaseConversationTurn('conversation-a', 'token-b');
		expect(await stopConversation('conversation-a')).toBe(false);
	});

	it('remembers an early stop and ignores cancellation from an older turn', async () => {
		expect(await beginConversationTurn('setup-conversation', 'setup-token')).toBe(true);
		expect(await stopConversation('setup-conversation', 'older-token')).toBe(false);
		expect(isConversationTurnCanceled('setup-token')).toBe(false);
		expect(await stopConversation('setup-conversation', 'setup-token')).toBe(true);
		expect(isConversationTurnCanceled('setup-token')).toBe(true);
		await releaseConversationTurn('setup-conversation', 'setup-token');
		expect(isConversationTurnCanceled('setup-token')).toBe(false);
		expect(await beginConversationTurn('setup-conversation', 'next-token')).toBe(true);
		expect(await stopConversation('setup-conversation', 'setup-token')).toBe(false);
		await releaseConversationTurn('setup-conversation', 'next-token');
	});

	it('reclaims a reservation whose lease expired on a dead instance', async () => {
		// Simulates another instance's crash: the row exists with an expired lease,
		// and this process has no local knowledge of it.
		expect(await beginConversationTurn('expired-conversation', 'dead-token')).toBe(true);
		forgetLocalTurnState();
		await expireLease('expired-conversation');
		expect(await beginConversationTurn('expired-conversation', 'fresh-token')).toBe(true);
		expect(await refreshConversationTurnCanceled('expired-conversation', 'dead-token')).toBe(true);
		await releaseConversationTurn('expired-conversation', 'fresh-token');
	});
});
