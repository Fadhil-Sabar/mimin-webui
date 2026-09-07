import { describe, expect, it, vi, beforeEach } from 'vitest';

const testState = vi.hoisted(() => ({
	user: { id: 'user-1' } as { id: string } | null,
	conversation: {
		id: 'conv-1',
		userId: 'user-1'
	} as { id: string; userId: string } | null
}));

vi.mock('$lib/server/api', () => ({
	requireUser: vi.fn(async () => testState.user),
	getOwnedConversation: vi.fn(async (id: string, userId: string) => {
		if (
			testState.conversation &&
			testState.conversation.id === id &&
			testState.conversation.userId === userId
		) {
			return testState.conversation;
		}
		return null;
	}),
	apiError: (code: string, message: string, status = 400) =>
		new Response(JSON.stringify({ error: { code, message } }), {
			status,
			headers: { 'content-type': 'application/json' }
		}),
	handleApiError: (error: unknown) =>
		new Response(JSON.stringify({ error: { code: 'INTERNAL_ERROR', message: String(error) } }), {
			status: 500,
			headers: { 'content-type': 'application/json' }
		})
}));

const mockResolve = vi.fn();
vi.mock('$lib/server/ai/question-broker', () => ({
	resolveQuestionAnswer: (...args: unknown[]) => mockResolve(...args)
}));

import type { RequestEvent } from '@sveltejs/kit';
import { POST } from '../src/routes/api/conversations/[id]/question/+server';

describe('POST /api/conversations/[id]/question', () => {
	beforeEach(() => {
		testState.user = { id: 'user-1' };
		testState.conversation = { id: 'conv-1', userId: 'user-1' };
		mockResolve.mockReset();
	});

	it('returns 401 when unauthorized', async () => {
		testState.user = null;
		const event = {
			params: { id: 'conv-1' },
			request: new Request('http://localhost/api/conversations/conv-1/question', {
				method: 'POST',
				headers: { 'content-type': 'application/json' },
				body: JSON.stringify({ requestId: 'req-1' })
			})
		} as unknown as RequestEvent;

		const res = await POST(event);
		expect(res.status).toBe(401);
	});

	it('returns 404 when conversation not found', async () => {
		const event = {
			params: { id: 'conv-unknown' },
			request: new Request('http://localhost/api/conversations/conv-unknown/question', {
				method: 'POST',
				headers: { 'content-type': 'application/json' },
				body: JSON.stringify({ requestId: 'req-1' })
			})
		} as unknown as RequestEvent;

		const res = await POST(event);
		expect(res.status).toBe(404);
	});

	it('returns 400 on invalid payload (missing requestId)', async () => {
		const event = {
			params: { id: 'conv-1' },
			request: new Request('http://localhost/api/conversations/conv-1/question', {
				method: 'POST',
				headers: { 'content-type': 'application/json' },
				body: JSON.stringify({})
			})
		} as unknown as RequestEvent;

		const res = await POST(event);
		expect(res.status).toBe(400);
	});

	it('returns 404 when question request is not found or expired', async () => {
		mockResolve.mockReturnValue(false);

		const event = {
			params: { id: 'conv-1' },
			request: new Request('http://localhost/api/conversations/conv-1/question', {
				method: 'POST',
				headers: { 'content-type': 'application/json' },
				body: JSON.stringify({ requestId: 'expired-req' })
			})
		} as unknown as RequestEvent;

		const res = await POST(event);
		expect(res.status).toBe(404);
		const data = await res.json();
		expect(data.error.code).toBe('QUESTION_NOT_FOUND');
	});

	it('resolves answer and returns 200 on success', async () => {
		mockResolve.mockReturnValue(true);

		const event = {
			params: { id: 'conv-1' },
			request: new Request('http://localhost/api/conversations/conv-1/question', {
				method: 'POST',
				headers: { 'content-type': 'application/json' },
				body: JSON.stringify({
					requestId: 'valid-req',
					answers: [{ questionIndex: 0, selected: ['Option A'] }],
					skipped: false
				})
			})
		} as unknown as RequestEvent;

		const res = await POST(event);
		expect(res.status).toBe(200);
		const data = await res.json();
		expect(data.ok).toBe(true);
		expect(mockResolve).toHaveBeenCalledWith('valid-req', 'user-1', {
			answers: [{ questionIndex: 0, selected: ['Option A'] }],
			skipped: false
		});
	});
});
