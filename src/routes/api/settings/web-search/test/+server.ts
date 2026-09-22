import { json } from '@sveltejs/kit';
import type { RequestHandler } from '@sveltejs/kit';
import { apiError, requireUser } from '$lib/server/api';
import { getWebSearchSettings } from '$lib/server/ai/web-search-settings.service';
import { searchWeb } from '$lib/server/ai/tools/web-search.tool';
import { assertConfiguredEndpoint } from '$lib/server/outbound';
import { z } from 'zod';

const testSearchInput = z.object({
	query: z.string().trim().min(2).max(500).default('latest tech news'),
	apiKey: z.string().trim().nullable().optional(),
	searchUrl: z.string().trim().nullable().optional(),
	provider: z.enum(['tavily', 'searxng', 'duckduckgo', 'custom']).optional()
});

export const POST: RequestHandler = async (event) => {
	try {
		const user = await requireUser(event);
		if (!user) return apiError('UNAUTHORIZED', 'Authentication required.', 401);

		const parsed = testSearchInput.safeParse(await event.request.json().catch(() => ({})));
		if (!parsed.success) {
			return apiError('INVALID_INPUT', parsed.error.issues[0]?.message ?? 'Invalid test input.');
		}

		const currentSettings = await getWebSearchSettings(user.id);
		const requestedSearchUrl = parsed.data.searchUrl?.trim() || null;
		if (requestedSearchUrl) assertConfiguredEndpoint(requestedSearchUrl);
		const searchUrlChanged =
			parsed.data.searchUrl !== undefined && requestedSearchUrl !== currentSettings.searchUrl;
		const effectiveApiKey =
			parsed.data.apiKey !== undefined
				? parsed.data.apiKey?.trim() || null
				: searchUrlChanged
					? null
					: currentSettings.apiKey;

		const effectiveSearchUrl =
			parsed.data.searchUrl !== undefined
				? parsed.data.searchUrl?.trim() || null
				: currentSettings.searchUrl;

		const effectiveProvider = parsed.data.provider ?? currentSettings.provider;

		const result = await searchWeb(
			{ query: parsed.data.query, maxResults: 5 },
			event.request.signal,
			{
				apiKey: effectiveApiKey,
				searchUrl: effectiveSearchUrl,
				provider: effectiveProvider,
				apiKeySource:
					parsed.data.apiKey !== undefined
						? 'user'
						: searchUrlChanged
							? 'none'
							: currentSettings.apiKeySource,
				searchUrlSource:
					parsed.data.searchUrl !== undefined ? 'user' : currentSettings.searchUrlSource,
				configuredEndpoint: true
			}
		);

		return json({
			success: true,
			result
		});
	} catch (error) {
		return json(
			{
				success: false,
				error: error instanceof Error ? error.message : 'Search request failed'
			},
			{ status: 400 }
		);
	}
};
