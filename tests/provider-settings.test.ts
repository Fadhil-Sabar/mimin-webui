import { beforeAll, describe, expect, it } from 'vitest';
import {
	decryptSecret,
	encryptSecret,
	isProbablyValidKey,
	maskKey,
	providerKeyFromEnv
} from '../src/lib/server/ai/provider-settings.service';

beforeAll(() => {
	process.env.PROVIDER_KEY_ENCRYPTION_SECRET = 'test-secret-for-unit-tests-only';
});

describe('provider settings encryption', () => {
	it('round-trips a key through encryptSecret and decryptSecret', async () => {
		const encrypted = await encryptSecret('sk-test-1234567890');
		expect(encrypted.startsWith('v1:')).toBe(true);
		expect(encrypted).not.toContain('sk-test');
		expect(await decryptSecret(encrypted)).toBe('sk-test-1234567890');
	});

	it('produces unique ciphertext per call with the same key', async () => {
		const a = await encryptSecret('sk-same-key');
		const b = await encryptSecret('sk-same-key');
		expect(a).not.toBe(b);
		expect(await decryptSecret(a)).toBe(await decryptSecret(b));
	});

	it('returns null for malformed or tampered payloads', async () => {
		expect(await decryptSecret(null)).toBeNull();
		expect(await decryptSecret(undefined)).toBeNull();
		expect(await decryptSecret('not-a-payload')).toBeNull();
		const encrypted = await encryptSecret('sk-real-key');
		const tampered = encrypted.slice(0, -4) + 'ffff';
		expect(await decryptSecret(tampered)).toBeNull();
	});

	it('cannot decrypt with a different secret', async () => {
		const encrypted = await encryptSecret('sk-cross-secret');
		process.env.PROVIDER_KEY_ENCRYPTION_SECRET = 'another-secret';
		expect(await decryptSecret(encrypted)).toBeNull();
	});
});

describe('provider settings helpers', () => {
	it('masks keys to the last four characters', () => {
		expect(maskKey('sk-abcdef1234')).toBe('•••• 1234');
		expect(maskKey(null)).toBeNull();
		expect(maskKey('')).toBeNull();
	});

	it('validates key length', () => {
		expect(isProbablyValidKey('sk-long-enough-1234')).toBe(true);
		expect(isProbablyValidKey('short')).toBe(false);
	});

	it('reads provider keys from the environment', () => {
		process.env.OPENAI_API_KEY = 'sk-env-openai';
		process.env.GOOGLE_API_KEY = '';
		expect(providerKeyFromEnv('openai')).toBe('sk-env-openai');
		expect(providerKeyFromEnv('google')).toBeUndefined();
		expect(providerKeyFromEnv('anthropic')).toBeUndefined();
	});
});
