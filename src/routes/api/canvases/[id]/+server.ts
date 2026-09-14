import { json } from '@sveltejs/kit';
import type { RequestHandler } from '@sveltejs/kit';
import { and, eq } from 'drizzle-orm';
import { getDb, schema } from '$lib/server/db/client';
import { apiError, getOwnedCanvas, handleApiError, requireUser } from '$lib/server/api';
import { canvasPatchInput } from '$lib/server/validation';
import { getCanvasWithDetails } from '$lib/server/canvas.service';
import type { StyleGuideline } from '$lib/canvas';

export const GET: RequestHandler = async (event) => {
	try {
		const user = await requireUser(event);
		if (!user) return apiError('UNAUTHORIZED', 'Authentication required.', 401);

		const id = event.params.id;
		if (!id) return apiError('CANVAS_NOT_FOUND', 'Canvas not found.', 404);

		const canvas = await getCanvasWithDetails(id, user.id);
		if (!canvas) return apiError('CANVAS_NOT_FOUND', 'Canvas not found.', 404);

		return json({ canvas });
	} catch (error) {
		return handleApiError(error);
	}
};

export const PATCH: RequestHandler = async (event) => {
	try {
		const user = await requireUser(event);
		if (!user) return apiError('UNAUTHORIZED', 'Authentication required.', 401);

		const id = event.params.id;
		if (!id) return apiError('CANVAS_NOT_FOUND', 'Canvas not found.', 404);

		const existing = await getOwnedCanvas(id, user.id);
		if (!existing) return apiError('CANVAS_NOT_FOUND', 'Canvas not found.', 404);

		const body = await event.request.json();
		const parsed = canvasPatchInput.safeParse(body);
		if (!parsed.success) return apiError('INVALID_INPUT', 'Invalid canvas update payload.');

		const db = getDb();

		if (parsed.data.activeSceneId !== undefined && parsed.data.activeSceneId !== null) {
			const [scene] = await db
				.select({ id: schema.canvasScenes.id })
				.from(schema.canvasScenes)
				.where(
					and(
						eq(schema.canvasScenes.id, parsed.data.activeSceneId),
						eq(schema.canvasScenes.canvasId, id)
					)
				)
				.limit(1);
			if (!scene) {
				return apiError('SCENE_NOT_FOUND', 'Active scene does not belong to this canvas.', 400);
			}
		}
		await db
			.update(schema.canvases)
			.set({
				...(parsed.data.title !== undefined ? { title: parsed.data.title } : {}),
				...(parsed.data.description !== undefined ? { description: parsed.data.description } : {}),
				...(parsed.data.activeSceneId !== undefined
					? { activeSceneId: parsed.data.activeSceneId }
					: {}),
				...(parsed.data.styleGuideline !== undefined
					? { styleGuideline: parsed.data.styleGuideline as StyleGuideline }
					: {}),
				revision: existing.revision + 1,
				updatedAt: new Date()
			})
			.where(eq(schema.canvases.id, id));

		const updated = await getCanvasWithDetails(id, user.id);
		return json({ canvas: updated });
	} catch (error) {
		return handleApiError(error);
	}
};

export const DELETE: RequestHandler = async (event) => {
	try {
		const user = await requireUser(event);
		if (!user) return apiError('UNAUTHORIZED', 'Authentication required.', 401);

		const id = event.params.id;
		if (!id) return apiError('CANVAS_NOT_FOUND', 'Canvas not found.', 404);

		const db = getDb();
		const deleted = await db
			.delete(schema.canvases)
			.where(and(eq(schema.canvases.id, id), eq(schema.canvases.userId, user.id)))
			.returning({ id: schema.canvases.id });

		if (!deleted.length) return apiError('CANVAS_NOT_FOUND', 'Canvas not found.', 404);

		return new Response(null, { status: 204 });
	} catch (error) {
		return handleApiError(error);
	}
};
