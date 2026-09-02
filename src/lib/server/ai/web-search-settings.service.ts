import { and, eq } from 'drizzle-orm';
import { env } from '$env/dynamic/private';
import { getDb, schema } from '$lib/server/db/client';
import { decryptSecret, encryptSecret, maskKey } from './provider-settings.service';

export type SearchProviderType = 'tavily' | 'searxng' | 'duckduckgo' | 'custom';

export interface WebSearchSettings {
	apiKey: string | null;
	searchUrl: string | null;
	provider: SearchProviderType;
	fromUser: boolean;
	configured: boolean;
	envConfigured: boolean;
}

export interface WebSearchSettingsDTO {
	apiKey: string | null;
	searchUrl: string | null;
	provider: SearchProviderType;
	fromUser: boolean;
	configured: boolean;
	envConfigured: boolean;
}

function getEnv(name: string): string | undefined {
	const value = process.env[name] ?? env[name];
	return typeof value === 'string' && value.trim().length > 0 ? value : undefined;
}

export async function getWebSearchSettings(userId: string): Promise<WebSearchSettings> {
	const envKey = getEnv('WEB_SEARCH_API_KEY') ?? null;
	const envSearchUrl = getEnv('SEARXNG_URL') ?? getEnv('WEB_SEARCH_URL') ?? null;
	const [row] = await getDb()
		.select()
		.from(schema.providerSettings)
		.where(
			and(
				eq(schema.providerSettings.userId, userId),
				eq(schema.providerSettings.provider, 'web_search')
			)
		)
		.limit(1);

	const userApiKey = row ? await decryptSecret(row.apiKey) : null;
	const customConfig = (row?.customConfig as { provider?: SearchProviderType } | null) ?? null;

	let effectiveSearchUrl: string | null;
	let effectiveProvider: SearchProviderType;

	if (row?.baseUrl) {
		effectiveSearchUrl = row.baseUrl;
		effectiveProvider =
			customConfig?.provider ?? (effectiveSearchUrl.includes('searx') ? 'searxng' : 'custom');
	} else if (envSearchUrl) {
		effectiveSearchUrl = envSearchUrl;
		effectiveProvider =
			customConfig?.provider ?? (envSearchUrl.includes('searx') ? 'searxng' : 'custom');
	} else {
		effectiveSearchUrl = null;
		effectiveProvider = customConfig?.provider ?? (userApiKey || envKey ? 'tavily' : 'duckduckgo');
	}

	const effectiveApiKey = userApiKey ?? envKey ?? null;
	const fromUser = Boolean(row && (userApiKey || row.baseUrl));
	const configured = Boolean(
		effectiveApiKey || effectiveSearchUrl || effectiveProvider === 'duckduckgo'
	);

	return {
		apiKey: effectiveApiKey,
		searchUrl: effectiveSearchUrl,
		provider: effectiveProvider,
		fromUser,
		configured,
		envConfigured: Boolean(envKey || envSearchUrl)
	};
}

export async function saveWebSearchSettings(
	userId: string,
	input: {
		apiKey?: string | null;
		searchUrl?: string | null;
		provider?: SearchProviderType | null;
	}
): Promise<void> {
	const db = getDb();
	const existing = await db
		.select({
			id: schema.providerSettings.id,
			apiKey: schema.providerSettings.apiKey,
			baseUrl: schema.providerSettings.baseUrl,
			customConfig: schema.providerSettings.customConfig
		})
		.from(schema.providerSettings)
		.where(
			and(
				eq(schema.providerSettings.userId, userId),
				eq(schema.providerSettings.provider, 'web_search')
			)
		)
		.limit(1);

	const apiKey =
		input.apiKey === undefined
			? (existing[0]?.apiKey ?? null)
			: input.apiKey && input.apiKey.trim()
				? await encryptSecret(input.apiKey.trim())
				: null;

	const baseUrl =
		input.searchUrl === undefined
			? (existing[0]?.baseUrl ?? null)
			: input.searchUrl && input.searchUrl.trim()
				? input.searchUrl.trim()
				: null;

	const existingCustomConfig = existing[0]?.customConfig as {
		provider?: SearchProviderType;
	} | null;
	const provider = input.provider ?? existingCustomConfig?.provider ?? 'tavily';

	const customConfig = {
		name: 'Web Search',
		protocol: 'web_search',
		provider,
		models: []
	};

	if (existing[0]) {
		await db
			.update(schema.providerSettings)
			.set({
				apiKey,
				baseUrl,
				customConfig,
				updatedAt: new Date()
			})
			.where(eq(schema.providerSettings.id, existing[0].id));
	} else {
		await db.insert(schema.providerSettings).values({
			userId,
			provider: 'web_search',
			apiKey,
			baseUrl,
			customConfig
		});
	}
}

export async function deleteWebSearchSettings(userId: string): Promise<void> {
	await getDb()
		.delete(schema.providerSettings)
		.where(
			and(
				eq(schema.providerSettings.userId, userId),
				eq(schema.providerSettings.provider, 'web_search')
			)
		);
}

export { maskKey };
