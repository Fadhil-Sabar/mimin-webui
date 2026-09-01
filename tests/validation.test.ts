import { describe, expect, it } from 'vitest';
import { messageInput, projectInput, providerSettingsInput } from '../src/lib/server/validation';

describe('request validation', () => {
	it('accepts a project and applies a description default', () => {
		expect(projectInput.parse({ name: 'Mimin' })).toMatchObject({ name: 'Mimin', description: '' });
	});
	it('rejects empty messages', () => {
		expect(messageInput.safeParse({ content: '   ' }).success).toBe(false);
	});
	it('accepts every supported custom provider protocol', () => {
		for (const protocol of [
			'openai-completions',
			'openai-responses',
			'anthropic-messages',
			'google-generative-ai',
			'mistral-conversations',
			'pi-messages',
			'azure-openai-responses'
		]) {
			expect(
				providerSettingsInput.safeParse({
					baseUrl: 'https://models.example.com/v1',
					customConfig: { name: 'Example', protocol, models: [{ id: 'model-1' }] }
				}).success
			).toBe(true);
		}
	});
	it('rejects unsafe custom provider URLs and empty model lists', () => {
		expect(
			providerSettingsInput.safeParse({
				baseUrl: 'not a URL',
				customConfig: { name: 'Example', protocol: 'openai-completions', models: [] }
			}).success
		).toBe(false);
	});
});
