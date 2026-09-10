import { beforeEach, describe, expect, it, vi } from 'vitest';

const testState = vi.hoisted(() => ({
	user: { id: 'user-1' } as { id: string } | null,
	conversation: { id: 'conv-1', userId: 'user-1' } as { id: string; userId: string } | null
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
const mockRevoke = vi.fn();
vi.mock('$lib/server/browser/consent', () => ({
	resolveBrowserConsent: (...args: unknown[]) => mockResolve(...args),
	revokeConversationBrowserConsent: (...args: unknown[]) => mockRevoke(...args)
}));

import type { RequestEvent } from '@sveltejs/kit';
import { DELETE, POST } from '../src/routes/api/conversations/[id]/browser-consent/+server';

function requestEvent(body?: unknown, method = 'POST') {
	return {
		params: { id: 'conv-1' },
		request: new Request('http://localhost/api/conversations/conv-1/browser-consent', {
			method,
			headers: { 'content-type': 'application/json' },
			...(body === undefined ? {} : { body: JSON.stringify(body) })
		})
	} as unknown as RequestEvent;
}

describe('POST /api/conversations/[id]/browser-consent', () => {
	beforeEach(() => {
		testState.user = { id: 'user-1' };
		testState.conversation = { id: 'conv-1', userId: 'user-1' };
		mockResolve.mockReset();
		mockRevoke.mockReset();
	});

	it('returns 401 when unauthorized', async () => {
		testState.user = null;
		const res = await POST(requestEvent({ requestId: 'req-1', decision: 'once' }));
		expect(res.status).toBe(401);
	});

	it('returns 404 when the conversation is not owned', async () => {
		testState.conversation = null;
		const res = await POST(requestEvent({ requestId: 'req-1', decision: 'once' }));
		expect(res.status).toBe(404);
	});

	it.each([
		{ requestId: '', decision: 'once' },
		{ requestId: 'req-1', decision: 'always' },
		{ decision: 'once' }
	])('returns 400 for an invalid payload: %j', async (body) => {
		const res = await POST(requestEvent(body));
		expect(res.status).toBe(400);
		expect(mockResolve).not.toHaveBeenCalled();
	});

	it('returns 404 when the consent request already expired', async () => {
		mockResolve.mockReturnValue(false);
		const res = await POST(requestEvent({ requestId: 'expired', decision: 'conversation' }));
		expect(res.status).toBe(404);
		const data = await res.json();
		expect(data.error.code).toBe('BROWSER_CONSENT_NOT_FOUND');
	});

	it('resolves the decision for the authenticated user', async () => {
		mockResolve.mockReturnValue(true);
		const res = await POST(requestEvent({ requestId: 'req-9', decision: 'conversation' }));

		expect(res.status).toBe(200);
		expect(await res.json()).toEqual({ ok: true, decision: 'conversation' });
		expect(mockResolve).toHaveBeenCalledWith('req-9', 'user-1', 'conversation');
	});

	it('revokes a conversation grant', async () => {
		mockRevoke.mockReturnValue(true);
		const res = await DELETE(requestEvent(undefined, 'DELETE'));

		expect(res.status).toBe(200);
		expect(await res.json()).toEqual({ ok: true, revoked: true });
		expect(mockRevoke).toHaveBeenCalledWith('user-1', 'conv-1');
	});
});
