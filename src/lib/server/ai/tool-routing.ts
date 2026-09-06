export type BrowserIntent =
	| { type: 'none' }
	| { type: 'google-search' }
	| { type: 'scholar-search' }
	| { type: 'browser-open' };

export type ToolRouting = {
	browserIntent: BrowserIntent;
	exposeWebSearch: boolean;
	exposeBrowserSearch: boolean;
	exposeBrowserOpen: boolean;
};

/**
 * Deterministically detect whether the user prompt requests an explicit browser action.
 * Conservative: general research/search queries default to 'none' (web_search).
 */
export function detectBrowserIntent(prompt: string): BrowserIntent {
	const text = prompt.trim();
	if (!text) return { type: 'none' };

	// 1. Explicit Google Scholar search
	const hasScholar = /\b(?:google\s+scholar|scholar)\b/i.test(text);
	if (hasScholar) {
		const isScholarDefinitionalOnly =
			/^(?:apa\s+itu|what\s+is|who\s+is|jelaskan\s+(?:tentang\s+)?|explain\s+)(?:google\s+)?scholar\??$/i.test(
				text
			);
		if (!isScholarDefinitionalOnly) {
			const hasScholarAction =
				/\b(?:cari|search|find|lookup|look\s+up|query|research|temukan|buka)\b/i.test(text) ||
				/\b(?:di|on|in|via|lewat|using|pakai|through)\s+(?:google\s+)?scholar\b/i.test(text) ||
				/\b(?:google\s+)?scholar\s+(?:search|cari|query|for)\b/i.test(text) ||
				/\b(?:paper|jurnal|penelitian|studi|citation|publikasi)\b/i.test(text);

			if (hasScholarAction) {
				return { type: 'scholar-search' };
			}
		}
	}

	// 2. Explicit Google search
	const hasGoogle = /\b(?:google|googling|google-kan|men-?google)\b/i.test(text);
	if (hasGoogle) {
		const isGoogleDefinitionalOnly =
			/^(?:apa\s+itu|what\s+is|who\s+is|siapa\s+ceo\s+|who\s+founded\s+|jelaskan\s+(?:tentang\s+)?|explain\s+)google\??$/i.test(
				text
			);
		if (!isGoogleDefinitionalOnly) {
			const hasGoogleAction =
				/\bgoogle\s+search\b/i.test(text) ||
				/\b(?:cari|search|find|lookup|look\s+up|temukan|research)\b.*\b(?:di|on|in|via|lewat|using|pakai|through)\s+google\b/i.test(
					text
				) ||
				/\b(?:di|on|in|via|lewat|using|pakai|through)\s+google\b.*\b(?:cari|search|find|lookup|look\s+up|temukan)\b/i.test(
					text
				) ||
				/\b(?:buka|open)\s+google\s+(?:dan|and)\s+(?:cari|search|find)\b/i.test(text) ||
				/\bgoogle\s+(?:dan|and)\s+(?:cari|search|find)\b/i.test(text) ||
				/\bsearch\s+(?:this\s+)?on\s+google\b/i.test(text) ||
				/\bgoogle\s*:\s*\S+/i.test(text) ||
				/\bgoogle\s+(?:tentang|about|for)\b/i.test(text) ||
				/\b(?:googling|google-kan|men-?google)\b/i.test(text);

			if (hasGoogleAction) {
				return { type: 'google-search' };
			}
		}
	}

	// 3. Explicit browser open / navigation
	const hasUrl = /https?:\/\/[^\s<>"')]+/i.test(text);
	const hasBrowserOrTab = /\b(?:browser|tab)\b/i.test(text);
	const hasOpenAction =
		/\b(?:buka|open|read|baca|visit|kunjungi|navigate|browse|lihat|view)\b/i.test(text);

	if (hasUrl) {
		const isSoleUrl = /^https?:\/\/[^\s<>"')]+$/.test(text);
		if (hasOpenAction || isSoleUrl || hasBrowserOrTab) {
			return { type: 'browser-open' };
		}
	}

	if (hasBrowserOrTab) {
		const hasExplicitPageOrTabAction =
			/\b(?:buka|open)\s+(?:tab|halaman|page|url|link)\b/i.test(text) ||
			/\b(?:buka|open|read|baca)\s+(?:ini\s+)?(?:di|in|lewat|via)\s+(?:browser|tab)\b/i.test(
				text
			) ||
			/\b(?:open|buka)\s+(?:this\s+)?(?:url|link|page|halaman)\s+(?:in|di|lewat)\s+(?:browser|tab)\b/i.test(
				text
			) ||
			/\b(?:baca\s+halaman\s+(?:ini\s+)?lewat\s+browser|read\s+this\s+page\s+(?:via|in|through)\s+browser)\b/i.test(
				text
			) ||
			/\b(?:buka\s+tab|open\s+tab)\b/i.test(text);

		if (hasExplicitPageOrTabAction) {
			return { type: 'browser-open' };
		}
	}

	return { type: 'none' };
}

/**
 * Gate tools deterministically for the current turn.
 * Avoids exposing both web_search and browser_search in the same turn.
 */
export function resolveTurnToolGating(options: {
	prompt: string;
	browserBridgeEnabled: boolean;
	hasWebSearch: boolean;
}): ToolRouting {
	const browserIntent = detectBrowserIntent(options.prompt);

	if (!options.browserBridgeEnabled) {
		return {
			browserIntent,
			exposeWebSearch: options.hasWebSearch,
			exposeBrowserSearch: false,
			exposeBrowserOpen: false
		};
	}

	switch (browserIntent.type) {
		case 'google-search':
		case 'scholar-search':
			return {
				browserIntent,
				exposeWebSearch: false,
				exposeBrowserSearch: true,
				exposeBrowserOpen: true
			};
		case 'browser-open':
			return {
				browserIntent,
				exposeWebSearch: false,
				exposeBrowserSearch: false,
				exposeBrowserOpen: true
			};
		case 'none':
		default:
			return {
				browserIntent,
				exposeWebSearch: options.hasWebSearch,
				exposeBrowserSearch: false,
				exposeBrowserOpen: false
			};
	}
}
