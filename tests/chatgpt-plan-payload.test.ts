import { afterEach, describe, expect, it, vi } from 'vitest';
import {
	chatGptPlanPayload,
	chatGptPlanErrorMessage
} from '../src/lib/server/ai/chatgpt-plan-payload';
import {
	clearModelCaches,
	loadChatGptPlanModels,
	modelRegistry
} from '../src/lib/server/ai/model.service';

type Payload = Record<string, unknown> & { input: Record<string, unknown>[] };

const credential = {
	provider: 'chatgpt',
	apiKey: 'fixture-token',
	baseUrl: null,
	customConfig: null,
	fromUser: true
};
afterEach(() => {
	vi.unstubAllGlobals();
	clearModelCaches();
});

describe('ChatGPT plan Responses contract', () => {
	it('directs subscription limit failures to usage settings without claiming a successful turn', () => {
		expect(chatGptPlanErrorMessage('subscription_sharing_usage_limit_exceeded: quota')).toContain(
			'Manage usage'
		);
		expect(chatGptPlanErrorMessage('subscription_sharing_usage_unavailable: disabled')).toContain(
			'reconnect'
		);
		expect(chatGptPlanErrorMessage('Stream interrupted')).toBe('Stream interrupted');
	});
	it('preserves policy as developer context, namespaces tools and history, and removes unsupported fields', () => {
		const source = {
			model: 'gpt-plan',
			input: [
				{ type: 'message', role: 'system', content: 'Project and safety instructions' },
				{ role: 'user', content: 'hello' },
				{ type: 'function_call', name: 'web_search', call_id: '1', arguments: '{}' },
				{ type: 'function_call_output', call_id: '1', output: 'result' }
			],
			tools: [{ type: 'function', name: 'web_search', parameters: {} }],
			store: true,
			stream: false,
			temperature: 1,
			max_output_tokens: 123,
			previous_response_id: 'old',
			prompt_cache_retention: '24h'
		};
		const result = chatGptPlanPayload(source) as Payload;
		expect(result.store).toBe(false);
		expect(result.stream).toBe(true);
		expect(result.input[0]).toEqual({
			type: 'message',
			role: 'developer',
			content: 'Project and safety instructions'
		});
		expect(result.input[2].namespace).toBe('mimin');
		expect(result.input[3]).toEqual(source.input[3]);
		expect(result.tools).toEqual([
			{
				type: 'namespace',
				name: 'mimin',
				description: 'Tools provided by Mimin WebUI.',
				tools: source.tools
			}
		]);
		for (const key of [
			'temperature',
			'max_output_tokens',
			'previous_response_id',
			'prompt_cache_retention'
		])
			expect(result).not.toHaveProperty(key);
		expect(source.input[0].role).toBe('system');
		expect(() => chatGptPlanPayload({ input: [], tools: [{ type: 'tool_search' }] })).toThrow(
			'Unsupported'
		);
	});
	it('loads account-specific runtime models without global credentials or invented usage cost', async () => {
		const fetcher = vi.fn(async (_url: unknown, options: RequestInit) =>
			Response.json({
				models: [
					{
						slug: new Headers(options.headers).get('authorization')?.endsWith('fixture-token')
							? 'account-a-model'
							: 'account-b-model',
						display_name: 'Plan model',
						visibility: 'list'
					}
				]
			})
		);
		vi.stubGlobal('fetch', fetcher);
		const a = await loadChatGptPlanModels(credential);
		const b = await loadChatGptPlanModels({ ...credential, apiKey: 'other-token' });
		expect(a.map((m) => m.id)).toEqual(['account-a-model']);
		expect(b.map((m) => m.id)).toEqual(['account-b-model']);
		expect(a[0].cost).toEqual({ input: 0, output: 0, cacheRead: 0, cacheWrite: 0 });
		expect(a[0].api).toBe('openai-responses');
		await loadChatGptPlanModels(credential);
		expect(fetcher).toHaveBeenCalledTimes(2);
	});
	it('resolves vision for dated and plan aliases, cached results, and manual model selections', async () => {
		const fetcher = vi.fn(async () =>
			Response.json({ models: [{ slug: 'gpt-4o-2024-11-20', visibility: 'list' }] })
		);
		vi.stubGlobal('fetch', fetcher);
		const discovered = await loadChatGptPlanModels(credential);
		expect(discovered[0].input).toEqual(['text', 'image']);
		const cached = await loadChatGptPlanModels(credential);
		expect(cached[0].input).toEqual(['text', 'image']);
		expect(fetcher).toHaveBeenCalledTimes(1);

		vi.stubGlobal('fetch', vi.fn(async () => Response.json({ models: [] })));
		const manual = await loadChatGptPlanModels({
			...credential,
			apiKey: 'manual-token',
			chatGptModelIds: ['gpt-5.4-mini', 'o3-mini', 'custom-plan-model']
		});
		expect(manual.map((model) => model.input)).toEqual([
			['text', 'image'],
			['text'],
			['text']
		]);
	});
	it('keeps manual model selections available when discovery fails and requires a connection', async () => {
		vi.stubGlobal(
			'fetch',
			vi.fn(async () => {
				throw new Error('catalog unavailable');
			})
		);
		const models = await loadChatGptPlanModels({
			...credential,
			chatGptModelIds: ['gpt-6.1-sol', 'custom-plan-model', 'gpt-6.1-sol']
		});
		expect(models.map((model) => model.id)).toEqual(['gpt-6.1-sol', 'custom-plan-model']);
		expect(models[1].api).toBe('openai-responses');
		expect(
			await loadChatGptPlanModels({ ...credential, apiKey: null, chatGptModelIds: ['selected'] })
		).toEqual([]);
	});
	it('applies manual additions and removals immediately without polluting the live cache', async () => {
		const fetcher = vi.fn(async () =>
			Response.json({ models: [{ slug: 'live-model', visibility: 'list' }] })
		);
		vi.stubGlobal('fetch', fetcher);
		const first = await loadChatGptPlanModels({
			...credential,
			chatGptModelIds: ['live-model', 'manual-one']
		});
		expect(first.map((model) => model.id)).toEqual(['live-model', 'manual-one']);
		const changed = await loadChatGptPlanModels({ ...credential, chatGptModelIds: ['manual-two'] });
		expect(changed.map((model) => model.id)).toEqual(['live-model', 'manual-two']);
		const removed = await loadChatGptPlanModels({ ...credential, chatGptModelIds: [] });
		expect(removed.map((model) => model.id)).toEqual(['live-model']);
		expect(fetcher).toHaveBeenCalledTimes(1);
	});
	it('retains discovery errors when all manual entries are removed', async () => {
		vi.stubGlobal(
			'fetch',
			vi.fn(async () => {
				throw new Error('catalog unavailable');
			})
		);
		await loadChatGptPlanModels({ ...credential, chatGptModelIds: ['manual-one'] });
		await expect(loadChatGptPlanModels({ ...credential, chatGptModelIds: [] })).rejects.toThrow(
			'catalog unavailable'
		);
	});
	it('streams a discovered model through the registered SDK adapter using the compliant payload', async () => {
		let wire: Payload = { input: [] };
		let endpoint = '';
		let authorization = '';
		vi.stubGlobal(
			'fetch',
			vi.fn(async (url: string | Request, options: RequestInit) => {
				endpoint = String(url);
				if (endpoint.endsWith('/models'))
					return Response.json({ models: [{ slug: 'plan-fixture', visibility: 'list' }] });
				wire = JSON.parse(String(options.body));
				authorization = new Headers(options.headers).get('authorization') ?? '';
				return Response.json({ error: { message: 'fixture stops inference' } }, { status: 400 });
			})
		);
		const [model] = await loadChatGptPlanModels(credential);
		const stream = modelRegistry().streamSimple(
			model,
			{
				systemPrompt: 'Keep the project instructions',
				messages: [{ role: 'user', content: 'Hi', timestamp: 0 }]
			},
			{ apiKey: 'fixture-token', maxTokens: 123, onPayload: chatGptPlanPayload }
		);
		await stream.result();
		expect(endpoint).toBe('https://api.openai.com/v1/responses');
		expect(authorization).toBe('Bearer fixture-token');
		expect(wire.model).toBe('plan-fixture');
		expect(wire.store).toBe(false);
		expect(wire.stream).toBe(true);
		expect(wire).not.toHaveProperty('max_output_tokens');
		expect(wire.input[0].role).toBe('developer');
	});
});
