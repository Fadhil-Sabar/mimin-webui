import { describe, expect, it, vi } from 'vitest';
import {
	fetchProviderModels,
	modelListUrl,
	parseProviderModelList
} from '../src/lib/server/ai/model-discovery';

describe('model discovery', () => {
	it('builds provider-specific model endpoints', () => {
		expect(modelListUrl('openai')).toBe('https://api.openai.com/v1/models');
		expect(modelListUrl('anthropic')).toBe('https://api.anthropic.com/v1/models');
		expect(modelListUrl('google')).toBe('https://generativelanguage.googleapis.com/v1beta/models');
		expect(modelListUrl('anthropic', 'https://proxy.example/v1/')).toBe(
			'https://proxy.example/v1/models'
		);
	});

	it('normalizes provider responses and excludes non-chat models', () => {
		expect(
			parseProviderModelList('openai', {
				data: [
					{ id: 'gpt-4o' },
					{ id: 'text-embedding-3-small' },
					{ id: 'gpt-4o-mini-tts' },
					{ id: 'custom/llama-3.3' }
				]
			})
		).toEqual([
			{ id: 'gpt-4o', name: undefined },
			{ id: 'custom/llama-3.3', name: undefined }
		]);

		expect(
			parseProviderModelList('anthropic', {
				data: [{ id: 'claude-sonnet-4-6', display_name: 'Claude Sonnet 4.6' }]
			})
		).toEqual([{ id: 'claude-sonnet-4-6', name: 'Claude Sonnet 4.6' }]);

		expect(
			parseProviderModelList('google', {
				models: [
					{
						name: 'models/gemini-2.5-flash',
						displayName: 'Gemini 2.5 Flash',
						supportedGenerationMethods: ['generateContent']
					},
					{
						name: 'models/text-embedding-005',
						supportedGenerationMethods: ['embedContent']
					}
				]
			})
		).toEqual([{ id: 'gemini-2.5-flash', name: 'Gemini 2.5 Flash' }]);
	});

	it('sends the provider credential to the live endpoint', async () => {
		const fetcher = vi.fn(
			async () => new Response(JSON.stringify({ data: [{ id: 'gpt-4o' }] }), { status: 200 })
		);

		const models = await fetchProviderModels('openai', 'sk-live-test', undefined, fetcher);

		expect(models).toEqual([{ id: 'gpt-4o', name: undefined }]);
		expect(fetcher).toHaveBeenCalledWith(
			'https://api.openai.com/v1/models',
			expect.objectContaining({
				method: 'GET',
				headers: { Accept: 'application/json', Authorization: 'Bearer sk-live-test' },
				signal: expect.any(AbortSignal)
			})
		);
	});

	it('follows paginated Google model results', async () => {
		const fetcher = vi
			.fn()
			.mockResolvedValueOnce(
				new Response(
					JSON.stringify({
						models: [
							{ name: 'models/gemini-2.5-flash', supportedGenerationMethods: ['generateContent'] }
						],
						nextPageToken: 'next-page'
					}),
					{ status: 200 }
				)
			)
			.mockResolvedValueOnce(
				new Response(
					JSON.stringify({
						models: [
							{ name: 'models/gemini-2.5-pro', supportedGenerationMethods: ['generateContent'] }
						]
					}),
					{ status: 200 }
				)
			);

		const models = await fetchProviderModels('google', 'AIza-live-test', undefined, fetcher);

		expect(models.map((model) => model.id)).toEqual(['gemini-2.5-flash', 'gemini-2.5-pro']);
		expect(fetcher).toHaveBeenNthCalledWith(
			2,
			'https://generativelanguage.googleapis.com/v1beta/models?pageSize=1000&pageToken=next-page',
			expect.any(Object)
		);
	});
});
