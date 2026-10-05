import {
	createModels,
	createProvider,
	getSupportedThinkingLevels,
	type Api,
	type Model,
	type ModelThinkingLevel
} from '@earendil-works/pi-ai';
import { anthropicProvider } from '@earendil-works/pi-ai/providers/anthropic';
import { googleProvider } from '@earendil-works/pi-ai/providers/google';
import { openaiProvider } from '@earendil-works/pi-ai/providers/openai';
import { builtinModels } from '@earendil-works/pi-ai/providers/all';
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
	type CustomProviderConfig,
	type CustomProviderProtocol,
	type ProviderCredential,
	type ProviderId
} from './provider-settings.service';
import {
	fetchChatGptPlanModels,
	fetchCustomProviderModels,
	fetchProviderModels,
	modelDisplayName,
	type DiscoverableProvider,
	type DiscoveredModel
} from './model-discovery';
import { BoundedTtlLruCache, hashSecret } from '../cache';

const PROVIDERS: DiscoverableProvider[] = ['openai', 'anthropic', 'google'];
const CHATGPT_PROVIDER = 'chatgpt';
const LIVE_MODEL_CACHE_TTL = 60_000;
const FAILED_MODEL_CACHE_TTL = 10_000;
const LIVE_MODEL_CACHE_MAX_ENTRIES = 128;
const RUNTIME_MODEL_CACHE_MAX_ENTRIES = 512;
type RuntimeModel = Model<Api>;
export type ModelSource = 'live' | 'catalog';

let registry: ReturnType<typeof createModels> | undefined;
let catalogModels: RuntimeModel[] | undefined;
const runtimeModels = new BoundedTtlLruCache<string, RuntimeModel>({
	maxEntries: RUNTIME_MODEL_CACHE_MAX_ENTRIES,
	ttlMs: LIVE_MODEL_CACHE_TTL
});
type LiveModelCacheEntry = { models: RuntimeModel[]; error?: string };
const liveModelCache = new BoundedTtlLruCache<string, LiveModelCacheEntry>({
	maxEntries: LIVE_MODEL_CACHE_MAX_ENTRIES,
	ttlMs: LIVE_MODEL_CACHE_TTL
});

/** Test-only reset hook; production callers should let bounded TTL eviction work. */
export function clearModelCaches(): void {
	runtimeModels.clear();
	liveModelCache.clear();
}

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
			// eslint-disable-next-line @typescript-eslint/no-explicit-any
		} as any
	});
}

function getRegistry() {
	if (registry) return registry;
	registry = createModels();
	registry.setProvider(
		createProvider({
			id: CHATGPT_PROVIDER,
			name: 'ChatGPT plan',
			baseUrl: 'https://api.openai.com/v1',
			auth: {
				apiKey: {
					name: 'ChatGPT access token',
					resolve: async ({ credential, signal }) => {
						signal.throwIfAborted();
						return credential?.key
							? { auth: { apiKey: credential.key }, source: 'user ChatGPT plan token' }
							: { auth: {}, source: 'unconnected ChatGPT plan' };
					}
				}
			},
			models: [],
			api: { 'openai-responses': openAIResponsesApi() }
		})
	);
	registry.setProvider(createCustomOpenAiProvider());
	registry.setProvider(anthropicProvider());
	registry.setProvider(googleProvider());
	return registry;
}

/** True when the provider has a server-side environment key configured. */
export function isProviderConfigured(provider: string) {
	return isProviderId(provider) && Boolean(providerKeyFromEnv(provider));
}

const PROVIDER_NAMES: Record<string, string> = {
	openai: 'OpenAI',
	anthropic: 'Anthropic',
	google: 'Google',
	chatgpt: 'ChatGPT plan'
};

export interface AppModel {
	id: string;
	provider: string;
	providerName: string;
	name: string;
	description?: string;
	contextWindow?: number;
	capabilities: {
		vision: boolean;
		tools: boolean;
		reasoning: boolean;
		thinkingLevels: ModelThinkingLevel[];
	};
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

// Every custom protocol currently supported by pi-ai can carry image content.
// A missing `vision` flag therefore means "unknown", not "text-only". An
// explicit false remains the opt-out for providers/models that cannot accept it.
const IMAGE_TRANSPORT_PROTOCOLS: ReadonlySet<CustomProviderProtocol> = new Set([
	'openai-completions',
	'openai-responses',
	'anthropic-messages',
	'google-generative-ai',
	'mistral-conversations',
	'pi-messages',
	'azure-openai-responses'
]);

export function customModelInput(
	protocol: CustomProviderProtocol,
	vision: boolean | undefined
): ('text' | 'image')[] {
	return vision === false || !IMAGE_TRANSPORT_PROTOCOLS.has(protocol)
		? ['text']
		: ['text', 'image'];
}

type CustomModelDefinition = CustomProviderConfig['models'][number];

/** Merge live metadata without discarding an explicitly configured value. */
export function mergeCustomModelMetadata(
	discovered: DiscoveredModel,
	configured?: CustomModelDefinition
) {
	return {
		id: discovered.id,
		name: configured?.name ?? discovered.name,
		contextWindow: configured?.contextWindow ?? discovered.contextWindow,
		maxTokens: configured?.maxTokens ?? discovered.maxTokens,
		reasoning: configured?.reasoning ?? discovered.reasoning,
		vision: configured?.vision ?? discovered.vision
	};
}

/**
 * Output cap declared on a custom provider's model entry, when the user set one.
 * The agent loop never forwards `model.maxTokens`, so a configured value only
 * reaches the provider when the stream call passes it explicitly.
 */
export function configuredModelMaxTokens(
	credential: ProviderCredential | undefined,
	modelId: string
): number | undefined {
	const configured = credential?.customConfig?.models.find((model) => model.id === modelId);
	const value = configured?.maxTokens;
	if (typeof value !== 'number' || !Number.isFinite(value) || value <= 0) return undefined;
	return Math.floor(value);
}

function customRuntimeModel(
	protocol: CustomProviderProtocol,
	provider: string,
	baseUrl: string,
	discovered: DiscoveredModel,
	configured?: CustomModelDefinition
): RuntimeModel {
	const metadata = mergeCustomModelMetadata(discovered, configured);
	const catalogModel = knownCatalogModel(metadata.id, protocol);
	const reasoning = metadata.reasoning ?? catalogModel?.reasoning ?? false;
	return {
		id: metadata.id,
		name: metadata.name?.trim() || modelDisplayName(metadata.id),
		provider,
		api: protocol,
		baseUrl,
		reasoning,
		...(reasoning && catalogModel?.thinkingLevelMap
			? { thinkingLevelMap: catalogModel.thinkingLevelMap }
			: {}),
		input: customModelInput(protocol, metadata.vision),
		cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 },
		contextWindow: metadata.contextWindow ?? 128_000,
		maxTokens: metadata.maxTokens ?? 8_192
	};
}

/** Reuse precise thinking capabilities when a custom endpoint serves a known model. */
function knownCatalogModel(id: string, protocol: CustomProviderProtocol): RuntimeModel | undefined {
	catalogModels ??= [...builtinModels().getModels()] as RuntimeModel[];
	const normalize = (value: string) =>
		value
			.toLowerCase()
			.replace(/^~/, '')
			.replace(/-latest$/, '');
	const normalizedId = normalize(id);
	const preferredProvider: Partial<Record<CustomProviderProtocol, string>> = {
		'openai-responses': 'openai',
		'anthropic-messages': 'anthropic',
		'google-generative-ai': 'google',
		'mistral-conversations': 'mistral',
		'azure-openai-responses': 'azure-openai-responses'
	};
	const familyProvider = /^(gpt-|o\d)/i.test(id)
		? 'openai'
		: /^claude/i.test(id)
			? 'anthropic'
			: /^gemini/i.test(id)
				? 'google'
				: /^deepseek/i.test(id)
					? 'deepseek'
					: undefined;
	const providerHint = preferredProvider[protocol] ?? familyProvider;
	const exactMatches = catalogModels.filter((model) => normalize(model.id) === normalizedId);
	const hintedMatch = providerHint
		? exactMatches.find((model) => model.provider === providerHint)
		: undefined;

	// Prefer the complete provider-qualified ID, then fall back to the final
	// segment used by direct vendor endpoints (for example deepseek-v4-pro).
	return (
		hintedMatch ??
		exactMatches[0] ??
		catalogModels.find(
			(model) => normalize(model.id.split('/').at(-1) ?? model.id) === normalizedId
		) ??
		catalogModels.find(
			(model) =>
				normalize(model.id.split('/').at(-1) ?? model.id) === normalize(id.split('/').at(-1) ?? id)
		)
	);
}

/** Register a user-owned custom provider from its persisted protocol/model definition. */
export function registerCustomProvider(credential: ProviderCredential) {
	const config = credential.customConfig;
	if (!config || !credential.baseUrl) return;
	const baseUrl = credential.baseUrl.replace(/\/+$/, '');
	const models: RuntimeModel[] = config.models.map((definition) =>
		customRuntimeModel(config.protocol, credential.provider, baseUrl, definition, definition)
	);
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

export function credentialCacheKey(
	userId: string | undefined,
	provider: DiscoverableProvider,
	apiKey: string,
	baseUrl: string | null
) {
	// Keep the cache user-scoped without retaining any part of the secret.
	return `${userId ?? 'public'}:${provider}:${baseUrl ?? ''}:${hashSecret(apiKey)}`;
}

async function loadProviderModels(
	userId: string | undefined,
	provider: DiscoverableProvider,
	credential: ProviderCredential
): Promise<{ models: RuntimeModel[]; source: ModelSource; error?: string }> {
	const catalog = [...getRegistry().getModels(provider)] as RuntimeModel[];
	const envKeyOnUserEndpoint =
		Boolean(credential.baseUrl) &&
		credential.baseUrlFromUser !== false &&
		credential.fromUser !== true &&
		credential.apiKeyFromUser !== true;
	const apiKey = envKeyOnUserEndpoint ? null : credential.apiKey;
	if (!apiKey) return { models: catalog, source: 'catalog' };

	const cacheKey = credentialCacheKey(userId, provider, apiKey, credential.baseUrl);
	const cached = liveModelCache.get(cacheKey);
	if (cached)
		return cached.models.length
			? { models: cached.models, source: 'live' }
			: {
					models: cached.models,
					source: 'live',
					error: cached.error ?? `No chat models are available for ${provider}.`
				};

	try {
		const discovered = await fetchProviderModels(
			provider,
			apiKey,
			credential.baseUrl,
			globalThis.fetch,
			{ configuredEndpoint: Boolean(credential.baseUrl) }
		);
		const models = discovered
			.map((model) => runtimeModel(provider, model))
			.filter((model): model is RuntimeModel => Boolean(model));
		liveModelCache.set(cacheKey, { models });
		if (models.length === 0)
			return {
				models,
				source: 'live',
				error: `No chat models are available for ${provider}.`
			};
		return { models, source: 'live' };
	} catch {
		liveModelCache.set(
			cacheKey,
			{
				models: [],
				error: `Could not load live ${provider} models. Check the provider key or base URL.`
			},
			FAILED_MODEL_CACHE_TTL
		);
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
						customConfig: null,
						provider,
						fromUser: false,
						apiKeyFromEnv: Boolean(providerKeyFromEnv(provider)),
						baseUrlFromUser: false
					};
			const loaded = await loadProviderModels(userId, provider, credential);
			return { provider, credential, loaded };
		})
	);
	const customCredentials = userId
		? (await listProviderCredentials(userId)).filter((credential) => credential.customConfig)
		: [];
	let chatgptModels: RuntimeModel[] = [];
	if (userId) {
		try {
			const credential = await getProviderCredential(userId, CHATGPT_PROVIDER);
			chatgptModels = await loadChatGptPlanModels(credential);
		} catch {
			// A revoked subscription must not break other providers.
			errors.push({
				provider: CHATGPT_PROVIDER,
				message: 'Could not load ChatGPT plan models. Reconnect in Settings.'
			});
		}
	}

	for (const { provider, credential, loaded } of loadedProviders) {
		if (loaded.error) errors.push({ provider, message: loaded.error });
		const providerName = PROVIDER_NAMES[provider] ?? provider;

		for (const model of loaded.models) {
			models.push({
				id: model.id,
				provider: model.provider,
				providerName,
				name: model.name,
				contextWindow: model.contextWindow,
				capabilities: {
					vision: model.input?.includes('image') ?? false,
					tools: true,
					reasoning: Boolean(model.reasoning),
					thinkingLevels: getSupportedThinkingLevels(model)
				},
				configured: isProviderConfigured(provider),
				userConfigured: credential.fromUser,
				source: loaded.source
			});
		}
	}

	for (const model of chatgptModels) {
		models.push({
			id: model.id,
			provider: CHATGPT_PROVIDER,
			providerName: PROVIDER_NAMES.chatgpt,
			name: model.name,
			contextWindow: model.contextWindow,
			capabilities: {
				vision: model.input?.includes('image') ?? false,
				tools: true,
				reasoning: Boolean(model.reasoning),
				thinkingLevels: getSupportedThinkingLevels(model)
			},
			configured: true,
			userConfigured: true,
			source: 'live'
		});
	}

	for (const credential of customCredentials) {
		registerCustomProvider(credential);
		const config = credential.customConfig;
		if (!config || !credential.baseUrl) continue;
		const providerName = config.name?.trim() || 'Custom Provider';

		let providerModels: RuntimeModel[] = [
			...getRegistry().getModels(credential.provider)
		] as RuntimeModel[];
		let source: ModelSource = 'catalog';

		const cacheKey = credentialCacheKey(
			userId,
			// eslint-disable-next-line @typescript-eslint/no-explicit-any
			credential.provider as any,
			credential.apiKey ?? '',
			credential.baseUrl
		);
		const cached = liveModelCache.get(cacheKey);
		if (cached) {
			providerModels = cached.models;
			source = 'live';
		} else {
			try {
				const discovered = await fetchCustomProviderModels(
					config.protocol,
					credential.baseUrl,
					credential.apiKey,
					globalThis.fetch,
					{ configuredEndpoint: true }
				);
				if (discovered.length > 0) {
					const baseUrl = credential.baseUrl.replace(/\/+$/, '');
					const configuredById = new Map(config.models.map((model) => [model.id, model]));
					if (config.models.length > 0) {
						const discoveredById = new Map(discovered.map((d) => [d.id, d]));
						providerModels = config.models.map((configured) => {
							const live = discoveredById.get(configured.id) ?? configured;
							return customRuntimeModel(
								config.protocol,
								credential.provider,
								baseUrl,
								live,
								configured
							);
						});
					} else {
						providerModels = discovered.map((d) =>
							customRuntimeModel(
								config.protocol,
								credential.provider,
								baseUrl,
								d,
								configuredById.get(d.id)
							)
						);
					}
					liveModelCache.set(cacheKey, { models: providerModels });
					source = 'live';
				}
			} catch {
				// Keep the catalog fallback and briefly negative-cache the failure.
				liveModelCache.set(cacheKey, { models: providerModels }, FAILED_MODEL_CACHE_TTL);
			}
		}

		for (const model of providerModels) {
			models.push({
				id: model.id,
				provider: credential.provider,
				providerName,
				name: model.name,
				contextWindow: model.contextWindow,
				capabilities: {
					vision: model.input?.includes('image') ?? false,
					tools: true,
					reasoning: Boolean(model.reasoning),
					thinkingLevels: getSupportedThinkingLevels(model)
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

export async function listAvailableModels(userId: string): Promise<AppModel[]> {
	const result = await listModels(userId);
	return result.models.filter((model) => model.configured || model.userConfigured);
}

export async function isModelAvailable(userId: string, value: string) {
	const parsed = splitModelRef(value);
	if (!parsed) return false;
	const available = await listAvailableModels(userId);
	return available.some((model) => model.provider === parsed.provider && model.id === parsed.id);
}

export async function loadChatGptPlanModels(
	credential?: ProviderCredential
): Promise<RuntimeModel[]> {
	if (!credential?.apiKey) return [];
	const manualIds = [
		...new Set((credential.chatGptModelIds ?? []).map((id) => id.trim()).filter(Boolean))
	];
	const key = `chatgpt:${hashSecret(credential.apiKey)}`;
	const cached = liveModelCache.get(key);
	let discovered: Awaited<ReturnType<typeof fetchChatGptPlanModels>> = [];
	let discoveryError = cached?.error;
	if (cached) {
		discovered = cached.models.map((model) => ({
			id: model.id,
			name: model.name,
			reasoning: model.reasoning,
			contextWindow: model.contextWindow
		}));
	} else {
		try {
			discovered = await fetchChatGptPlanModels(credential.apiKey);
		} catch (error) {
			// Account selections remain usable when catalog discovery is unavailable.
			discoveryError = error instanceof Error ? error.message : 'ChatGPT model discovery failed';
		}
	}
	const entries = new Map(discovered.map((item) => [item.id, item]));
	for (const id of manualIds)
		if (!entries.has(id)) entries.set(id, { id, name: modelDisplayName(id) });
	const models = [...entries.values()].map((item): RuntimeModel => {
		const template = getRegistry()
			.getModels('openai')
			.find((model) => model.id === item.id);
		return {
			...(template ?? {}),
			id: item.id,
			name: item.name,
			provider: CHATGPT_PROVIDER,
			api: 'openai-responses',
			baseUrl: 'https://api.openai.com/v1',
			reasoning: item.reasoning ?? template?.reasoning ?? /^(o[1-9]|gpt-[5-9])/i.test(item.id),
			input: template?.input ?? ['text'],
			contextWindow: item.contextWindow ?? template?.contextWindow ?? 128_000,
			maxTokens: template?.maxTokens ?? 16_384,
			// Plan usage has no API per-token price. Never show invented API costs.
			cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 },
			headers: {},
			compat: {
				...template?.compat,
				supportsToolSearch: false,
				supportsAdditionalTools: false,
				supportsExplicitPromptCacheMode: false,
				supportsLongCacheRetention: false
			}
		};
	});
	if (!cached) {
		const discoveredIds = new Set(discovered.map((item) => item.id));
		// Cache only server-discovered entries; manual edits must take effect immediately.
		liveModelCache.set(
			key,
			{ models: models.filter((model) => discoveredIds.has(model.id)), error: discoveryError },
			discoveryError ? FAILED_MODEL_CACHE_TTL : LIVE_MODEL_CACHE_TTL
		);
	}
	if (discoveryError && models.length === 0) throw new Error(discoveryError);
	return models;
}

export function resolveModel(provider: string, id: string, credential?: ProviderCredential) {
	if (provider === CHATGPT_PROVIDER) return undefined;
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
	if (!isProviderId(provider) || provider === CHATGPT_PROVIDER || !id.trim()) return undefined;
	return runtimeModel(provider, { id: id.trim() });
}
export function modelRegistry() {
	return getRegistry();
}
export type { ProviderId };
