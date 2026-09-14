import { json } from '@sveltejs/kit';
import type { RequestHandler } from '@sveltejs/kit';
import { apiError, getOwnedCanvas, handleApiError, requireUser } from '$lib/server/api';
import { canvasConnectionInput } from '$lib/server/validation';
import { createCanvasConnection } from '$lib/server/canvas.service';

export const POST: RequestHandler = async (event) => {
	try {
		const user = await requireUser(event);
		if (!user) return apiError('UNAUTHORIZED', 'Authentication required.', 401);

		const canvasId = event.params.id;
		if (!canvasId) return apiError('CANVAS_NOT_FOUND', 'Canvas not found.', 404);

		const canvas = await getOwnedCanvas(canvasId, user.id);
		if (!canvas) return apiError('CANVAS_NOT_FOUND', 'Canvas not found.', 404);

		const body = await event.request.json();
		const parsed = canvasConnectionInput.safeParse(body);
		if (!parsed.success) {
			const selfReference = parsed.error.issues.some((issue) =>
				issue.message.includes('cannot connect to itself')
			);
			return apiError(
				selfReference ? 'CONNECTION_SELF_REFERENCE' : 'INVALID_INPUT',
				selfReference ? 'A scene cannot connect to itself.' : 'Invalid connection payload.'
			);
		}

		const result = await createCanvasConnection(canvasId, user.id, parsed.data);
		return json(result, { status: 201 });
	} catch (error) {
		if (error instanceof Error) {
			if (error.message === 'SCENE_NOT_FOUND') {
				return apiError('SCENE_NOT_FOUND', 'Both scenes must belong to this canvas.', 400);
			}
			if (error.message === 'CONNECTION_SELF_REFERENCE') {
				return apiError('CONNECTION_SELF_REFERENCE', 'A scene cannot connect to itself.', 400);
			}
			if (error.message === 'CONNECTION_EXISTS') {
				return apiError('CONNECTION_EXISTS', 'This navigation connection already exists.', 409);
			}
		}
		return handleApiError(error);
	}
};
