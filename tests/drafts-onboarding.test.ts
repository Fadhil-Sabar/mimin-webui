import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
	clearConversationDraft,
	getConversationDraft,
	setConversationDraft
} from '../src/lib/client/drafts';
import {
	consumeNavigationHandoff,
	createNavigationHandoff,
	peekNavigationHandoff
} from '../src/lib/client/navigation-handoff';

function storage() {
	const values = new Map<string, string>();
	return {
		getItem: vi.fn((key: string) => values.get(key) ?? null),
		setItem: vi.fn((key: string, value: string) => values.set(key, value)),
		removeItem: vi.fn((key: string) => values.delete(key))
	};
}

describe('per-conversation drafts', () => {
	let store: ReturnType<typeof storage>;
	beforeEach(() => {
		store = storage();
		vi.stubGlobal('window', {});
		vi.stubGlobal('localStorage', store);
	});

	it('restores a draft only for the conversation that owns it', () => {
		setConversationDraft('conversation-a', 'unfinished A');
		setConversationDraft('conversation-b', 'unfinished B');

		expect(getConversationDraft('conversation-a')).toBe('unfinished A');
		expect(getConversationDraft('conversation-b')).toBe('unfinished B');
		expect(getConversationDraft('conversation-c')).toBe('');
	});

	it('removes a submitted conversation draft', () => {
		setConversationDraft('conversation-a', 'send me');
		clearConversationDraft('conversation-a');
		expect(getConversationDraft('conversation-a')).toBe('');
	});

	it('ignores malformed stored draft values', () => {
		store.setItem('mimin_conversation_drafts', JSON.stringify({ 'conversation-a': 42 }));
		expect(getConversationDraft('conversation-a')).toBe('');
	});
});

describe('one-time navigation handoff', () => {
	let store: ReturnType<typeof storage>;
	beforeEach(() => {
		store = storage();
		vi.stubGlobal('window', {});
		vi.stubGlobal('sessionStorage', store);
	});

	it('keeps a provider return target and draft in session storage', () => {
		createNavigationHandoff({ prompt: 'draft prompt', returnTo: '/' });
		expect(peekNavigationHandoff()).toEqual({ prompt: 'draft prompt', returnTo: '/' });
	});

	it('consumes the handoff once', () => {
		createNavigationHandoff({ prompt: 'draft prompt', returnTo: '/' });
		expect(consumeNavigationHandoff()).toEqual({ prompt: 'draft prompt', returnTo: '/' });
		expect(consumeNavigationHandoff()).toBeNull();
	});
});
