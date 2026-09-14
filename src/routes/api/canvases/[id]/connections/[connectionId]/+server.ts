import { json } from '@sveltejs/kit';
import type { RequestHandler } from '@sveltejs/kit';
import { apiError, getOwnedCanvas, handleApiError, requireUser } from '$lib/server/api';
import { deleteCanvasConnection } from '$lib/server/canvas.service';

export const DELETE: RequestHandler = async (event) => {
	try {
		const user = await requireUser(event);
		if (!user) return apiError('UNAUTHORIZED', 'Authentication required.', 401);

		const canvasId = event.params.id;
		const connectionId = event.params.connectionId;
		if (!canvasId) return apiError('CANVAS_NOT_FOUND', 'Canvas not found.', 404);
		if (!connectionId) return apiError('CONNECTION_NOT_FOUND', 'Connection not found.', 404);

		const canvas = await getOwnedCanvas(canvasId, user.id);
		if (!canvas) return apiError('CANVAS_NOT_FOUND', 'Canvas not found.', 404);

		const updated = await deleteCanvasConnection(canvasId, connectionId, user.id);
		return json({ canvas: updated });
	} catch (error) {
		if (error instanceof Error && error.message === 'CONNECTION_NOT_FOUND') {
			return apiError('CONNECTION_NOT_FOUND', 'Connection not found.', 404);
		}
		return handleApiError(error);
	}
};
