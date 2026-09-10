import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * The Settings page tells the user which search configuration is actually in
 * effect. A saved provider choice IS user configuration: before this test, a
 * conversation with SearXNG saved still rendered the "DuckDuckGo Fallback"
 * badge next to "Engine: searxng", so the header described no real setup.
 */
const state: { rows: Array<Record<string, unknown>> } = { rows: [] };
const { decryptSecret } = vi.hoisted(() => ({
	decryptSecret: vi.fn(async (value: string | null) => value)
}));

vi.mock('$lib/server/db/client', async () => ({
	schema: await import('../src/lib/server/db/schema'),
	getDb: () => ({
		select: () => ({
			from: () => ({ where: () => ({ limit: async () => state.rows }) })
		})
	})
}));

vi.mock('$lib/server/ai/provider-settings.service', () => ({
	decryptSecret,
	encryptSecret: vi.fn(async (value: string | null) => value),
	maskKey: vi.fn((value: string) => value)
}));

vi.mock('$lib/server/outbound', async () => {
	const actual = await vi.importActual<typeof import('../src/lib/server/outbound')>(
		'../src/lib/server/outbound'
	);
	return actual;
});

const { getWebSearchSettings } = await import('../src/lib/server/ai/web-search-settings.service');

beforeEach(() => {
	state.rows = [];
	delete process.env.WEB_SEARCH_API_KEY;
	delete process.env.SEARXNG_URL;
	delete process.env.WEB_SEARCH_URL;
});

afterEach(() => {
	vi.clearAllMocks();
});

describe('web search settings status', () => {
	it('treats a saved provider choice as user configuration', async () => {
		state.rows = [
			{
				apiKey: null,
				baseUrl: null,
				customConfig: { name: 'Web Search', protocol: 'web_search', provider: 'searxng' }
			}
		];

		const settings = await getWebSearchSettings('user-1');

		expect(settings.provider).toBe('searxng');
		expect(settings.fromUser).toBe(true);
	});

	it('reports the plain DuckDuckGo default when nothing was saved', async () => {
		const settings = await getWebSearchSettings('user-1');

		expect(settings.provider).toBe('duckduckgo');
		expect(settings.fromUser).toBe(false);
	});

	it('prefers a self-hosted SearXNG URL from the environment', async () => {
		process.env.SEARXNG_URL = 'https://searx.example.org';

		const settings = await getWebSearchSettings('user-1');

		expect(settings.provider).toBe('searxng');
		expect(settings.searchUrl).toBe('https://searx.example.org');
		expect(settings.envConfigured).toBe(true);
		expect(settings.fromUser).toBe(false);
	});
});
