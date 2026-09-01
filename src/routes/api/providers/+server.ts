import { json } from '@sveltejs/kit';
import type { RequestHandler } from '@sveltejs/kit';
import { apiError, handleApiError, requireUser } from '$lib/server/api';
import { listProviderCredentials, maskKey } from '$lib/server/ai/provider-settings.service';

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
				fromUser: credential.fromUser
			}))
		});
	} catch (error) {
		return handleApiError(error);
	}
};
