import { describe, expect, it } from 'vitest';
import { registerCustomProvider, resolveModel } from '../src/lib/server/ai/model.service';
import {
	isValidProviderKey,
	type ProviderCredential
} from '../src/lib/server/ai/provider-settings.service';

describe('custom providers', () => {
	it('accepts generated custom provider IDs but not arbitrary route values', () => {
		expect(isValidProviderKey('custom_123e4567-e89b-12d3-a456-426614174000')).toBe(true);
		expect(isValidProviderKey('../openai')).toBe(false);
	});

	it('registers configured models with their selected Pi protocol', () => {
		const credential: ProviderCredential = {
			provider: 'custom_123e4567-e89b-12d3-a456-426614174000',
			apiKey: 'sk-test-key',
			baseUrl: 'https://models.example.com/v1/',
			fromUser: true,
			customConfig: {
				name: 'Example',
				protocol: 'anthropic-messages',
				models: [{ id: 'claude-compatible', vision: true, contextWindow: 200_000 }]
			}
		};
		registerCustomProvider(credential);
		const model = resolveModel(credential.provider, 'claude-compatible');
		expect(model).toMatchObject({
			provider: credential.provider,
			api: 'anthropic-messages',
			baseUrl: 'https://models.example.com/v1',
			contextWindow: 200_000,
			input: ['text', 'image']
		});
	});
});
