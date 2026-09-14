import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { RequestEvent } from '@sveltejs/kit';
import type { CanvasDetail, CanvasScene } from '$lib/canvas';

const state = vi.hoisted(() => {
	class MockCanvasExportError extends Error {
		constructor(
			readonly code: string,
			message: string,
			readonly status = 422
		) {
			super(message);
		}
	}
	const scene: CanvasScene = {
		id: '22222222-2222-4222-8222-222222222222',
		canvasId: '11111111-1111-4111-8111-111111111111',
		name: 'Landing Page',
		description: 'Exportable landing page',
		viewport: 'tablet',
		order: 0,
		positionX: 460,
		positionY: 360,
		html: '<main>Hello</main>',
		css: 'main { color: red; }',
		js: 'window.ready = true;',
		createdAt: '2026-01-01T00:00:00.000Z',
		updatedAt: '2026-01-01T00:00:00.000Z'
	};
	return {
		user: { id: 'user-1' } as { id: string } | null,
		canvas: {
			id: '11111111-1111-4111-8111-111111111111',
			userId: 'user-1',
			projectId: null,
			conversationId: null,
			title: 'Marketing Canvas',
			description: 'Export test canvas',
			styleGuideline: {
				tokens: { colors: { primary: '#2563eb' } },
				rules: ['Use semantic HTML'],
				avoidances: [],
				direction: 'Clean'
			},
			activeSceneId: scene.id,
			revision: 7,
			scenes: [scene],
			connections: [],
			assets: [],
			createdAt: '2026-01-01T00:00:00.000Z',
			updatedAt: '2026-01-01T00:00:00.000Z'
		} as CanvasDetail,
		getCanvasWithDetails: vi.fn(),
		buildCanvasZip: vi.fn(),
		renderScenePng: vi.fn(),
		withExportBrowser: vi.fn(),
		lastHtml: '<!doctype html><style>main { color: red; }</style><main>Hello</main>',
		MockCanvasExportError
	};
});

vi.mock('$lib/server/api', () => ({
	requireUser: vi.fn(async () => state.user),
	apiError: vi.fn(
		(code: string, message: string, status = 400) =>
			new Response(JSON.stringify({ error: { code, message } }), {
				status,
				headers: { 'content-type': 'application/json' }
			})
	),
	handleApiError: vi.fn(
		() =>
			new Response(
				JSON.stringify({ error: { code: 'INTERNAL_ERROR', message: 'Internal error' } }),
				{
					status: 500,
					headers: { 'content-type': 'application/json' }
				}
			)
	)
}));

vi.mock('$lib/server/canvas.service', () => ({
	getCanvasWithDetails: state.getCanvasWithDetails
}));

vi.mock('$lib/server/canvas-export', () => ({
	CanvasExportError: state.MockCanvasExportError,
	safeExportName: (name: string) => name.toLowerCase().replace(/\s+/g, '-'),
	sceneHtml: vi.fn(() => state.lastHtml),
	buildCanvasZip: state.buildCanvasZip,
	renderScenePng: state.renderScenePng,
	withExportBrowser: state.withExportBrowser
}));

import { GET } from '../src/routes/api/canvases/[id]/export/+server';

function mockEvent(query = ''): RequestEvent {
	return {
		params: { id: state.canvas.id },
		url: new URL(`http://localhost/api/canvases/${state.canvas.id}/export${query}`),
		locals: { user: state.user }
	} as unknown as RequestEvent;
}

async function errorBody(response: Response) {
	return (await response.json()) as { error: { code: string; message: string } };
}

describe('GET /api/canvases/[id]/export', () => {
	beforeEach(() => {
		state.user = { id: 'user-1' };
		state.canvas.revision = 7;
		state.canvas.scenes = [
			{
				...state.canvas.scenes[0],
				html: '<main>Hello</main>',
				css: 'main { color: red; }',
				js: 'window.ready = true;'
			}
		];
		state.getCanvasWithDetails.mockImplementation(async (id: string, userId: string) =>
			id === state.canvas.id && userId === 'user-1' ? state.canvas : null
		);
		state.buildCanvasZip.mockResolvedValue(new Uint8Array([80, 75, 3, 4]));
		state.renderScenePng.mockResolvedValue(new Uint8Array([137, 80, 78, 71]));
		state.withExportBrowser.mockImplementation(
			async (work: (browser: unknown) => Promise<unknown>) => work({ mocked: true })
		);
		vi.clearAllMocks();
		// clearAllMocks resets call history only; restore the implementations needed by each test.
		state.getCanvasWithDetails.mockImplementation(async (id: string, userId: string) =>
			id === state.canvas.id && userId === 'user-1' ? state.canvas : null
		);
		state.buildCanvasZip.mockResolvedValue(new Uint8Array([80, 75, 3, 4]));
		state.renderScenePng.mockResolvedValue(new Uint8Array([137, 80, 78, 71]));
		state.withExportBrowser.mockImplementation(
			async (work: (browser: unknown) => Promise<unknown>) => work({ mocked: true })
		);
	});

	it('requires authentication before loading the canvas', async () => {
		state.user = null;

		const response = await GET(
			mockEvent('?format=scene-html&sceneId=22222222-2222-4222-8222-222222222222')
		);

		expect(response.status).toBe(401);
		expect((await errorBody(response)).error.code).toBe('UNAUTHORIZED');
		expect(state.getCanvasWithDetails).not.toHaveBeenCalled();
	});

	it('does not export a canvas that is not owned by the signed-in user', async () => {
		state.getCanvasWithDetails.mockResolvedValueOnce(null);

		const response = await GET(mockEvent('?format=all-png'));

		expect(response.status).toBe(404);
		expect((await errorBody(response)).error.code).toBe('CANVAS_NOT_FOUND');
		expect(state.buildCanvasZip).not.toHaveBeenCalled();
	});

	it('exports a self-contained HTML document for a scene', async () => {
		const revision = state.canvas.revision;
		const response = await GET(
			mockEvent('?format=scene-html&sceneId=22222222-2222-4222-8222-222222222222')
		);

		expect(response.status).toBe(200);
		expect(response.headers.get('content-type')).toBe('text/html; charset=utf-8');
		expect(response.headers.get('content-disposition')).toBe(
			'attachment; filename="landing-page-tablet.html"'
		);
		expect(await response.text()).toContain('<!doctype html>');
		expect(state.renderScenePng).not.toHaveBeenCalled();
		expect(state.canvas.revision).toBe(revision);
	});

	it('renders the stored scene viewport as a PNG', async () => {
		const scene = state.canvas.scenes[0];
		const response = await GET(
			mockEvent('?format=scene-png&sceneId=22222222-2222-4222-8222-222222222222')
		);

		expect(response.status).toBe(200);
		expect(response.headers.get('content-type')).toBe('image/png');
		expect(response.headers.get('content-disposition')).toBe(
			'attachment; filename="landing-page-tablet.png"'
		);
		expect(Buffer.from(await response.arrayBuffer())).toEqual(Buffer.from([137, 80, 78, 71]));
		expect(state.renderScenePng).toHaveBeenCalledWith(scene, { mocked: true });
	});

	it('rejects a scene that is not a member of the canvas', async () => {
		const response = await GET(
			mockEvent('?format=scene-html&sceneId=33333333-3333-4333-8333-333333333333')
		);

		expect(response.status).toBe(404);
		expect((await errorBody(response)).error.code).toBe('SCENE_NOT_FOUND');
	});

	it('dispatches all-scene and complete-canvas ZIP exports', async () => {
		const pngZip = await GET(mockEvent('?format=all-png'));
		expect(pngZip.status).toBe(200);
		expect(pngZip.headers.get('content-type')).toBe('application/zip');
		expect(pngZip.headers.get('content-disposition')).toBe(
			'attachment; filename="marketing-canvas-pngs.zip"'
		);
		expect(state.buildCanvasZip).toHaveBeenNthCalledWith(1, state.canvas, 'pngs');

		const completeZip = await GET(mockEvent('?format=canvas-zip'));
		expect(completeZip.status).toBe(200);
		expect(completeZip.headers.get('content-disposition')).toBe(
			'attachment; filename="marketing-canvas-complete.zip"'
		);
		expect(state.buildCanvasZip).toHaveBeenNthCalledWith(2, state.canvas, 'complete');
	});

	it('returns a clear renderer error when PNG creation fails', async () => {
		state.renderScenePng.mockRejectedValueOnce(
			new state.MockCanvasExportError('RENDER_TIMEOUT', 'Scene rendering timed out.')
		);

		const response = await GET(
			mockEvent('?format=scene-png&sceneId=22222222-2222-4222-8222-222222222222')
		);

		expect(response.status).toBe(422);
		expect((await errorBody(response)).error).toEqual({
			code: 'RENDER_TIMEOUT',
			message: 'Scene rendering timed out.'
		});
	});

	it('rejects unsupported formats without invoking export work', async () => {
		const response = await GET(mockEvent('?format=pdf'));

		expect(response.status).toBe(400);
		expect((await errorBody(response)).error.code).toBe('INVALID_FORMAT');
		expect(state.buildCanvasZip).not.toHaveBeenCalled();
		expect(state.renderScenePng).not.toHaveBeenCalled();
	});
});
