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
	blockedReason?: 'browser_bridge_unavailable';
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
				/^(?:google\s+scholar|scholar)$/i.test(text) ||
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
				/^(?:google|google\s+search)$/i.test(text) ||
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
			/\b(?:buka|open|read|baca)\s+(?:this\s+|ini\s+)?(?:di|in|lewat|via)\s+(?:browser|tab)\b/i.test(
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

	// Direct open/read action targeting a URL, link, page, paper, or article
	const hasDirectPageAction =
		/\b(?:buka|open|read|baca|visit|kunjungi|fetch)\s+(?:this\s+|ini\s+)?(?:page|halaman|link|tautan|url|paper|artikel|article|jurnal)\b/i.test(
			text
		) ||
		/\b(?:page|halaman|link|tautan|url|paper|artikel|article|jurnal)\s+(?:ini\s+)?(?:buka|open|read|baca)\b/i.test(
			text
		);
	if (hasDirectPageAction) {
		return { type: 'browser-open' };
	}

	return { type: 'none' };
}

export type TurnToolGatingOptions = {
	prompt: string;
	browserBridgeEnabled: boolean;
	hasWebSearch: boolean;
	hasActiveBrowserSession?: boolean;
	previousIntent?: BrowserIntent;
	recentToolCalls?: Array<{ toolName: string; input?: unknown; status?: string }>;
	lastAssistantText?: string;
};

/**
 * Detect whether the prompt is a follow-up or continuation in an active browser session.
 */
export function detectBrowserContinuation(
	prompt: string,
	options: {
		hasActiveBrowserSession?: boolean;
		previousIntent?: BrowserIntent;
		recentToolCalls?: Array<{ toolName: string; input?: unknown; status?: string }>;
		lastAssistantText?: string;
	}
): BrowserIntent {
	const text = prompt.trim();
	if (!text) return { type: 'none' };

	const hasPreviousBrowserContext =
		Boolean(options.hasActiveBrowserSession) ||
		Boolean(options.previousIntent && options.previousIntent.type !== 'none') ||
		Boolean(
			options.recentToolCalls?.some(
				(t) => t.toolName === 'browser_search' || t.toolName === 'browser_open'
			)
		);

	if (!hasPreviousBrowserContext) {
		return { type: 'none' };
	}

	// Determine the inherited intent from previous turns
	let inheritedIntent: BrowserIntent = { type: 'none' };
	if (options.previousIntent && options.previousIntent.type !== 'none') {
		inheritedIntent = options.previousIntent;
	} else if (options.recentToolCalls && options.recentToolCalls.length > 0) {
		const lastBrowserCall = options.recentToolCalls.find(
			(t) => t.toolName === 'browser_search' || t.toolName === 'browser_open'
		);
		if (lastBrowserCall?.toolName === 'browser_search') {
			const engine =
				lastBrowserCall.input &&
				typeof lastBrowserCall.input === 'object' &&
				'engine' in lastBrowserCall.input
					? (lastBrowserCall.input as { engine: string }).engine
					: undefined;
			inheritedIntent =
				engine === 'scholar' ? { type: 'scholar-search' } : { type: 'google-search' };
		} else if (lastBrowserCall?.toolName === 'browser_open') {
			inheritedIntent = { type: 'browser-open' };
		}
	}

	if (inheritedIntent.type === 'none') {
		return { type: 'none' };
	}

	// Reject if prompt explicitly requests a web search
	const isExplicitWebSearch =
		/\b(?:cari\s+(?:di|lewat|pakai)\s+web|search\s+(?:the\s+)?web|web\s+search)\b/i.test(text);
	if (isExplicitWebSearch) {
		return { type: 'none' };
	}

	// 1. Check for affirmations, continuation, and deep-dive verbs
	const isAffirmationOrContinuation =
		/\b(?:yes|yep|yeah|sure|ok|okay|oke|ya|iya|boleh|silakan|lanjut|lanjutkan|continue|go\s+ahead|do\s+it|please\s+do|all|semua|dig(?:\s+it|\s+deeper)?|deep(?:er)?|detail(?:nya)?|more|explore|ringkas|summarize|jelaskan|explain|fetch)\b/i.test(
			text
		);

	// 2. Check for references to papers, links, articles, or indexed items
	const hasReference =
		/\b(?:paper|jurnal|penelitian|studi|artikel|article|link|tautan|url|hasil|result|nomor|nomor\s*\d+|#?\d+|pertama|kedua|ketiga|keempat|kelima|first|second|third|fourth|fifth|top\s*\d+|terbaik|terbaru)\b/i.test(
			text
		);

	if (isAffirmationOrContinuation || hasReference) {
		return inheritedIntent;
	}

	return { type: 'none' };
}

/**
 * Gate tools deterministically for the current turn.
 * Avoids exposing both web_search and browser_search in the same turn.
 * Never silently falls back from explicit browser intent to web_search.
 */
export function resolveTurnToolGating(options: TurnToolGatingOptions): ToolRouting {
	let browserIntent = detectBrowserIntent(options.prompt);

	if (browserIntent.type === 'none') {
		const continuation = detectBrowserContinuation(options.prompt, options);
		if (continuation.type !== 'none') {
			browserIntent = continuation;
		}
	}

	if (!options.browserBridgeEnabled) {
		switch (browserIntent.type) {
			case 'google-search':
			case 'scholar-search':
			case 'browser-open':
				return {
					browserIntent,
					exposeWebSearch: false,
					exposeBrowserSearch: false,
					exposeBrowserOpen: false,
					blockedReason: 'browser_bridge_unavailable'
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

/**
 * Short per-turn routing instruction appended to the system prompt when explicit browser intent is present.
 */
export function getTurnRoutingInstruction(intent: BrowserIntent): string | null {
	switch (intent.type) {
		case 'google-search':
			return 'The user explicitly requested Google Search. Use browser_search with engine="google". Do not substitute another search provider.';
		case 'scholar-search':
			return 'The user explicitly requested Google Scholar. Use browser_search with engine="scholar". Do not substitute another search provider.';
		case 'browser-open':
			return 'The user explicitly requested browser navigation. Use browser_open.';
		case 'none':
		default:
			return null;
	}
}
