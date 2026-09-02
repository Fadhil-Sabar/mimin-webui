import { describe, expect, it } from 'vitest';
import {
	customModelInput,
	mergeCustomModelMetadata,
	registerCustomProvider,
	resolveModel
} from '../src/lib/server/ai/model.service';
import { getSupportedThinkingLevels } from '@earendil-works/pi-ai';
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

	it('registers provider with auth configuration avoiding undefined apiKey errors', () => {
		const credential: ProviderCredential = {
			provider: 'custom_234e5678-e89b-12d3-a456-426614174000',
			apiKey: 'sk-test-key-2',
			baseUrl: 'https://api.example.com/v1',
			fromUser: true,
			customConfig: {
				name: 'Test Auth Provider',
				protocol: 'openai-completions',
				models: [{ id: 'test-model', contextWindow: 128_000 }]
			}
		};
		registerCustomProvider(credential);
		const model = resolveModel(credential.provider, 'test-model');
		expect(model).toBeDefined();
		expect(model?.input).toEqual(['text', 'image']);
	});

	it('treats an explicit false vision flag as text-only', () => {
		expect(customModelInput('openai-completions', false)).toEqual(['text']);
	});

	it('defaults an unknown vision flag to image input for image transports', () => {
		expect(customModelInput('openai-completions', undefined)).toEqual(['text', 'image']);
		expect(customModelInput('anthropic-messages', true)).toEqual(['text', 'image']);
	});

	it('inherits thinking levels when a custom endpoint serves a known reasoning model', () => {
		const credential: ProviderCredential = {
			provider: 'custom_345e6789-e89b-12d3-a456-426614174000',
			apiKey: 'sk-test-key-3',
			baseUrl: 'https://models.example.com/v1',
			fromUser: true,
			customConfig: {
				name: 'Reasoning proxy',
				protocol: 'openai-responses',
				models: [{ id: 'gpt-5.6-sol' }]
			}
		};
		registerCustomProvider(credential);
		const model = resolveModel(credential.provider, 'gpt-5.6-sol');

		expect(model?.reasoning).toBe(true);
		expect(model && getSupportedThinkingLevels(model)).toEqual([
			'off',
			'low',
			'medium',
			'high',
			'xhigh',
			'max'
		]);
	});

	it('keeps an explicit custom reasoning opt-out', () => {
		const credential: ProviderCredential = {
			provider: 'custom_456e7890-e89b-12d3-a456-426614174000',
			apiKey: 'sk-test-key-4',
			baseUrl: 'https://models.example.com/v1',
			fromUser: true,
			customConfig: {
				name: 'Text-only proxy',
				protocol: 'openai-responses',
				models: [{ id: 'gpt-5.6-sol', reasoning: false }]
			}
		};
		registerCustomProvider(credential);
		const model = resolveModel(credential.provider, 'gpt-5.6-sol');

		expect(model?.reasoning).toBe(false);
		expect(model && getSupportedThinkingLevels(model)).toEqual(['off']);
	});

	it('inherits thinking levels for provider-qualified non-core models', () => {
		const credential: ProviderCredential = {
			provider: 'custom_567e8901-e89b-12d3-a456-426614174000',
			apiKey: 'sk-test-key-5',
			baseUrl: 'https://models.example.com/v1',
			fromUser: true,
			customConfig: {
				name: 'Model gateway',
				protocol: 'openai-completions',
				models: [{ id: 'deepseek/deepseek-v4-pro' }]
			}
		};
		registerCustomProvider(credential);
		const model = resolveModel(credential.provider, 'deepseek/deepseek-v4-pro');

		expect(model?.reasoning).toBe(true);
		expect(model && getSupportedThinkingLevels(model)).toEqual(['off', 'high', 'xhigh']);
	});

	it('preserves configured metadata when live discovery omits it', () => {
		expect(
			mergeCustomModelMetadata(
				{
					id: 'model-1',
					name: 'Discovered name',
					contextWindow: 64_000,
					reasoning: false,
					vision: undefined
				},
				{
					id: 'model-1',
					name: 'Configured name',
					contextWindow: 128_000,
					reasoning: true,
					vision: true
				}
			)
		).toEqual({
			id: 'model-1',
			name: 'Configured name',
			contextWindow: 128_000,
			reasoning: true,
			vision: true
		});
	});
});
