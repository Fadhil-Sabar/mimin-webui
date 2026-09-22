/**
 * One shared source for `/api/models` in the browser.
 *
 * The endpoint answers with an ETag, so a revalidation is cheap, and the parsed list
 * is memoised for a short window: opening the chat and the home page in the same
 * session no longer rebuilds and re-downloads the ~20 KB catalog twice, while a
 * provider change still shows up within the TTL (or immediately after
 * `invalidateModelsCache`).
 */
const MODELS_CACHE_TTL_MS = 30_000;

export type ModelsError = { provider?: string; message?: string };
export type ModelsPayload<TModel> = { models: TModel[]; errors: ModelsError[] };

type ModelsCacheEntry = { payload: ModelsPayload<unknown>; etag: string | null; at: number };

let cacheEntry: ModelsCacheEntry | null = null;
let inflight: Promise<ModelsPayload<unknown>> | null = null;

/** Emitted when a provider connection changes while a model picker is mounted. */
export const MODELS_CHANGED_EVENT = 'mimin:models-changed';

/** Drop the memoised list, e.g. after the user saves or removes a provider key. */
export function invalidateModelsCache() {
	cacheEntry = null;
	inflight = null;
}

/**
 * Invalidate the shared list and tell already-mounted model pickers to refresh.
 * Settings is rendered alongside the current page, so a navigation is not
 * guaranteed to remount the home or chat picker after a provider is saved.
 */
export function notifyModelsChanged() {
	invalidateModelsCache();
	if (typeof window !== 'undefined') window.dispatchEvent(new Event(MODELS_CHANGED_EVENT));
}

export async function loadModelsCached<TModel>(
	options: { force?: boolean } = {}
): Promise<ModelsPayload<TModel>> {
	const fresh = cacheEntry && Date.now() - cacheEntry.at < MODELS_CACHE_TTL_MS;
	if (fresh && !options.force) return cacheEntry!.payload as ModelsPayload<TModel>;
	if (inflight) return inflight as Promise<ModelsPayload<TModel>>;

	const request = (async () => {
		try {
			const headers: Record<string, string> = {};
			if (cacheEntry?.etag) headers['If-None-Match'] = cacheEntry.etag;
			const response = await fetch('/api/models', { headers });
			if (response.status === 304 && cacheEntry) {
				const payload = cacheEntry.payload as ModelsPayload<TModel>;
				cacheEntry = { ...cacheEntry, at: Date.now() };
				return payload;
			}
			if (!response.ok) throw new Error('Could not load models');
			const data = (await response.json()) as Partial<ModelsPayload<TModel>>;
			const payload: ModelsPayload<TModel> = {
				models: Array.isArray(data?.models) ? data.models : [],
				errors: Array.isArray(data?.errors) ? data.errors : []
			};
			cacheEntry = { payload, etag: response.headers.get('etag'), at: Date.now() };
			return payload;
		} finally {
			inflight = null;
		}
	})();

	inflight = request;
	return request;
}

/** Provider discovery failures the endpoint reported, as one sentence. */
export function modelsErrorMessage(payload: ModelsPayload<unknown>): string {
	return payload.errors
		.map((error) => error.message ?? '')
		.filter(Boolean)
		.join(' ');
}
