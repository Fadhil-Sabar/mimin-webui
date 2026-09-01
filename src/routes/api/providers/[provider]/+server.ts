import { json } from '@sveltejs/kit';
import type { RequestHandler } from '@sveltejs/kit';
import { apiError, handleApiError, requireUser } from '$lib/server/api';
import {
	deleteProviderCredential,
	isProviderId,
	listProviderCredentials,
	maskKey,
	saveProviderCredential
} from '$lib/server/ai/provider-settings.service';
import { providerSettingsInput } from '$lib/server/validation';

function publicProvider(provider: {
	provider: string;
	apiKey: string | null;
	baseUrl: string | null;
	fromUser: boolean;
}) {
	return {
		provider: provider.provider,
		apiKey: maskKey(provider.apiKey),
		baseUrl: provider.baseUrl,
		fromUser: provider.fromUser
	};
}

export const GET: RequestHandler = async (event) => {
	try {
		const user = await requireUser(event);
		if (!user) return apiError('UNAUTHORIZED', 'Authentication required.', 401);
		const credentials = await listProviderCredentials(user.id);
		return json({ providers: credentials.map(publicProvider) });
	} catch (error) {
		return handleApiError(error);
	}
};

export const PUT: RequestHandler = async (event) => {
	try {
		const user = await requireUser(event);
		if (!user) return apiError('UNAUTHORIZED', 'Authentication required.', 401);
		const provider = event.params.provider;
		if (!provider || !isProviderId(provider))
			return apiError('INVALID_PROVIDER', 'Unknown provider.', 404);
		const parsed = providerSettingsInput.safeParse(await event.request.json());
		if (!parsed.success) return apiError('INVALID_INPUT', 'Invalid provider settings.');
		const input = parsed.data;
		if (input.apiKey === undefined && input.baseUrl === undefined)
			return apiError('INVALID_INPUT', 'Provide an API key or base URL.');
		if (input.apiKey && input.apiKey.length < 8)
			return apiError('INVALID_INPUT', 'API key looks too short.');
		await saveProviderCredential(user.id, provider, input);
		const credential = (await listProviderCredentials(user.id)).find(
			(c) => c.provider === provider
		);
		return json({ provider: credential ? publicProvider(credential) : null });
	} catch (error) {
		return handleApiError(error);
	}
};

export const DELETE: RequestHandler = async (event) => {
	try {
		const user = await requireUser(event);
		if (!user) return apiError('UNAUTHORIZED', 'Authentication required.', 401);
		const provider = event.params.provider;
		if (!provider || !isProviderId(provider))
			return apiError('INVALID_PROVIDER', 'Unknown provider.', 404);
		await deleteProviderCredential(user.id, provider);
		return json({ ok: true });
	} catch (error) {
		return handleApiError(error);
	}
};
