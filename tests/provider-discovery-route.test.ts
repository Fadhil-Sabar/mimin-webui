import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { RequestEvent } from '@sveltejs/kit';

const credential = vi.hoisted(() => ({ apiKey: 'saved-secret', baseUrl: null as string | null }));
vi.mock('$env/dynamic/private', () => ({ env: {} }));
vi.mock('$lib/server/ai/provider-settings.service', () => ({
	getProviderCredential: vi.fn(async () => credential),
	isProviderId: (provider: string) => ['openai', 'anthropic', 'google'].includes(provider)
}));
import { POST } from '../src/routes/api/providers/discover/+server';

function request(baseUrl: string, apiKey?: string) {
	return POST({
		locals: { user: { id: 'user-1' } },
		request: new Request('http://localhost/api/providers/discover', {
			method: 'POST',
			headers: { 'content-type': 'application/json' },
			body: JSON.stringify({ provider: 'openai', protocol: 'openai-completions', baseUrl, apiKey })
		})
	} as unknown as RequestEvent);
}

beforeEach(() => {
	credential.baseUrl = null;
});
afterEach(() => {
	vi.restoreAllMocks();
	vi.unstubAllEnvs();
});

describe('provider discovery credentials', () => {
	it('reuses a saved key for the canonical built-in endpoint', async () => {
		const fetcher = vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response('{"data":[]}'));
		expect((await request('https://api.openai.com/v1')).status).toBe(200);
		expect(fetcher).toHaveBeenCalledWith(
			expect.any(String),
			expect.objectContaining({
				headers: expect.objectContaining({ Authorization: 'Bearer saved-secret' })
			})
		);
	});

	it('does not forward a saved key to another approved origin', async () => {
		vi.stubEnv('OUTBOUND_ALLOWED_ORIGINS', 'https://gateway.example');
		const fetcher = vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response('{"data":[]}'));
		expect((await request('https://gateway.example/v1')).status).toBe(200);
		const headers = new Headers(fetcher.mock.calls[0][1]?.headers);
		expect(headers.has('authorization')).toBe(false);
	});

	it('returns a useful client error without fetching an unapproved destination', async () => {
		const fetcher = vi.spyOn(globalThis, 'fetch');
		const result = await request('http://127.0.0.1/v1');
		expect(result.status).toBe(400);
		expect((await result.json()).error.message).toContain('OUTBOUND_ALLOWED_ORIGINS');
		expect(fetcher).not.toHaveBeenCalled();
	});
});
