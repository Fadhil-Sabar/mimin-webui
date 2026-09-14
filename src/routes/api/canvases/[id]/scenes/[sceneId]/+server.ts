import { json } from '@sveltejs/kit';
import type { RequestHandler } from '@sveltejs/kit';
import { apiError, getOwnedCanvas, handleApiError, requireUser } from '$lib/server/api';
import { canvasScenePatchInput } from '$lib/server/validation';
import { updateCanvasScene, deleteCanvasScene } from '$lib/server/canvas.service';

export const PATCH: RequestHandler = async (event) => {
	try {
		const user = await requireUser(event);
		if (!user) return apiError('UNAUTHORIZED', 'Authentication required.', 401);

		const { id: canvasId, sceneId } = event.params;
		if (!canvasId || !sceneId) return apiError('SCENE_NOT_FOUND', 'Scene not found.', 404);

		const canvas = await getOwnedCanvas(canvasId, user.id);
		if (!canvas) return apiError('CANVAS_NOT_FOUND', 'Canvas not found.', 404);

		const body = await event.request.json();
		const parsed = canvasScenePatchInput.safeParse(body);
		if (!parsed.success) return apiError('INVALID_INPUT', 'Invalid scene update payload.');

		const updated = await updateCanvasScene(canvasId, sceneId, user.id, parsed.data);
		return json({ canvas: updated });
	} catch (error) {
		if (error instanceof Error && error.message === 'SCENE_NOT_FOUND') {
			return apiError('SCENE_NOT_FOUND', 'Scene not found.', 404);
		}
		return handleApiError(error);
	}
};

export const DELETE: RequestHandler = async (event) => {
	try {
		const user = await requireUser(event);
		if (!user) return apiError('UNAUTHORIZED', 'Authentication required.', 401);

		const { id: canvasId, sceneId } = event.params;
		if (!canvasId || !sceneId) return apiError('SCENE_NOT_FOUND', 'Scene not found.', 404);

		const canvas = await getOwnedCanvas(canvasId, user.id);
		if (!canvas) return apiError('CANVAS_NOT_FOUND', 'Canvas not found.', 404);

		const updated = await deleteCanvasScene(canvasId, sceneId, user.id);
		return json({ canvas: updated });
	} catch (error) {
		if (error instanceof Error && error.message === 'CANNOT_DELETE_LAST_SCENE') {
			return apiError('CANNOT_DELETE_LAST_SCENE', 'Cannot delete the only scene in a canvas.', 400);
		}
		if (error instanceof Error && error.message === 'SCENE_NOT_FOUND') {
			return apiError('SCENE_NOT_FOUND', 'Scene not found.', 404);
		}
		return handleApiError(error);
	}
};
