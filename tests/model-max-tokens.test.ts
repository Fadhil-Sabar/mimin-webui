import { describe, expect, it } from 'vitest';
import { configuredModelMaxTokens } from '../src/lib/server/ai/model.service';
import type { ProviderCredential } from '../src/lib/server/ai/provider-settings.service';

function credential(models: Array<{ id: string; maxTokens?: number }>): ProviderCredential {
	return {
		provider: 'custom_test',
		apiKey: 'test-key',
		baseUrl: 'https://example.test/v1',
		customConfig: { name: 'Test', protocol: 'openai-completions', models },
		fromUser: true
	} as ProviderCredential;
}

describe('configuredModelMaxTokens', () => {
	it('returns the output cap declared for that model', () => {
		expect(configuredModelMaxTokens(credential([{ id: 'a', maxTokens: 65536 }]), 'a')).toBe(65536);
	});

	it('returns undefined when the entry declares no cap', () => {
		expect(configuredModelMaxTokens(credential([{ id: 'a' }]), 'a')).toBeUndefined();
	});

	it('ignores other models and missing credentials', () => {
		expect(
			configuredModelMaxTokens(credential([{ id: 'b', maxTokens: 4096 }]), 'a')
		).toBeUndefined();
		expect(configuredModelMaxTokens(undefined, 'a')).toBeUndefined();
	});

	it('rejects values that would break the request', () => {
		expect(configuredModelMaxTokens(credential([{ id: 'a', maxTokens: 0 }]), 'a')).toBeUndefined();
		expect(configuredModelMaxTokens(credential([{ id: 'a', maxTokens: -1 }]), 'a')).toBeUndefined();
		expect(
			configuredModelMaxTokens(credential([{ id: 'a', maxTokens: Number.NaN }]), 'a')
		).toBeUndefined();
	});

	it('floors fractional values', () => {
		expect(configuredModelMaxTokens(credential([{ id: 'a', maxTokens: 1024.7 }]), 'a')).toBe(1024);
	});
});
