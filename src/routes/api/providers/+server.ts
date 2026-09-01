import { json } from '@sveltejs/kit';
import { randomUUID } from 'node:crypto';
import type { RequestHandler } from '@sveltejs/kit';
import { apiError, handleApiError, requireUser } from '$lib/server/api';
import {
	fetchCustomProviderModels
} from '$lib/server/ai/model-discovery';
import {
	listProviderCredentials,
	maskKey,
	saveProviderCredential
} from '$lib/server/ai/provider-settings.service';
import { providerSettingsInput } from '$lib/server/validation';

export const GET: RequestHandler = async (event) => {
	try {
		const user = await requireUser(event);
		if (!user) return apiError('UNAUTHORIZED', 'Authentication required.', 401);
		const credentials = await listProviderCredentials(user.id);
		return json({
			providers: credentials.map((credential) => ({
				provider: credential.provider,
				apiKey: maskKey(credential.apiKey),
				baseUrl: credential.baseUrl,
				customConfig: credential.customConfig,
				fromUser: credential.fromUser
			}))
		});
	} catch (error) {
		return handleApiError(error);
	}
};

export const POST: RequestHandler = async (event) => {
	try {
		const user = await requireUser(event);
		if (!user) return apiError('UNAUTHORIZED', 'Authentication required.', 401);
		const parsed = providerSettingsInput.safeParse(await event.request.json());
		if (!parsed.success || !parsed.data.customConfig || !parsed.data.baseUrl)
			return apiError(
				'INVALID_INPUT',
				'Custom providers require a name, protocol, and base URL.'
			);
		if (parsed.data.apiKey && parsed.data.apiKey.length < 8)
			return apiError('INVALID_INPUT', 'API key looks too short.');

		const customConfig = parsed.data.customConfig;
		let models = customConfig.models ?? [];

		if (models.length === 0) {
			try {
				const discovered = await fetchCustomProviderModels(
					customConfig.protocol,
					parsed.data.baseUrl,
					parsed.data.apiKey
				);
				models = discovered.map((model) => ({
					id: model.id,
					name: model.name,
					contextWindow: model.contextWindow,
					maxTokens: model.maxTokens,
					reasoning: model.reasoning,
					vision: model.vision
				}));
			} catch (error) {
				return apiError(
					'INVALID_INPUT',
					`Could not retrieve models from provider: ${error instanceof Error ? error.message : 'Connection failed'}. Please verify your base URL and API key, or provide model IDs manually.`
				);
			}
			if (models.length === 0) {
				return apiError(
					'INVALID_INPUT',
					'No usable chat models found at provider endpoint. Please specify model IDs manually.'
				);
			}
		}

		const provider = `custom_${randomUUID()}`;
		await saveProviderCredential(user.id, provider, {
			...parsed.data,
			customConfig: {
				...customConfig,
				models
			}
		});
		return json({ provider, modelsCount: models.length }, { status: 201 });
	} catch (error) {
		return handleApiError(error);
	}
};
