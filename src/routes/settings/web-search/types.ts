export type SearchProviderType = 'tavily' | 'searxng' | 'duckduckgo' | 'custom';

export type WebSearchSettingsState = {
	apiKey: string | null;
	searchUrl: string | null;
	provider: SearchProviderType;
	fromUser: boolean;
	configured: boolean;
	envConfigured: boolean;
	apiKeyFromUser: boolean;
	searchUrlFromUser: boolean;
	apiKeyEnvConfigured: boolean;
	searchUrlEnvConfigured: boolean;
};

export type TestResult = {
	answer: string | null;
	sources: Array<{ title: string; url: string; snippet: string }>;
	notice?: string;
};

/** Connection dialog field; the dialog edits exactly one of them at a time. */
export type ConnectionField = 'apiKey' | 'searchUrl';

/** `null` means the connection dialog is closed. */
export type EditingField = ConnectionField | null;
