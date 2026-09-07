import { json } from '@sveltejs/kit';
import type { RequestHandler } from '@sveltejs/kit';
import { apiError, handleApiError, requireUser } from '$lib/server/api';
import {
	deleteUserInstructions,
	getUserInstructions,
	saveUserInstructions
} from '$lib/server/ai/user-instructions.service';
import { userInstructionsInput } from '$lib/server/validation';

export const GET: RequestHandler = async (event) => {
	try {
		const user = await requireUser(event);
		if (!user) return apiError('UNAUTHORIZED', 'Authentication required.', 401);
		return json({ instructions: (await getUserInstructions(user.id)) ?? '' });
	} catch (error) {
		return handleApiError(error);
	}
};

export const PUT: RequestHandler = async (event) => {
	try {
		const user = await requireUser(event);
		if (!user) return apiError('UNAUTHORIZED', 'Authentication required.', 401);
		const body = await event.request.json().catch(() => null);
		const parsed = userInstructionsInput.safeParse(body);
		if (!parsed.success) {
			return apiError('INVALID_INPUT', 'Instructions must be 10,000 characters or fewer.');
		}
		return json({
			instructions: (await saveUserInstructions(user.id, parsed.data.instructions)) ?? ''
		});
	} catch (error) {
		return handleApiError(error);
	}
};

export const DELETE: RequestHandler = async (event) => {
	try {
		const user = await requireUser(event);
		if (!user) return apiError('UNAUTHORIZED', 'Authentication required.', 401);
		await deleteUserInstructions(user.id);
		return json({ instructions: '' });
	} catch (error) {
		return handleApiError(error);
	}
};
