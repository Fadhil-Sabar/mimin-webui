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

export type RecentToolCall = {
	toolName: string;
	input?: unknown;
	output?: unknown;
	status?: string;
};

export type PendingBrowserAction = {
	toolName: 'browser_open' | 'browser_search';
	input: Record<string, unknown>;
	reason: 'host_permission_required';
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
};

/**
 * Recover browser work that was completed as a navigation action but could not
 * be read until the user grants a host permission. Tool results are persisted,
 * so this survives refreshes and server restarts without guessing at phrases in
 * the user's follow-up.
 */
export function getPendingBrowserAction(
	recentToolCalls: RecentToolCall[]
): PendingBrowserAction | null {
	for (const call of recentToolCalls) {
		if (call.toolName !== 'browser_open' && call.toolName !== 'browser_search') continue;
		if (!call.input || typeof call.input !== 'object' || Array.isArray(call.input)) return null;
		if (!call.output || typeof call.output !== 'object' || Array.isArray(call.output)) return null;
		const details = (call.output as { details?: unknown }).details;
		if (!details || typeof details !== 'object' || Array.isArray(details)) return null;
		if ((details as { reason?: unknown }).reason !== 'host_permission_required') return null;
		return {
			toolName: call.toolName,
			input: call.input as Record<string, unknown>,
			reason: 'host_permission_required'
		};
	}
	return null;
}

export function getPendingBrowserActionInstruction(action: PendingBrowserAction): string {
	return [
		'A previous browser action is pending because the browser extension required host permission.',
		`Pending action: ${action.toolName} ${JSON.stringify(action.input)}.`,
		"Use the conversation to interpret the user's latest message. If it indicates that the permission blocker is resolved or asks to continue that browser task, retry the pending action with the same arguments. Otherwise, ignore the pending action.",
		'Do not substitute web_search for a pending browser action.'
	].join(' ');
}

/**
 * Expose tools according to actual capability. Intent still supplies a strong
 * instruction for explicit browser requests, but it must not hide a connected
 * browser tool before the model can interpret conversation context.
 */
export function resolveTurnToolGating(options: TurnToolGatingOptions): ToolRouting {
	const browserIntent = detectBrowserIntent(options.prompt);

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

	return {
		browserIntent,
		exposeWebSearch: browserIntent.type === 'none' && options.hasWebSearch,
		exposeBrowserSearch: true,
		exposeBrowserOpen: true
	};
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
