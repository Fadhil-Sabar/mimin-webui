export type DiscoverableProvider = 'openai' | 'anthropic' | 'google';

export type DiscoveredModel = {
	id: string;
	name?: string;
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
