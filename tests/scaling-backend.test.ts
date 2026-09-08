import { describe, expect, it, afterEach } from 'vitest';
import {
	decodeConversationCursor,
	encodeConversationCursor,
	decodeMessageCursor,
	encodeMessageCursor
} from '../src/lib/server/conversations';
import { selectContextWindow } from '../src/lib/server/ai/context-window';

describe('cursor pagination', () => {
	it('round trips opaque conversation and message cursors', () => {
		const date = new Date('2026-01-02T03:04:05.000Z');
		const conversation = encodeConversationCursor({ updatedAt: date, id: 'conv-2' });
		const message = encodeMessageCursor({ createdAt: date, id: 'msg-2' });
		expect(decodeConversationCursor(conversation)).toEqual({ updatedAt: date, id: 'conv-2' });
		expect(decodeMessageCursor(message)).toEqual({ createdAt: date, id: 'msg-2' });
	});

	it('rejects malformed cursors', () => {
		expect(decodeConversationCursor('not-a-cursor')).toBeNull();
		expect(decodeMessageCursor('')).toBeNull();
	});
});

describe('context window', () => {
	afterEach(() => {
		delete process.env.MIMIN_CONTEXT_WINDOW_MESSAGES;
	});

	it('keeps the latest complete turn and does not orphan a tool assistant message', () => {
		const rows = [
			{ id: 'u1', role: 'user', content: 'one', createdAt: new Date(1) },
			{ id: 'a1', role: 'assistant', content: 'two', createdAt: new Date(2) },
			{ id: 'u2', role: 'user', content: 'three', createdAt: new Date(3) },
			{ id: 'a2', role: 'assistant', content: '', createdAt: new Date(4) },
			{ id: 'u3', role: 'user', content: 'four', createdAt: new Date(5) }
		];
		expect(selectContextWindow(rows, 2, new Set(['a2'])).map((row) => row.id)).toEqual([
			'u2',
			'a2',
			'u3'
		]);
	});

	it('reads a bounded configurable default', () => {
		process.env.MIMIN_CONTEXT_WINDOW_MESSAGES = '2';
		const rows = Array.from({ length: 5 }, (_, index) => ({
			id: String(index),
			role: index % 2 ? 'assistant' : 'user',
			content: 'x',
			createdAt: new Date(index)
		}));
		expect(selectContextWindow(rows).map((row) => row.id)).toEqual(['2', '3', '4']);
	});
});
