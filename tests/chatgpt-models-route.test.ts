import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { RequestEvent } from '@sveltejs/kit';

const settings = vi.hoisted(() => ({ getChatGptModelIds: vi.fn(), saveChatGptModelIds: vi.fn() }));
vi.mock('$lib/server/ai/provider-settings.service', () => settings);
import { GET, PUT } from '../src/routes/api/providers/chatgpt/models/+server';

function event(method: string, body?: unknown, signedIn = true) {
	return {
		locals: { user: signedIn ? { id: 'user-1' } : null },
		request: new Request('http://localhost:3000/api/providers/chatgpt/models', {
			method,
			headers: { 'content-type': 'application/json' },
			...(body === undefined ? {} : { body: JSON.stringify(body) })
		})
	} as unknown as RequestEvent;
}
beforeEach(() => {
	vi.resetAllMocks();
	settings.getChatGptModelIds.mockResolvedValue(['gpt-6.1-sol', 'gpt-6-luna']);
	settings.saveChatGptModelIds.mockResolvedValue(undefined);
});

describe('ChatGPT manual models route', () => {
	it('returns user model IDs without credential data', async () => {
		const response = await GET(event('GET'));
		expect(await response.json()).toEqual({ modelIds: ['gpt-6.1-sol', 'gpt-6-luna'] });
		expect(response.headers.get('cache-control')).toBe('no-store');
		expect(settings.getChatGptModelIds).toHaveBeenCalledWith('user-1');
	});
	it('requires authentication for both methods', async () => {
		expect((await GET(event('GET', undefined, false))).status).toBe(401);
		expect((await PUT(event('PUT', { modelIds: [] }, false))).status).toBe(401);
		expect(settings.saveChatGptModelIds).not.toHaveBeenCalled();
	});
	it('normalizes and saves an empty array as an explicit disable', async () => {
		const response = await PUT(event('PUT', { modelIds: [' gpt-one ', 'gpt-one'] }));
		expect(settings.saveChatGptModelIds).toHaveBeenCalledWith('user-1', ['gpt-one']);
		expect(await response.json()).toEqual({ modelIds: ['gpt-one'] });
		await PUT(event('PUT', { modelIds: [] }));
		expect(settings.saveChatGptModelIds).toHaveBeenLastCalledWith('user-1', []);
	});
	it.each([
		null,
		[],
		{},
		{ modelIds: 'gpt-one' },
		{ modelIds: [1] },
		{ modelIds: [' '] },
		{ modelIds: ['gpt bad'] },
		{ modelIds: ['x'.repeat(201)] },
		{ modelIds: Array(101).fill('model') }
	])('rejects malformed or out-of-bounds input %j', async (body) => {
		expect((await PUT(event('PUT', body))).status).toBe(400);
		expect(settings.saveChatGptModelIds).not.toHaveBeenCalled();
	});
});
