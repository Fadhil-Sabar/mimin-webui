import { createModels, type Api, type Model } from '@earendil-works/pi-ai';
import { anthropicProvider } from '@earendil-works/pi-ai/providers/anthropic';
import { googleProvider } from '@earendil-works/pi-ai/providers/google';
import { openaiProvider } from '@earendil-works/pi-ai/providers/openai';
import {
	getProviderCredential,
	isProviderId,
	providerKeyFromEnv,
	type ProviderId
} from './provider-settings.service';
import {
	fetchProviderModels,
	modelDisplayName,
	type DiscoverableProvider,
	type DiscoveredModel
} from './model-discovery';

const PROVIDERS: DiscoverableProvider[] = ['openai', 'anthropic', 'google'];
const LIVE_MODEL_CACHE_TTL = 60_000;
type RuntimeModel = Model<Api>;
export type ModelSource = 'live' | 'catalog';

let registry: ReturnType<typeof createModels> | undefined;
const runtimeModels = new Map<string, RuntimeModel>();
const liveModelCache = new Map<string, { models: RuntimeModel[]; expiresAt: number }>();

function getRegistry() {
	if (registry) return registry;
	registry = createModels();
	registry.setProvider(openaiProvider());
	registry.setProvider(anthropicProvider());
	registry.setProvider(googleProvider());
	return registry;
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
	source: ModelSource;
}

export type ModelDiscoveryError = {
	provider: DiscoverableProvider;
	message: string;
};

export type ModelListResult = {
	models: AppModel[];
	errors: ModelDiscoveryError[];
};

function runtimeModelKey(provider: string, id: string) {
	return `${provider}\u0000${id}`;
}

function templateModel(provider: DiscoverableProvider) {
	const preferredIds: Record<DiscoverableProvider, string> = {
		openai: 'gpt-4o-mini',
		anthropic: 'claude-sonnet-4-5',
		google: 'gemini-2.5-flash'
	};
	const providerModels = getRegistry().getModels(provider);
	return (getRegistry().getModel(provider, preferredIds[provider]) ?? providerModels[0]) as
		RuntimeModel | undefined;
}

/** Return a model object that the registered pi-ai provider can stream. */
function runtimeModel(
	provider: DiscoverableProvider,
	discovered: DiscoveredModel
): RuntimeModel | undefined {
	const existing = getRegistry().getModel(provider, discovered.id);
	if (existing) return existing;
	const cached = runtimeModels.get(runtimeModelKey(provider, discovered.id));
	if (cached) return cached;
	const template = templateModel(provider);
	if (!template) return undefined;
	const model = {
		...template,
		id: discovered.id,
		name: discovered.name?.trim() || modelDisplayName(discovered.id),
		provider
	} as RuntimeModel;
	runtimeModels.set(runtimeModelKey(provider, discovered.id), model);
	return model;
}

function credentialCacheKey(
	userId: string | undefined,
	provider: DiscoverableProvider,
	apiKey: string,
	baseUrl: string | null
) {
	// Keep the cache user-scoped without retaining a complete secret in the key.
	return `${userId ?? 'public'}:${provider}:${baseUrl ?? ''}:${apiKey.length}:${apiKey.slice(-8)}`;
}

async function loadProviderModels(
	userId: string | undefined,
	provider: DiscoverableProvider,
	credential: { apiKey: string | null; baseUrl: string | null }
): Promise<{ models: RuntimeModel[]; source: ModelSource; error?: string }> {
	const catalog = [...getRegistry().getModels(provider)] as RuntimeModel[];
	if (!credential.apiKey) return { models: catalog, source: 'catalog' };

	const cacheKey = credentialCacheKey(userId, provider, credential.apiKey, credential.baseUrl);
	const cached = liveModelCache.get(cacheKey);
	if (cached && cached.expiresAt > Date.now())
		return cached.models.length
			? { models: cached.models, source: 'live' }
			: {
					models: cached.models,
					source: 'live',
					error: `No chat models are available for ${provider}.`
				};

	try {
		const discovered = await fetchProviderModels(provider, credential.apiKey, credential.baseUrl);
		const models = discovered
			.map((model) => runtimeModel(provider, model))
			.filter((model): model is RuntimeModel => Boolean(model));
		liveModelCache.set(cacheKey, { models, expiresAt: Date.now() + LIVE_MODEL_CACHE_TTL });
		if (models.length === 0)
			return {
				models,
				source: 'live',
				error: `No chat models are available for ${provider}.`
			};
		return { models, source: 'live' };
	} catch {
		return {
			models: [],
			source: 'live',
			error: `Could not load live ${provider} models. Check the provider key or base URL.`
		};
	}
}

export async function listModels(userId?: string): Promise<ModelListResult> {
	const models: AppModel[] = [];
	const errors: ModelDiscoveryError[] = [];
	const loadedProviders = await Promise.all(
		PROVIDERS.map(async (provider) => {
			const credential = userId
				? await getProviderCredential(userId, provider)
				: {
						apiKey: providerKeyFromEnv(provider) ?? null,
						baseUrl: null,
						fromUser: false
					};
			const loaded = await loadProviderModels(userId, provider, credential);
			return { provider, credential, loaded };
		})
	);

	for (const { provider, credential, loaded } of loadedProviders) {
		if (loaded.error) errors.push({ provider, message: loaded.error });

		for (const model of loaded.models) {
			models.push({
				id: model.id,
				provider: model.provider,
				name: model.name,
				contextWindow: model.contextWindow,
				capabilities: {
					vision: model.input?.includes('image') ?? false,
					tools: true,
					reasoning: Boolean(model.reasoning)
				},
				configured: isProviderConfigured(provider),
				userConfigured: credential.fromUser,
				source: loaded.source
			});
		}
	}

	return { models, errors };
}

export function splitModelRef(value: string) {
	const separator = value.indexOf('/');
	if (separator <= 0 || separator === value.length - 1) return undefined;
	return { provider: value.slice(0, separator), id: value.slice(separator + 1) };
}

export async function isModelAvailable(userId: string, value: string) {
	const parsed = splitModelRef(value);
	if (!parsed || !isProviderId(parsed.provider)) return false;
	const result = await listModels(userId);
	return result.models.some(
		(model) =>
			model.provider === parsed.provider &&
			model.id === parsed.id &&
			(model.configured || model.userConfigured)
	);
}

export function resolveModel(provider: string, id: string) {
	const existing = getRegistry().getModel(provider, id);
	if (existing) return existing;
	if (!isProviderId(provider) || !id.trim()) return undefined;
	return runtimeModel(provider, { id: id.trim() });
}
export function modelRegistry() {
	return getRegistry();
}
export type { ProviderId };
