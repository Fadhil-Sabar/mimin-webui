import { beforeEach, describe, expect, it, vi } from 'vitest';

const state = vi.hoisted(() => ({
	user: { id: 'user-1' } as { id: string } | null,
	instructions: 'Be concise.'
}));

const service = vi.hoisted(() => ({
	get: vi.fn(async () => state.instructions || null),
	save: vi.fn(async (_userId: string, instructions: string) => {
		state.instructions = instructions.trim();
		return state.instructions || null;
	}),
	remove: vi.fn(async () => {
		state.instructions = '';
	})
}));

vi.mock('../src/lib/server/api', () => ({
	apiError: (code: string, message: string, status = 400) =>
		new Response(JSON.stringify({ error: { code, message } }), {
			status,
			headers: { 'content-type': 'application/json' }
		}),
	requireUser: vi.fn(async () => state.user),
	handleApiError: (error: unknown) => {
		throw error;
	}
}));

vi.mock('../src/lib/server/ai/user-instructions.service', () => ({
	getUserInstructions: service.get,
	saveUserInstructions: service.save,
	deleteUserInstructions: service.remove
}));

const route = await import('../src/routes/api/settings/instructions/+server');

function event(request?: Request) {
	return { locals: { user: state.user }, request } as never;
}

beforeEach(() => {
	state.user = { id: 'user-1' };
	state.instructions = 'Be concise.';
	vi.clearAllMocks();
});

describe('instructions settings API', () => {
	it('returns the signed-in user instructions', async () => {
		const response = await route.GET(event());
		expect(response.status).toBe(200);
		expect(await response.json()).toEqual({ instructions: 'Be concise.' });
		expect(service.get).toHaveBeenCalledWith('user-1');
	});

	it('saves normalized instructions', async () => {
		const request = new Request('http://localhost/api/settings/instructions', {
			method: 'PUT',
			headers: { 'content-type': 'application/json' },
			body: JSON.stringify({ instructions: '  Use plain language.  ' })
		});
		const response = await route.PUT(event(request));
		expect(response.status).toBe(200);
		expect(await response.json()).toEqual({ instructions: 'Use plain language.' });
		expect(service.save).toHaveBeenCalledWith('user-1', 'Use plain language.');
	});

	it('rejects oversized instructions and requires authentication', async () => {
		const request = new Request('http://localhost/api/settings/instructions', {
			method: 'PUT',
			headers: { 'content-type': 'application/json' },
			body: JSON.stringify({ instructions: 'x'.repeat(10001) })
		});
		const invalidResponse = await route.PUT(event(request));
		expect(invalidResponse.status).toBe(400);

		state.user = null;
		const unauthorizedResponse = await route.GET(event());
		expect(unauthorizedResponse.status).toBe(401);
	});

	it('returns a validation error for malformed JSON', async () => {
		const request = new Request('http://localhost/api/settings/instructions', {
			method: 'PUT',
			headers: { 'content-type': 'application/json' },
			body: '{not-json'
		});
		const response = await route.PUT(event(request));
		expect(response.status).toBe(400);
		expect((await response.json()).error.code).toBe('INVALID_INPUT');
	});

	it('clears saved instructions', async () => {
		const response = await route.DELETE(event());
		expect(response.status).toBe(200);
		expect(await response.json()).toEqual({ instructions: '' });
		expect(service.remove).toHaveBeenCalledWith('user-1');
	});
});
