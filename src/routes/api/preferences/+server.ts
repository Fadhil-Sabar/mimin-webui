import { json } from '@sveltejs/kit';
import type { RequestHandler } from '@sveltejs/kit';
import { apiError, handleApiError, requireUser } from '$lib/server/api';
import { listAvailableModels } from '$lib/server/ai/model.service';
import {
	listModelThinkingPreferences,
	saveModelThinkingPreference
} from '$lib/server/ai/model-preferences.service';
import { modelPreferenceInput } from '$lib/server/validation';

export const GET: RequestHandler = async (event) => {
	try {
		const user = await requireUser(event);
		if (!user) return apiError('UNAUTHORIZED', 'Authentication required.', 401);
		return json({ thinkingLevels: await listModelThinkingPreferences(user.id) });
	} catch (error) {
		return handleApiError(error);
	}
};

export const PUT: RequestHandler = async (event) => {
	try {
		const user = await requireUser(event);
		if (!user) return apiError('UNAUTHORIZED', 'Authentication required.', 401);
		const parsed = modelPreferenceInput.safeParse(await event.request.json());
		if (!parsed.success) return apiError('INVALID_INPUT', 'Invalid model preference.');
		const model = (await listAvailableModels(user.id)).find(
			(item) => `${item.provider}/${item.id}` === parsed.data.model
		);
		if (!model) return apiError('MODEL_NOT_AVAILABLE', 'Selected model is not available.');
		if (!model.capabilities.thinkingLevels.includes(parsed.data.thinkingLevel))
			return apiError(
				'THINKING_LEVEL_NOT_SUPPORTED',
				'Thinking level is not supported by this model.'
			);
		const preference = await saveModelThinkingPreference(
			user.id,
			parsed.data.model,
			parsed.data.thinkingLevel
		);
		return json({ preference });
	} catch (error) {
		return handleApiError(error);
	}
};
