import { json } from '@sveltejs/kit';
import type { RequestHandler } from '@sveltejs/kit';
import { apiError, handleApiError, requireUser } from '$lib/server/api';
import { fetchCustomProviderModels } from '$lib/server/ai/model-discovery';
import { getProviderCredential, type CustomProviderProtocol } from '$lib/server/ai/provider-settings.service';
import { z } from 'zod';

const discoverInput = z.object({
	protocol: z.enum([
		'openai-completions',
		'openai-responses',
		'anthropic-messages',
		'google-generative-ai',
		'mistral-conversations',
		'pi-messages',
		'azure-openai-responses'
	]),
	baseUrl: z
		.string()
		.trim()
		.min(1)
		.max(500)
		.refine((value) => value.startsWith('https://') || value.startsWith('http://'), {
			message: 'Base URL must start with http:// or https://'
		}),
	apiKey: z.string().trim().max(400).optional().nullable(),
	provider: z.string().optional()
});

export const POST: RequestHandler = async (event) => {
	try {
		const user = await requireUser(event);
		if (!user) return apiError('UNAUTHORIZED', 'Authentication required.', 401);

		const parsed = discoverInput.safeParse(await event.request.json());
		if (!parsed.success) {
			return apiError('INVALID_INPUT', 'Invalid discovery parameters. Check protocol and base URL.');
		}

		let apiKey = parsed.data.apiKey?.trim() || null;
		if (!apiKey && parsed.data.provider) {
			const credential = await getProviderCredential(user.id, parsed.data.provider);
			apiKey = credential.apiKey;
		}

		const models = await fetchCustomProviderModels(
			parsed.data.protocol as CustomProviderProtocol,
			parsed.data.baseUrl,
			apiKey
		);

		return json({ models });
	} catch (error) {
		return handleApiError(error);
	}
};
