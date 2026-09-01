import { json } from '@sveltejs/kit';
import { randomUUID } from 'node:crypto';
import type { RequestHandler } from '@sveltejs/kit';
import { apiError, handleApiError, requireUser } from '$lib/server/api';
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
				'Custom providers require a name, protocol, base URL, and at least one model.'
			);
		if (parsed.data.apiKey && parsed.data.apiKey.length < 8)
			return apiError('INVALID_INPUT', 'API key looks too short.');
		const provider = `custom_${randomUUID()}`;
		await saveProviderCredential(user.id, provider, parsed.data);
		return json({ provider }, { status: 201 });
	} catch (error) {
		return handleApiError(error);
	}
};
