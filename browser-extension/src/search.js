export const SEARCH_ENGINES = Object.freeze({
	google: 'https://www.google.com/search',
	scholar: 'https://scholar.google.com/scholar'
});

/**
 * Builds a safe search URL without requesting access to the current page.
 * An empty query opens the selected search engine's home page.
 *
 * @param {'google' | 'scholar' | 'google_scholar'} engine
 * @param {string} query
 */
export function buildSearchUrl(engine, query) {
	const resolvedEngine = engine === 'google_scholar' ? 'scholar' : engine;
	const baseUrl = SEARCH_ENGINES[resolvedEngine];
	if (!baseUrl) throw new TypeError(`Unsupported search engine: ${engine}`);

	const normalizedQuery = query.trim();
	if (!normalizedQuery) {
		return resolvedEngine === 'scholar' ? 'https://scholar.google.com/' : 'https://www.google.com/';
	}

	const url = new URL(baseUrl);
	url.searchParams.set('q', normalizedQuery);
	return url.toString();
}
