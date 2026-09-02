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
				envConfigured: settings.envConfigured
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
				envConfigured: updated.envConfigured
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
				envConfigured: fallback.envConfigured
			}
		});
	} catch (error) {
		return handleApiError(error);
	}
};
