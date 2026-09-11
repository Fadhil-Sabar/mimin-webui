import { afterEach, describe, expect, it, vi } from 'vitest';
import {
	assertAllowedOutboundUrl,
	isPrivateAddress,
	isPrivateHostname
} from '../src/lib/server/outbound';
import {
	fetchCustomProviderModels,
	fetchProviderModels
} from '../src/lib/server/ai/model-discovery';

vi.mock('$env/dynamic/private', () => ({ env: {} }));

afterEach(() => vi.unstubAllEnvs());

describe('private address classification', () => {
	it.each([
		'127.0.0.1',
		'127.255.255.254',
		'10.0.0.1',
		'192.168.1.1',
		'172.16.0.1',
		'172.31.255.255',
		'169.254.169.254',
		'100.64.0.1',
		'100.127.255.255',
		'0.0.0.0',
		'::1',
		'::',
		'::ffff:127.0.0.1',
		'fd00::1',
		'fc00::1',
		'fe80::1'
	])('treats %s as private', (address) => {
		expect(isPrivateAddress(address)).toBe(true);
	});

	it.each([
		'93.184.216.34',
		'172.15.0.1',
		'172.32.0.1',
		'100.63.255.255',
		'100.128.0.1',
		'2606:2800:220:1:248:1893:25c8:1946'
	])('treats %s as public', (address) => {
		expect(isPrivateAddress(address)).toBe(false);
	});

	it.each(['localhost', 'api.localhost', 'wiki.local', 'db.internal'])(
		'treats %s as local',
		(name) => {
			expect(isPrivateHostname(name)).toBe(true);
		}
	);

	it('accepts a public hostname', () => {
		expect(isPrivateHostname('example.com')).toBe(false);
	});
});

describe('outbound endpoint policy', () => {
	it.each([
		'http://127.0.0.1:8080/search',
		'http://[::1]/',
		'http://[::ffff:127.0.0.1]/',
		'http://169.254.169.254/latest/meta-data',
		'https://169.254.169.254/latest/meta-data',
		'http://2130706433/',
		'https://user:secret@api.openai.com/v1',
		'file:///etc/passwd',
		'http://unapproved.example/search'
	])('refuses an unapproved or malformed endpoint: %s', (url) => {
		expect(() => assertAllowedOutboundUrl(url)).toThrow('OUTBOUND_URL_NOT_ALLOWED');
	});

	it('permits public HTTPS endpoints automatically', () => {
		for (const url of [
			'https://user-controlled.example/search',
			'https://api.openai.com.attacker.example/',
			'https://opencode.ai/zen/v1',
			'https://gateway.example/v1'
		]) {
			expect(() => assertAllowedOutboundUrl(url)).not.toThrow();
		}
	});

	it('permits built-in endpoints and explicitly configured custom HTTP origins', () => {
		vi.stubEnv('OUTBOUND_ALLOWED_ORIGINS', 'http://localhost:11434, http://custom-http.example');
		vi.stubEnv('SEARXNG_URL', 'http://localhost:8080/search');
		for (const url of [
			'https://api.openai.com/v1/models',
			'http://localhost:11434/v1/models',
			'http://custom-http.example/v1',
			'http://localhost:8080/search?q=test'
		]) {
			expect(() => assertAllowedOutboundUrl(url)).not.toThrow();
		}
		expect(() => assertAllowedOutboundUrl('http://localhost:11435/v1')).toThrow();
		vi.stubEnv('OUTBOUND_ALLOWED_ORIGINS', '');
		expect(() => assertAllowedOutboundUrl('http://custom-http.example/v1')).toThrow();
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
