import { json } from '@sveltejs/kit';
import type { RequestHandler } from '@sveltejs/kit';
import { apiError, getOwnedCanvas, handleApiError, requireUser } from '$lib/server/api';
import { canvasSceneInput } from '$lib/server/validation';
import { addCanvasScene } from '$lib/server/canvas.service';

export const POST: RequestHandler = async (event) => {
	try {
		const user = await requireUser(event);
		if (!user) return apiError('UNAUTHORIZED', 'Authentication required.', 401);

		const canvasId = event.params.id;
		if (!canvasId) return apiError('CANVAS_NOT_FOUND', 'Canvas not found.', 404);

		const canvas = await getOwnedCanvas(canvasId, user.id);
		if (!canvas) return apiError('CANVAS_NOT_FOUND', 'Canvas not found.', 404);

		const body = await event.request.json();
		const parsed = canvasSceneInput.safeParse(body);
		if (!parsed.success) return apiError('INVALID_INPUT', 'Invalid scene payload.');

		const result = await addCanvasScene(canvasId, user.id, parsed.data);
		return json(result, { status: 201 });
	} catch (error) {
		return handleApiError(error);
	}
};
