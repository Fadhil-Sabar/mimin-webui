import { afterEach, describe, expect, it, vi } from 'vitest';
import { assertAllowedOutboundUrl } from '../src/lib/server/outbound';
import {
	fetchCustomProviderModels,
	fetchProviderModels
} from '../src/lib/server/ai/model-discovery';

vi.mock('$env/dynamic/private', () => ({ env: {} }));

afterEach(() => vi.unstubAllEnvs());

describe('outbound endpoint policy', () => {
	it.each([
		'http://127.0.0.1:8080/search',
		'http://[::1]/',
		'http://[::ffff:127.0.0.1]/',
		'http://169.254.169.254/latest/meta-data',
		'http://2130706433/',
		'https://user-controlled.example/search',
		'https://api.openai.com.attacker.example/',
		'https://api.openai.com:8443/v1',
		'https://user:secret@api.openai.com/v1',
		'file:///etc/passwd'
	])('refuses an unapproved or malformed endpoint: %s', (url) => {
		expect(() => assertAllowedOutboundUrl(url)).toThrow('OUTBOUND_URL_NOT_ALLOWED');
	});

	it('permits built-in endpoints and only explicitly configured custom origins', () => {
		vi.stubEnv('OUTBOUND_ALLOWED_ORIGINS', 'http://localhost:11434, https://gateway.example');
		vi.stubEnv('SEARXNG_URL', 'http://localhost:8080/search');
		for (const url of [
			'https://api.openai.com/v1/models',
			'http://localhost:11434/v1/models',
			'https://gateway.example/v1',
			'http://localhost:8080/search?q=test'
		]) {
			expect(() => assertAllowedOutboundUrl(url)).not.toThrow();
		}
		expect(() => assertAllowedOutboundUrl('http://localhost:11435/v1')).toThrow();
		vi.stubEnv('OUTBOUND_ALLOWED_ORIGINS', '');
		expect(() => assertAllowedOutboundUrl('https://gateway.example/v1')).toThrow();
	});

	it('blocks discovery before sending credentials and disables redirects on allowed requests', async () => {
		const fetcher = vi
			.fn<typeof fetch>()
			.mockResolvedValue(new Response(JSON.stringify({ data: [] })));
		await expect(
			fetchCustomProviderModels('openai-completions', 'http://[::1]/v1', 'secret', fetcher)
		).rejects.toThrow('OUTBOUND_URL_NOT_ALLOWED');
		expect(fetcher).not.toHaveBeenCalled();
		await fetchProviderModels('openai', 'secret', undefined, fetcher);
		expect(fetcher).toHaveBeenLastCalledWith(
			'https://api.openai.com/v1/models',
			expect.objectContaining({ redirect: 'error' })
		);
		fetcher.mockResolvedValue(new Response(JSON.stringify({ data: [] })));
		vi.stubEnv('OUTBOUND_ALLOWED_ORIGINS', 'http://localhost:11434');
		await fetchCustomProviderModels(
			'openai-completions',
			'http://localhost:11434/v1',
			null,
			fetcher
		);
		expect(fetcher).toHaveBeenLastCalledWith(
			'http://localhost:11434/v1/models',
			expect.objectContaining({ redirect: 'error' })
		);
	});
});
