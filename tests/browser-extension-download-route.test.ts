import { beforeEach, describe, expect, it, vi } from 'vitest';

const testState = vi.hoisted(() => ({
	user: { id: 'user-1' } as { id: string } | null,
	builds: [] as Array<{ target: string; origins: string[] }>
}));

vi.mock('$lib/server/api', () => ({
	requireUser: vi.fn(async () => testState.user),
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

vi.mock('$lib/server/browser/extension-package', async (importOriginal) => {
	const actual = await importOriginal<typeof import('$lib/server/browser/extension-package')>();
	return {
		...actual,
		buildExtensionArchive: vi.fn(
			async ({ target, origins }: { target: string; origins: string[] }) => {
				testState.builds.push({ target, origins });
				return Buffer.from('zip-bytes');
			}
		)
	};
});

import type { RequestEvent } from '@sveltejs/kit';
import { GET } from '../src/routes/api/browser/extension/[target]/+server';

const PAGE_ORIGIN = 'http://100.76.208.102:3200';

function requestEvent(target: string, query = `?origin=${encodeURIComponent(PAGE_ORIGIN)}`) {
	return {
		params: { target },
		url: new URL(`http://100.76.208.102:3200/api/browser/extension/${target}${query}`),
		locals: { user: testState.user }
	} as unknown as RequestEvent;
}

async function errorBody(response: Response) {
	return (await response.json()) as { error: { code: string; message: string } };
}

describe('GET /api/browser/extension/[target]', () => {
	beforeEach(() => {
		testState.user = { id: 'user-1' };
		testState.builds = [];
		delete process.env.MIMIN_EXTENSION_ORIGINS;
	});

	it('serves the package for the origin the browser is on', async () => {
		const response = await GET(requestEvent('chrome'));

		expect(response.status).toBe(200);
		expect(response.headers.get('content-type')).toBe('application/zip');
		expect(response.headers.get('content-disposition')).toBe(
			'attachment; filename="mimin-search-chrome.zip"'
		);
		expect(response.headers.get('cache-control')).toBe('no-store');
		expect(Buffer.from(await response.arrayBuffer()).toString()).toBe('zip-bytes');
		expect(testState.builds).toEqual([{ target: 'chrome', origins: [PAGE_ORIGIN] }]);
	});

	it('adds the origins configured in the environment', async () => {
		process.env.MIMIN_EXTENSION_ORIGINS = 'https://mimin.example.com';

		await GET(requestEvent('firefox'));

		expect(testState.builds).toEqual([
			{ target: 'firefox', origins: [PAGE_ORIGIN, 'https://mimin.example.com'] }
		]);
	});

	it('requires a signed-in user', async () => {
		testState.user = null;
		const response = await GET(requestEvent('chrome'));

		expect(response.status).toBe(401);
		expect((await errorBody(response)).error.code).toBe('UNAUTHORIZED');
		expect(testState.builds).toEqual([]);
	});

	it('rejects an unknown package', async () => {
		const response = await GET(requestEvent('safari'));

		expect(response.status).toBe(404);
		expect((await errorBody(response)).error.code).toBe('EXTENSION_TARGET_UNKNOWN');
	});

	it('requires an exact origin rather than trusting a partial one', async () => {
		for (const query of [
			'',
			'?origin=',
			`?origin=${encodeURIComponent(`${PAGE_ORIGIN}/settings`)}`,
			'?origin=not-an-origin',
			'?origin=ftp%3A%2F%2Fa.test'
		]) {
			const response = await GET(requestEvent('chrome', query));
			expect(response.status).toBe(400);
			expect((await errorBody(response)).error.code).toBe('INVALID_ORIGIN');
		}
		expect(testState.builds).toEqual([]);
	});
});
