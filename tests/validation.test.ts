import { describe, expect, it } from 'vitest';
import {
	conversationInput,
	messageInput,
	modelPreferenceInput,
	projectInput,
	providerSettingsInput
} from '../src/lib/server/validation';

describe('request validation', () => {
	it('accepts a project and applies a description default', () => {
		expect(projectInput.parse({ name: '  Mimin  ' })).toMatchObject({
			name: 'Mimin',
			description: ''
		});
		expect(
			projectInput.parse({ name: 'Mimin', instructions: '  Use the glossary.  ' })
		).toMatchObject({
			instructions: 'Use the glossary.'
		});
	});
	it('enforces project field limits and requires a non-empty name', () => {
		expect(projectInput.safeParse({ name: 'x'.repeat(120) }).success).toBe(true);
		expect(projectInput.safeParse({ name: 'x'.repeat(121) }).success).toBe(false);
		expect(
			projectInput.safeParse({ name: 'x'.repeat(1), description: 'x'.repeat(2001) }).success
		).toBe(false);
		expect(
			projectInput.safeParse({ name: 'x'.repeat(1), instructions: 'x'.repeat(10001) }).success
		).toBe(false);
		expect(projectInput.safeParse({ name: '   ' }).success).toBe(false);
	});
	it('normalizes project conversation defaults and bounds client-controlled tools', () => {
		const parsed = conversationInput.parse({ projectId: null });
		expect(parsed).toMatchObject({
			projectId: null,
			model: 'openai/gpt-4o-mini',
			enabledTools: ['web_search']
		});
		expect(
			conversationInput.safeParse({
				projectId: 'not-a-uuid',
				enabledTools: []
			}).success
		).toBe(false);
		expect(
			conversationInput.safeParse({
				projectId: '00000000-0000-4000-8000-000000000001',
				enabledTools: Array.from({ length: 20 }, (_, index) => `tool-${index}`)
			}).success
		).toBe(true);
		expect(
			conversationInput.safeParse({
				projectId: '00000000-0000-4000-8000-000000000001',
				enabledTools: Array.from({ length: 21 }, (_, index) => `tool-${index}`)
			}).success
		).toBe(false);
	});
	it('rejects empty messages', () => {
		expect(messageInput.safeParse({ content: '   ' }).success).toBe(false);
	});
	it('accepts supported model thinking levels and rejects unknown levels', () => {
		expect(
			modelPreferenceInput.safeParse({
				model: 'openai/gpt-5',
				thinkingLevel: 'high'
			}).success
		).toBe(true);
		expect(
			modelPreferenceInput.safeParse({
				model: 'openai/gpt-5',
				thinkingLevel: 'extreme'
			}).success
		).toBe(false);
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
	it('rejects unsafe custom provider URLs', () => {
		expect(
			providerSettingsInput.safeParse({
				baseUrl: 'not a URL',
				customConfig: { name: 'Example', protocol: 'openai-completions', models: [] }
			}).success
		).toBe(false);
	});
	it('accepts custom provider definitions with empty or omitted models for auto-discovery', () => {
		expect(
			providerSettingsInput.safeParse({
				baseUrl: 'https://models.example.com/v1',
				customConfig: { name: 'Example', protocol: 'openai-completions', models: [] }
			}).success
		).toBe(true);
		expect(
			providerSettingsInput.safeParse({
				baseUrl: 'https://models.example.com/v1',
				customConfig: { name: 'Example', protocol: 'openai-completions' }
			}).success
		).toBe(true);
	});
});
