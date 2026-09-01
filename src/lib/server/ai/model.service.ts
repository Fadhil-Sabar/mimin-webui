import { createModels, createProvider, type Api, type Model } from '@earendil-works/pi-ai';
import { anthropicProvider } from '@earendil-works/pi-ai/providers/anthropic';
import { googleProvider } from '@earendil-works/pi-ai/providers/google';
import { openaiProvider } from '@earendil-works/pi-ai/providers/openai';
import { openAIResponsesApi } from '@earendil-works/pi-ai/api/openai-responses.lazy';
import { openAICompletionsApi } from '@earendil-works/pi-ai/api/openai-completions.lazy';
import { anthropicMessagesApi } from '@earendil-works/pi-ai/api/anthropic-messages.lazy';
import { azureOpenAIResponsesApi } from '@earendil-works/pi-ai/api/azure-openai-responses.lazy';
import { googleGenerativeAIApi } from '@earendil-works/pi-ai/api/google-generative-ai.lazy';
import { mistralConversationsApi } from '@earendil-works/pi-ai/api/mistral-conversations.lazy';
import { piMessagesApi } from '@earendil-works/pi-ai/api/pi-messages.lazy';
import {
	getProviderCredential,
	isProviderId,
	listProviderCredentials,
	providerKeyFromEnv,
	type CustomProviderProtocol,
	type ProviderCredential,
	type ProviderId
} from './provider-settings.service';
import {
	fetchCustomProviderModels,
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

function createCustomOpenAiProvider() {
	const base = openaiProvider();
	return createProvider({
		id: 'openai',
		name: 'OpenAI',
		baseUrl: 'https://api.openai.com/v1',
		auth: base.auth,
		models: base.getModels(),
		api: {
			'openai-responses': openAIResponsesApi(),
			'openai-completions': openAICompletionsApi()
		} as any
	});
}

function getRegistry() {
	if (registry) return registry;
	registry = createModels();
	registry.setProvider(createCustomOpenAiProvider());
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
	provider: string;
	message: string;
};

export type ModelListResult = {
	models: AppModel[];
	errors: ModelDiscoveryError[];
};

function runtimeModelKey(provider: string, id: string) {
	return `${provider}\u0000${id}`;
}

function customApi(protocol: CustomProviderProtocol) {
	switch (protocol) {
		case 'openai-completions':
			return openAICompletionsApi();
		case 'openai-responses':
			return openAIResponsesApi();
		case 'anthropic-messages':
			return anthropicMessagesApi();
		case 'google-generative-ai':
			return googleGenerativeAIApi();
		case 'mistral-conversations':
			return mistralConversationsApi();
		case 'pi-messages':
			return piMessagesApi();
		case 'azure-openai-responses':
			return azureOpenAIResponsesApi();
	}
}

/** Register a user-owned custom provider from its persisted protocol/model definition. */
export function registerCustomProvider(credential: ProviderCredential) {
	const config = credential.customConfig;
	if (!config || !credential.baseUrl) return;
	const baseUrl = credential.baseUrl.replace(/\/+$/, '');
	const models: RuntimeModel[] = config.models.map((definition) => ({
		id: definition.id,
		name: definition.name?.trim() || modelDisplayName(definition.id),
		provider: credential.provider,
		api: config.protocol,
		baseUrl,
		reasoning: definition.reasoning ?? false,
		input: definition.vision ? ['text', 'image'] : ['text'],
		cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 },
		contextWindow: definition.contextWindow ?? 128_000,
		maxTokens: definition.maxTokens ?? 8_192
	}));
	getRegistry().setProvider(
		createProvider({
			id: credential.provider,
			name: config.name,
			baseUrl,
			auth: {
				apiKey: {
					name: `${config.name} API key`,
					resolve: async ({ credential, signal }) => {
						signal.throwIfAborted();
						return credential?.key
							? { auth: { apiKey: credential.key }, source: 'request credential' }
							: { auth: {}, source: 'keyless endpoint' };
					}
				}
			},
			models,
			api: customApi(config.protocol)
		})
	);
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
		provider,
		...(provider === 'openai' ? { api: 'openai-completions' as const } : {})
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
	const customCredentials = userId
		? (await listProviderCredentials(userId)).filter((credential) => credential.customConfig)
		: [];

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

	for (const credential of customCredentials) {
		registerCustomProvider(credential);
		const config = credential.customConfig;
		if (!config || !credential.baseUrl) continue;

		let providerModels: RuntimeModel[] = [...getRegistry().getModels(credential.provider)] as RuntimeModel[];
		let source: ModelSource = 'catalog';

		const cacheKey = credentialCacheKey(
			userId,
			credential.provider as any,
			credential.apiKey ?? '',
			credential.baseUrl
		);
		const cached = liveModelCache.get(cacheKey);
		if (cached && cached.expiresAt > Date.now()) {
			providerModels = cached.models;
			source = 'live';
		} else {
			try {
				const discovered = await fetchCustomProviderModels(
					config.protocol,
					credential.baseUrl,
					credential.apiKey
				);
				if (discovered.length > 0) {
					const baseUrl = credential.baseUrl.replace(/\/+$/, '');
					providerModels = discovered.map((d) => ({
						id: d.id,
						name: d.name?.trim() || modelDisplayName(d.id),
						provider: credential.provider,
						api: config.protocol,
						baseUrl,
						reasoning: d.reasoning ?? false,
						input: d.vision ? ['text', 'image'] : ['text'],
						cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 },
						contextWindow: d.contextWindow ?? 128_000,
						maxTokens: d.maxTokens ?? 8_192
					}));
					liveModelCache.set(cacheKey, {
						models: providerModels,
						expiresAt: Date.now() + LIVE_MODEL_CACHE_TTL
					});
					source = 'live';
				}
			} catch {
				// Fallback to catalog models already in registry
			}
		}

		for (const model of providerModels) {
			models.push({
				id: model.id,
				provider: credential.provider,
				name: model.name,
				contextWindow: model.contextWindow,
				capabilities: {
					vision: model.input?.includes('image') ?? false,
					tools: true,
					reasoning: Boolean(model.reasoning)
				},
				configured: Boolean(credential.baseUrl),
				userConfigured: credential.fromUser,
				source
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
	if (!parsed) return false;
	const result = await listModels(userId);
	return result.models.some(
		(model) =>
			model.provider === parsed.provider &&
			model.id === parsed.id &&
			(model.configured || model.userConfigured)
	);
}

export function resolveModel(provider: string, id: string, credential?: ProviderCredential) {
	if (credential?.customConfig) registerCustomProvider(credential);
	const existing = getRegistry().getModel(provider, id);
	if (existing) return existing;
	if (credential?.customConfig && credential.baseUrl) {
		const baseUrl = credential.baseUrl.replace(/\/+$/, '');
		return {
			id,
			name: modelDisplayName(id),
			provider,
			api: credential.customConfig.protocol,
			baseUrl,
			reasoning: false,
			input: ['text', 'image'],
			cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 },
			contextWindow: 128_000,
			maxTokens: 8_192
		} as RuntimeModel;
	}
	if (!isProviderId(provider) || !id.trim()) return undefined;
	return runtimeModel(provider, { id: id.trim() });
}
export function modelRegistry() {
	return getRegistry();
}
export type { ProviderId };
