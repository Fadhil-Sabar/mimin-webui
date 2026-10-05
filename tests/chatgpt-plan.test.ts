import { describe, expect, it, vi } from 'vitest';
import {
	fetchChatGptPlanModels,
	parseChatGptPlanModels
} from '../src/lib/server/ai/model-discovery';

describe('ChatGPT plan model discovery', () => {
	it('only exposes unique models currently allowed in the account catalog', () => {
		expect(
			parseChatGptPlanModels({
				models: [
					{ slug: 'gpt-a', display_name: 'GPT A', visibility: 'list' },
					{ slug: 'gpt-b', visibility: 'hidden' },
					{ slug: 'gpt-a', visibility: 'list' },
					{ slug: '', visibility: 'list' }
				]
			})
		).toEqual([{ id: 'gpt-a', name: 'GPT A' }]);
	});

	it('accepts standard OpenAI data/id rows and filters non-chat API models', () => {
		expect(
			parseChatGptPlanModels({
				data: [
					{ id: 'gpt-live', name: 'GPT Live' },
					{ id: 'gpt-live' },
					{ id: 'text-embedding-3-small' },
					{ id: 'whisper-1' },
					{ id: 'gpt-hidden', visibility: 'hidden' }
				]
			})
		).toEqual([{ id: 'gpt-live', name: 'GPT Live' }]);
	});

	it('requests the official live catalog using the OAuth bearer token', async () => {
		const fetcher = vi.fn(
			async () =>
				new Response(JSON.stringify({ data: [{ id: 'gpt-live', name: 'GPT Live' }] }), {
					status: 200
				})
		);
		await expect(fetchChatGptPlanModels('oauth-access-token', fetcher)).resolves.toEqual([
			{ id: 'gpt-live', name: 'GPT Live' }
		]);
		expect(fetcher).toHaveBeenCalledWith(
			'https://api.openai.com/v1/models',
			expect.objectContaining({
				method: 'GET',
				redirect: 'error',
				headers: { Authorization: 'Bearer oauth-access-token', Accept: 'application/json' }
			})
		);
	});

	it('rejects invalid catalog shapes and HTTP errors', async () => {
		expect(() => parseChatGptPlanModels({ data: [] })).toThrow(
			'Invalid ChatGPT model list response'
		);
		await expect(
			fetchChatGptPlanModels(
				'token',
				vi.fn(async () => new Response(null, { status: 403 }))
			)
		).rejects.toThrow('ChatGPT model list returned 403');
	});
});
