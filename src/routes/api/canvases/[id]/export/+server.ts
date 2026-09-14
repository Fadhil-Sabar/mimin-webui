import type { RequestHandler } from '@sveltejs/kit';
import { apiError, handleApiError, requireUser } from '$lib/server/api';
import { getCanvasWithDetails } from '$lib/server/canvas.service';
import {
	buildCanvasZip,
	CanvasExportError,
	renderScenePng,
	safeExportName,
	sceneHtml,
	withExportBrowser
} from '$lib/server/canvas-export';

function download(data: Uint8Array | string, contentType: string, filename: string): Response {
	return new Response(typeof data === 'string' ? data : new Uint8Array(data), {
		headers: {
			'content-type': contentType,
			'content-disposition': `attachment; filename="${filename}"`,
			'cache-control': 'private, no-store',
			'x-content-type-options': 'nosniff'
		}
	});
}

export const GET: RequestHandler = async (event) => {
	try {
		const user = await requireUser(event);
		if (!user) return apiError('UNAUTHORIZED', 'Authentication required.', 401);
		const canvasId = event.params.id;
		if (!canvasId) return apiError('CANVAS_NOT_FOUND', 'Canvas not found.', 404);
		const canvas = await getCanvasWithDetails(canvasId, user.id);
		if (!canvas) return apiError('CANVAS_NOT_FOUND', 'Canvas not found.', 404);

		const format = event.url.searchParams.get('format');
		const filename = safeExportName(canvas.title);
		if (format === 'scene-html' || format === 'scene-png') {
			const sceneId = event.url.searchParams.get('sceneId');
			const scene = canvas.scenes.find((candidate) => candidate.id === sceneId);
			if (!scene) return apiError('SCENE_NOT_FOUND', 'Scene does not belong to this canvas.', 404);
			const stem = `${safeExportName(scene.name)}-${scene.viewport}`;
			if (format === 'scene-html') {
				return download(sceneHtml(scene), 'text/html; charset=utf-8', `${stem}.html`);
			}
			try {
				const png = await withExportBrowser((browser) => renderScenePng(scene, browser));
				return download(png, 'image/png', `${stem}.png`);
			} catch (error) {
				if (error instanceof CanvasExportError) throw error;
				console.error('Canvas PNG render failed:', error);
				throw new CanvasExportError('RENDER_FAILED', 'Could not render this scene.');
			}
		}
		if (format === 'all-png' || format === 'canvas-zip') {
			const zip = await buildCanvasZip(canvas, format === 'all-png' ? 'pngs' : 'complete');
			return download(
				zip,
				'application/zip',
				`${filename}-${format === 'all-png' ? 'pngs' : 'complete'}.zip`
			);
		}
		return apiError('INVALID_FORMAT', 'Choose a supported export format.', 400);
	} catch (error) {
		if (error instanceof CanvasExportError)
			return apiError(error.code, error.message, error.status);
		return handleApiError(error);
	}
};
