import { createModels } from '@earendil-works/pi-ai';
import { anthropicProvider } from '@earendil-works/pi-ai/providers/anthropic';
import { googleProvider } from '@earendil-works/pi-ai/providers/google';
import { openaiProvider } from '@earendil-works/pi-ai/providers/openai';
import {
	getProviderCredential,
	isProviderId,
	providerKeyFromEnv,
	type ProviderId
} from './provider-settings.service';

let models: ReturnType<typeof createModels> | undefined;
function getModels() {
	if (models) return models;
	models = createModels();
	models.setProvider(openaiProvider());
	models.setProvider(anthropicProvider());
	models.setProvider(googleProvider());
	return models;
}

/** True when the provider has a server-side environment key configured. */
export function isProviderConfigured(provider: string) {
	return isProviderId(provider) && Boolean(providerKeyFromEnv(provider));
}

export interface AppModel {
	id: string;
	provider: string;
	name: string;
	description?: string;
	contextWindow?: number;
	capabilities: { vision: boolean; tools: boolean; reasoning: boolean };
	configured: boolean;
	/** Whether the current user saved their own key for this provider. */
	userConfigured: boolean;
}

export async function listModels(userId?: string): Promise<AppModel[]> {
	const registry = getModels();
	const all = registry.getModels();
	// Resolve each provider's effective configuration once per request.
	const configuredByProvider = new Map<string, boolean>();
	const userConfiguredByProvider = new Map<string, boolean>();
	const providers = new Set(all.map((model) => model.provider));
	for (const provider of providers) {
		configuredByProvider.set(provider, isProviderConfigured(provider));
		if (userId && isProviderId(provider)) {
			const credential = await getProviderCredential(userId, provider);
			userConfiguredByProvider.set(provider, credential.fromUser);
		} else {
			userConfiguredByProvider.set(provider, false);
		}
	}
	return all.map((model) => ({
		id: model.id,
		provider: model.provider,
		name: model.name,
		contextWindow: model.contextWindow,
		capabilities: {
			vision: model.input?.includes('image') ?? false,
			tools: true,
			reasoning: Boolean(model.reasoning)
		},
		configured: configuredByProvider.get(model.provider) ?? false,
		userConfigured: userConfiguredByProvider.get(model.provider) ?? false
	}));
}

export function resolveModel(provider: string, id: string) {
	return getModels().getModel(provider, id);
}
export function modelRegistry() {
	return getModels();
}
export type { ProviderId };
