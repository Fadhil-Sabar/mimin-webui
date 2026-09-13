export type Protocol =
	| 'openai-completions'
	| 'openai-responses'
	| 'anthropic-messages'
	| 'google-generative-ai'
	| 'mistral-conversations'
	| 'pi-messages'
	| 'azure-openai-responses';

export type CustomConfig = {
	name: string;
	protocol: Protocol;
	models: Array<{
		id: string;
		name?: string;
		contextWindow?: number;
		maxTokens?: number;
		reasoning?: boolean;
		vision?: boolean;
	}>;
};

export type ModelItem = {
	id: string;
	name?: string;
	contextWindow?: number;
	maxTokens?: number;
	reasoning?: boolean;
	vision?: boolean;
	isFree?: boolean;
	checked: boolean;
};

export type ProviderState = {
	provider: string;
	name: string;
	description: string;
	envVar: string | null;
	apiKey: string | null;
	baseUrl: string | null;
	fromUser: boolean;
	configured: boolean;
	customConfig: CustomConfig | null;
};

export const PROTOCOLS: Array<{ id: Protocol; name: string; description: string }> = [
	{ id: 'openai-completions', name: 'OpenAI compatible', description: 'Chat Completions API' },
	{ id: 'openai-responses', name: 'OpenAI Responses', description: 'Responses API' },
	{ id: 'anthropic-messages', name: 'Anthropic compatible', description: 'Messages API' },
	{ id: 'google-generative-ai', name: 'Google compatible', description: 'Generative AI API' },
	{ id: 'mistral-conversations', name: 'Mistral compatible', description: 'Conversations API' },
	{ id: 'pi-messages', name: 'Pi compatible', description: 'Pi Messages API' },
	{ id: 'azure-openai-responses', name: 'Azure OpenAI', description: 'Azure Responses API' }
];

export function isModelFree(model: { id: string; name?: string; isFree?: boolean }) {
	if (model.isFree === true) return true;
	const lowerId = model.id.toLowerCase();
	const lowerName = (model.name ?? '').toLowerCase();
	return (
		lowerId.includes(':free') ||
		lowerId.endsWith('/free') ||
		/\bfree\b/i.test(lowerId) ||
		/\bfree\b/i.test(lowerName)
	);
}
