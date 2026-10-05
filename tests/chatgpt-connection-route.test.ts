import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { RequestEvent } from '@sveltejs/kit';

const service = vi.hoisted(() => ({
	getChatGptPlanStatus: vi.fn(),
	startChatGptPlanConnection: vi.fn(),
	disconnectChatGptPlanConnection: vi.fn()
}));
vi.mock('$lib/server/ai/chatgpt-plan.service', () => service);
import { GET, POST, DELETE } from '../src/routes/api/providers/chatgpt/+server';
function event(method: string, origin?: string, signedIn = true) {
	return {
		locals: { user: signedIn ? { id: 'user-1' } : null },
		request: new Request('http://localhost:3000/api/providers/chatgpt', {
			method,
			headers: origin ? { origin } : {}
		})
	} as unknown as RequestEvent;
}
beforeEach(() => {
	vi.resetAllMocks();
	service.getChatGptPlanStatus.mockResolvedValue({ connected: false, pending: false });
	service.startChatGptPlanConnection.mockResolvedValue({
		authorizationUrl: 'https://auth.openai.com/authorize',
		callbackPort: 1234,
		completion: Promise.resolve()
	});
	service.disconnectChatGptPlanConnection.mockResolvedValue({ revocationConfirmed: false });
});
describe('ChatGPT connection routes', () => {
	it('requires a Mimin session for every operation', async () => {
		for (const [handler, method] of [
			[GET, 'GET'],
			[POST, 'POST'],
			[DELETE, 'DELETE']
		] as const)
			expect((await handler(event(method, 'http://localhost:3000', false))).status).toBe(401);
		expect(service.startChatGptPlanConnection).not.toHaveBeenCalled();
	});
	it.each(['https://attacker.example', 'null', undefined])(
		'rejects connect and disconnect with origin %s',
		async (origin) => {
			expect((await POST(event('POST', origin))).status).toBe(403);
			expect((await DELETE(event('DELETE', origin))).status).toBe(403);
			expect(service.startChatGptPlanConnection).not.toHaveBeenCalled();
			expect(service.disconnectChatGptPlanConnection).not.toHaveBeenCalled();
		}
	);
	it('starts a user-bound flow without returning tokens or completion internals', async () => {
		const response = await POST(event('POST', 'http://localhost:3000'));
		expect(response.status).toBe(200);
		expect(service.startChatGptPlanConnection).toHaveBeenCalledWith('user-1');
		expect(await response.json()).toEqual({
			authorizationUrl: 'https://auth.openai.com/authorize',
			callbackPort: 1234
		});
		expect(response.headers.get('cache-control')).toBe('no-store');
	});
	it('returns only user-scoped safe status and reports unconfirmed revocation', async () => {
		const status = await GET(event('GET'));
		expect(service.getChatGptPlanStatus).toHaveBeenCalledWith('user-1');
		expect(status.headers.get('cache-control')).toBe('no-store');
		const response = await DELETE(event('DELETE', 'http://localhost:3000'));
		expect(service.disconnectChatGptPlanConnection).toHaveBeenCalledWith('user-1');
		expect(await response.json()).toEqual({ ok: true, revocationConfirmed: false });
	});
	it('reports a busy callback listener without exposing another user', async () => {
		service.startChatGptPlanConnection.mockRejectedValue(
			Object.assign(new Error('An attempt is active.'), { code: 'CHATGPT_OAUTH_BUSY' })
		);
		expect((await POST(event('POST', 'http://localhost:3000'))).status).toBe(409);
	});
});
