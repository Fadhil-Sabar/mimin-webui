import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { RequestEvent } from '@sveltejs/kit';

const service = vi.hoisted(() => {
	class ChatGptPlanCompletionError extends Error {
		readonly reason: string;
		readonly code: string;
		constructor(reason: string, code: string, message: string) {
			super(message);
			this.name = 'ChatGptPlanCompletionError';
			this.reason = reason;
			this.code = code;
		}
	}
	return { completeChatGptPlanConnection: vi.fn(), ChatGptPlanCompletionError };
});
vi.mock('$lib/server/ai/chatgpt-plan.service', () => ({
	completeChatGptPlanConnection: service.completeChatGptPlanConnection,
	ChatGptPlanCompletionError: service.ChatGptPlanCompletionError
}));
import { POST } from '../src/routes/api/providers/chatgpt/complete/+server';

function event(options: { origin?: string; signedIn?: boolean; body?: unknown } = {}) {
	const { origin, signedIn = true, body } = options;
	return {
		locals: { user: signedIn ? { id: 'user-1' } : null },
		request: new Request('http://localhost:3000/api/providers/chatgpt/complete', {
			method: 'POST',
			headers: {
				...(origin ? { origin } : {}),
				...(body === undefined ? {} : { 'content-type': 'application/json' })
			},
			...(body === undefined
				? {}
				: { body: typeof body === 'string' ? body : JSON.stringify(body) })
		})
	} as unknown as RequestEvent;
}
beforeEach(() => {
	vi.resetAllMocks();
	service.completeChatGptPlanConnection.mockResolvedValue({
		ok: true,
		email: 'person@example.test'
	});
});
describe('ChatGPT pasted callback route', () => {
	it('requires a Mimin session', async () => {
		expect((await POST(event({ signedIn: false, body: { callbackUrl: 'http://x' } }))).status).toBe(
			401
		);
		expect(service.completeChatGptPlanConnection).not.toHaveBeenCalled();
	});

	it.each(['https://attacker.example', 'null', undefined])('rejects origin %s', async (origin) => {
		expect((await POST(event({ origin, body: { callbackUrl: 'http://x' } }))).status).toBe(403);
		expect(service.completeChatGptPlanConnection).not.toHaveBeenCalled();
	});

	it('passes the pasted URL to the service and returns the account email', async () => {
		const response = await POST(
			event({ origin: 'http://localhost:3000', body: { callbackUrl: 'http://127.0.0.1:1/a' } })
		);
		expect(response.status).toBe(200);
		expect(response.headers.get('cache-control')).toBe('no-store');
		expect(service.completeChatGptPlanConnection).toHaveBeenCalledWith(
			'user-1',
			'http://127.0.0.1:1/a'
		);
		expect(await response.json()).toEqual({ ok: true, email: 'person@example.test' });
	});

	it.each([
		[{}, 400],
		[{ callbackUrl: '' }, 400],
		[{ callbackUrl: 42 }, 400],
		['not json', 400]
	])('rejects body %j with %i', async (body, status) => {
		const response = await POST(event({ origin: 'http://localhost:3000', body }));
		expect(response.status).toBe(status);
		expect(service.completeChatGptPlanConnection).not.toHaveBeenCalled();
	});

	it('maps service failures to their error codes', async () => {
		service.completeChatGptPlanConnection.mockRejectedValue(
			new service.ChatGptPlanCompletionError(
				'no-attempt',
				'NO_ACTIVE_ATTEMPT',
				'No sign-in is waiting.'
			)
		);
		const conflict = await POST(
			event({ origin: 'http://localhost:3000', body: { callbackUrl: 'http://127.0.0.1:1/a' } })
		);
		expect(conflict.status).toBe(409);
		expect(await conflict.json()).toEqual({
			error: { code: 'NO_ACTIVE_ATTEMPT', message: 'No sign-in is waiting.' }
		});

		service.completeChatGptPlanConnection.mockRejectedValue(
			new service.ChatGptPlanCompletionError('invalid', 'INVALID_CALLBACK_URL', 'Bad URL.')
		);
		const invalid = await POST(
			event({ origin: 'http://localhost:3000', body: { callbackUrl: 'http://127.0.0.1:1/a' } })
		);
		expect(invalid.status).toBe(400);
		expect(await invalid.json()).toEqual({
			error: { code: 'INVALID_CALLBACK_URL', message: 'Bad URL.' }
		});
	});
});
