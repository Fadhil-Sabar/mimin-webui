import { json } from '@sveltejs/kit';
import type { RequestHandler } from '@sveltejs/kit';
import { apiError, handleApiError, requireUser } from '$lib/server/api';
import { getChatGptModelIds, saveChatGptModelIds } from '$lib/server/ai/provider-settings.service';

const MAX_MODELS = 100;
const MAX_ID_LENGTH = 200;

export const GET: RequestHandler = async (event) => {
	try {
		const user = await requireUser(event);
		if (!user) return apiError('UNAUTHORIZED', 'Authentication required.', 401);
		return json(
			{ modelIds: await getChatGptModelIds(user.id) },
			{ headers: { 'cache-control': 'no-store' } }
		);
	} catch (error) {
		return handleApiError(error);
	}
};

export const PUT: RequestHandler = async (event) => {
	try {
		const user = await requireUser(event);
		if (!user) return apiError('UNAUTHORIZED', 'Authentication required.', 401);
		const body: unknown = await event.request.json();
		if (!body || typeof body !== 'object' || Array.isArray(body))
			return apiError('INVALID_INPUT', 'Expected an object containing modelIds.');
		const modelIds = (body as { modelIds?: unknown }).modelIds;
		if (
			!Array.isArray(modelIds) ||
			modelIds.length > MAX_MODELS ||
			!modelIds.every(
				(id) =>
					typeof id === 'string' &&
					id.trim().length > 0 &&
					id.trim().length <= MAX_ID_LENGTH &&
					!/\s/.test(id.trim())
			)
		)
			return apiError(
				'INVALID_INPUT',
				`modelIds must contain up to ${MAX_MODELS} non-empty IDs of at most ${MAX_ID_LENGTH} characters.`
			);
		const normalized = [...new Set((modelIds as string[]).map((id) => id.trim()))];
		await saveChatGptModelIds(user.id, normalized);
		return json({ modelIds: normalized }, { headers: { 'cache-control': 'no-store' } });
	} catch (error) {
		return handleApiError(error);
	}
};
