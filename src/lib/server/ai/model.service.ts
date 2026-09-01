import { createModels } from '@earendil-works/pi-ai';
import { anthropicProvider } from '@earendil-works/pi-ai/providers/anthropic';
import { googleProvider } from '@earendil-works/pi-ai/providers/google';
import { env } from '$env/dynamic/private';
import { openaiProvider } from '@earendil-works/pi-ai/providers/openai';

let models: ReturnType<typeof createModels> | undefined;
function getModels() {
	if (models) return models;
	models = createModels();
	models.setProvider(openaiProvider());
	models.setProvider(anthropicProvider());
	models.setProvider(googleProvider());
	return models;
}

function providerKey(provider: string) { return provider === 'anthropic' ? env.ANTHROPIC_API_KEY : provider === 'google' ? env.GOOGLE_API_KEY : provider === 'openai' ? env.OPENAI_API_KEY : undefined; }
export function isProviderConfigured(provider: string) { return Boolean(providerKey(provider)); }

export interface AppModel { id: string; provider: string; name: string; description?: string; contextWindow?: number; capabilities: { vision: boolean; tools: boolean; reasoning: boolean }; configured: boolean; }

export async function listModels(): Promise<AppModel[]> {
	const registry = getModels();
	const all = registry.getModels();
	const result: AppModel[] = [];
	for (const model of all) {
		const configured = isProviderConfigured(model.provider);
		result.push({ id: model.id, provider: model.provider, name: model.name, contextWindow: model.contextWindow, capabilities: { vision: model.input?.includes('image') ?? false, tools: true, reasoning: Boolean(model.reasoning) }, configured });
	}
	return result;
}

export function resolveModel(provider: string, id: string) { return getModels().getModel(provider, id); }
export function modelRegistry() { return getModels(); }
