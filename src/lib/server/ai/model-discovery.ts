import type { CustomProviderProtocol } from './provider-settings.service';

export type DiscoverableProvider = 'openai' | 'anthropic' | 'google';

export type DiscoveredModel = {
	id: string;
	name?: string;
	contextWindow?: number;
	maxTokens?: number;
	reasoning?: boolean;
	vision?: boolean;
};

type JsonObject = Record<string, unknown>;

const DEFAULT_BASE_URLS: Record<DiscoverableProvider, string> = {
	openai: 'https://api.openai.com/v1',
	anthropic: 'https://api.anthropic.com',
	google: 'https://generativelanguage.googleapis.com/v1beta'
};

const NON_CHAT_MODEL_PATTERN =
	/(?:embedding|moderation|whisper|transcri(?:be|ption)?|translation|tts|dall-e|image|audio|realtime|rerank|search)/i;

function asObject(value: unknown): JsonObject | null {
	return typeof value === 'object' && value !== null ? (value as JsonObject) : null;
}

function stringField(value: JsonObject, key: string): string | undefined {
	const field = value[key];
	return typeof field === 'string' && field.trim() ? field.trim() : undefined;
}

function normalizeBaseUrl(baseUrl: string | null | undefined, fallback: string) {
	return (baseUrl?.trim() || fallback).replace(/\/+$/, '');
}

/** Build the provider's model-list endpoint, including provider-specific version paths. */
export function modelListUrl(provider: DiscoverableProvider, baseUrl?: string | null) {
	const base = normalizeBaseUrl(baseUrl, DEFAULT_BASE_URLS[provider]);
	if (base.endsWith('/models')) return base;
	if (provider === 'anthropic' && !/\/v1$/i.test(base)) return `${base}/v1/models`;
	return `${base}/models`;
}

export function modelDisplayName(id: string) {
	return id
		.replace(/^models\//, '')
		.replace(/[-_]+/g, ' ')
		.replace(/\b\w/g, (character) => character.toUpperCase());
}

function isUsableOpenAiModel(id: string) {
	return !NON_CHAT_MODEL_PATTERN.test(id);
}

function isUsableGoogleModel(model: JsonObject) {
	const methods = model.supportedGenerationMethods;
	return !Array.isArray(methods) || methods.some((method) => method === 'generateContent');
}

/**
 * Normalize the three provider response shapes into model IDs used by pi-ai.
 * OpenAI lists every model type, so obvious non-chat models are excluded.
 */
export function parseProviderModelList(
	provider: DiscoverableProvider,
	payload: unknown
): DiscoveredModel[] {
	const body = asObject(payload);
	const rows = body?.[provider === 'google' ? 'models' : 'data'];
	if (!Array.isArray(rows)) throw new Error(`Invalid ${provider} model list response`);

	const models: DiscoveredModel[] = [];
	const seen = new Set<string>();
	for (const row of rows) {
		const item = asObject(row);
		if (!item) continue;

		const rawId = stringField(item, 'id') ?? stringField(item, 'name');
		if (!rawId) continue;
		const id = provider === 'google' ? rawId.replace(/^models\//, '') : rawId;
		if (!id || seen.has(id)) continue;
		if (provider === 'openai' && !isUsableOpenAiModel(id)) continue;
		if (provider === 'google' && !isUsableGoogleModel(item)) continue;

		seen.add(id);
		models.push({
			id,
			name:
				stringField(item, provider === 'anthropic' ? 'display_name' : 'displayName') ??
				stringField(item, 'name') ??
				undefined
		});
	}
	return models;
}

function requestHeaders(provider: DiscoverableProvider, apiKey: string) {
	const headers: Record<string, string> = {
		Accept: 'application/json'
	};
	if (provider === 'openai') headers.Authorization = `Bearer ${apiKey}`;
	if (provider === 'anthropic') {
		headers['x-api-key'] = apiKey;
		headers['anthropic-version'] = '2023-06-01';
	}
	if (provider === 'google') headers['x-goog-api-key'] = apiKey;
	return headers;
}

function addQuery(url: string, params: Record<string, string>) {
	const query = new URLSearchParams(params).toString();
	return `${url}${url.includes('?') ? '&' : '?'}${query}`;
}

/** Fetch the models visible to the supplied provider credential. */
export async function fetchProviderModels(
	provider: DiscoverableProvider,
	apiKey: string,
	baseUrl?: string | null,
	fetcher: typeof globalThis.fetch = globalThis.fetch
): Promise<DiscoveredModel[]> {
	const controller = new AbortController();
	const timeout = setTimeout(() => controller.abort(), 5000);
	try {
		const models: DiscoveredModel[] = [];
		let url = modelListUrl(provider, baseUrl);
		for (let page = 0; page < 10; page += 1) {
			if (page === 0) {
				if (provider === 'google') url = addQuery(url, { pageSize: '1000' });
				if (provider === 'anthropic') url = addQuery(url, { limit: '1000' });
			}
			const response = await fetcher(url, {
				method: 'GET',
				headers: requestHeaders(provider, apiKey),
				signal: controller.signal
			});
			if (!response.ok) throw new Error(`${provider} model list returned ${response.status}`);
			const body = await response.json();
			models.push(...parseProviderModelList(provider, body));
			const bodyObject = asObject(body);
			if (provider === 'google') {
				const nextPageToken = stringField(bodyObject ?? {}, 'nextPageToken');
				if (!nextPageToken) break;
				url = addQuery(modelListUrl(provider, baseUrl), {
					pageSize: '1000',
					pageToken: nextPageToken
				});
				continue;
			}
			if (provider === 'anthropic' && bodyObject?.has_more === true) {
				const lastId = stringField(bodyObject, 'last_id');
				if (lastId) {
					url = addQuery(modelListUrl(provider, baseUrl), {
						limit: '1000',
						after_id: lastId
					});
					continue;
				}
			}
			break;
		}
		return models.filter(
			(model, index) => models.findIndex((candidate) => candidate.id === model.id) === index
		);
	} finally {
		clearTimeout(timeout);
	}
}

/** Build custom provider model-list endpoint URL based on protocol. */
export function customModelListUrl(protocol: CustomProviderProtocol, baseUrl: string) {
	const base = baseUrl.trim().replace(/\/+$/, '');
	if (base.endsWith('/models')) return base;
	if (protocol === 'anthropic-messages' || protocol === 'mistral-conversations') {
		if (base.endsWith('/v1')) return `${base}/models`;
		return `${base}/v1/models`;
	}
	return `${base}/models`;
}

/** Build request headers for custom provider model discovery. */
export function customRequestHeaders(
	protocol: CustomProviderProtocol,
	apiKey?: string | null
): Record<string, string> {
	const headers: Record<string, string> = {
		Accept: 'application/json'
	};
	if (!apiKey?.trim()) return headers;
	const key = apiKey.trim();
	if (protocol === 'anthropic-messages') {
		headers['x-api-key'] = key;
		headers['anthropic-version'] = '2023-06-01';
	} else if (protocol === 'google-generative-ai') {
		headers['x-goog-api-key'] = key;
	} else if (protocol === 'azure-openai-responses') {
		headers['api-key'] = key;
		headers.Authorization = `Bearer ${key}`;
	} else {
		headers.Authorization = `Bearer ${key}`;
	}
	return headers;
}

/** Parse models from custom provider response. */
export function parseCustomProviderModelList(
	protocol: CustomProviderProtocol,
	payload: unknown
): DiscoveredModel[] {
	let rows: unknown[] | undefined;
	if (Array.isArray(payload)) {
		rows = payload;
	} else {
		const body = asObject(payload);
		if (Array.isArray(body?.data)) {
			rows = body.data;
		} else if (Array.isArray(body?.models)) {
			rows = body.models;
		}
	}
	if (!rows) throw new Error(`Invalid model list response format from custom provider`);

	const models: DiscoveredModel[] = [];
	const seen = new Set<string>();
	for (const row of rows) {
		const item = asObject(row);
		if (!item) continue;

		const rawId =
			stringField(item, 'id') ?? stringField(item, 'name') ?? stringField(item, 'model');
		if (!rawId) continue;
		const id = protocol === 'google-generative-ai' ? rawId.replace(/^models\//, '') : rawId;
		if (!id || seen.has(id)) continue;

		if (
			(protocol === 'openai-completions' ||
				protocol === 'openai-responses' ||
				protocol === 'azure-openai-responses') &&
			!isUsableOpenAiModel(id)
		) {
			continue;
		}
		if (protocol === 'google-generative-ai' && !isUsableGoogleModel(item)) {
			continue;
		}

		seen.add(id);
		const rawName =
			stringField(item, protocol === 'anthropic-messages' ? 'display_name' : 'displayName') ??
			stringField(item, 'name');
		const name = rawName && rawName !== id ? rawName : undefined;

		const contextWindow =
			typeof item.context_length === 'number'
				? item.context_length
				: typeof item.context_window === 'number'
					? item.context_window
					: typeof item.contextWindow === 'number'
						? item.contextWindow
						: typeof item.max_context_length === 'number'
							? item.max_context_length
							: undefined;

		const maxTokens =
			typeof item.max_tokens === 'number'
				? item.max_tokens
				: typeof item.max_output_tokens === 'number'
					? item.max_output_tokens
					: typeof item.maxTokens === 'number'
						? item.maxTokens
						: undefined;

		const reasoning = typeof item.reasoning === 'boolean' ? item.reasoning : undefined;
		const vision =
			typeof item.vision === 'boolean'
				? item.vision
				: Array.isArray(item.modalities) && item.modalities.includes('image')
					? true
					: undefined;

		models.push({
			id,
			name,
			contextWindow,
			maxTokens,
			reasoning,
			vision
		});
	}
	return models;
}

/** Fetch models from a custom provider endpoint. */
export async function fetchCustomProviderModels(
	protocol: CustomProviderProtocol,
	baseUrl: string,
	apiKey?: string | null,
	fetcher: typeof globalThis.fetch = globalThis.fetch
): Promise<DiscoveredModel[]> {
	const controller = new AbortController();
	const timeout = setTimeout(() => controller.abort(), 8000);
	try {
		let url = customModelListUrl(protocol, baseUrl);
		if (protocol === 'google-generative-ai') {
			url = addQuery(url, { pageSize: '1000' });
		} else if (protocol === 'anthropic-messages') {
			url = addQuery(url, { limit: '1000' });
		}
		const response = await fetcher(url, {
			method: 'GET',
			headers: customRequestHeaders(protocol, apiKey),
			signal: controller.signal
		});
		if (!response.ok) {
			throw new Error(
				`Provider returned HTTP ${response.status} (${response.statusText || 'Error'})`
			);
		}
		const body = await response.json();
		return parseCustomProviderModelList(protocol, body);
	} finally {
		clearTimeout(timeout);
	}
}

