import { json } from '@sveltejs/kit';
import type { RequestHandler } from '@sveltejs/kit';
import { apiError, handleApiError, requireUser } from '$lib/server/api';
import {
	deleteWebSearchSettings,
	getWebSearchSettings,
	maskKey,
	saveWebSearchSettings
} from '$lib/server/ai/web-search-settings.service';
import { webSearchSettingsInput } from '$lib/server/validation';
import { assertAllowedOutboundUrl } from '$lib/server/outbound';

export const GET: RequestHandler = async (event) => {
	try {
		const user = await requireUser(event);
		if (!user) return apiError('UNAUTHORIZED', 'Authentication required.', 401);
		const settings = await getWebSearchSettings(user.id);
		return json({
			settings: {
				apiKey: maskKey(settings.apiKey),
				searchUrl: settings.searchUrl,
				provider: settings.provider,
				fromUser: settings.fromUser,
				configured: settings.configured,
				envConfigured: settings.envConfigured,
				apiKeyFromUser: settings.apiKeyFromUser,
				searchUrlFromUser: settings.searchUrlFromUser,
				apiKeyEnvConfigured: settings.apiKeyEnvConfigured,
				searchUrlEnvConfigured: settings.searchUrlEnvConfigured
			}
		});
	} catch (error) {
		return handleApiError(error);
	}
};

export const PUT: RequestHandler = async (event) => {
	try {
		const user = await requireUser(event);
		if (!user) return apiError('UNAUTHORIZED', 'Authentication required.', 401);
		const parsed = webSearchSettingsInput.safeParse(await event.request.json());
		if (!parsed.success) {
			const issue = parsed.error.issues[0]?.message ?? 'Invalid search settings input.';
			return apiError('INVALID_INPUT', issue);
		}

		if (parsed.data.searchUrl) assertAllowedOutboundUrl(parsed.data.searchUrl);
		await saveWebSearchSettings(user.id, {
			apiKey: parsed.data.apiKey,
			searchUrl: parsed.data.searchUrl,
			provider: parsed.data.provider
		});

		const updated = await getWebSearchSettings(user.id);
		return json({
			settings: {
				apiKey: maskKey(updated.apiKey),
				searchUrl: updated.searchUrl,
				provider: updated.provider,
				fromUser: updated.fromUser,
				configured: updated.configured,
				envConfigured: updated.envConfigured,
				apiKeyFromUser: updated.apiKeyFromUser,
				searchUrlFromUser: updated.searchUrlFromUser,
				apiKeyEnvConfigured: updated.apiKeyEnvConfigured,
				searchUrlEnvConfigured: updated.searchUrlEnvConfigured
			}
		});
	} catch (error) {
		return handleApiError(error);
	}
};

export const DELETE: RequestHandler = async (event) => {
	try {
		const user = await requireUser(event);
		if (!user) return apiError('UNAUTHORIZED', 'Authentication required.', 401);
		await deleteWebSearchSettings(user.id);
		const fallback = await getWebSearchSettings(user.id);
		return json({
			settings: {
				apiKey: maskKey(fallback.apiKey),
				searchUrl: fallback.searchUrl,
				provider: fallback.provider,
				fromUser: fallback.fromUser,
				configured: fallback.configured,
				envConfigured: fallback.envConfigured,
				apiKeyFromUser: fallback.apiKeyFromUser,
				searchUrlFromUser: fallback.searchUrlFromUser,
				apiKeyEnvConfigured: fallback.apiKeyEnvConfigured,
				searchUrlEnvConfigured: fallback.searchUrlEnvConfigured
			}
		});
	} catch (error) {
		return handleApiError(error);
	}
};
