import { beforeEach, describe, expect, it, vi } from 'vitest';
import { GET as getCanvases, POST as createCanvases } from '../src/routes/api/canvases/+server';
import {
	GET as getCanvas,
	PATCH as patchCanvas,
	DELETE as deleteCanvas
} from '../src/routes/api/canvases/[id]/+server';
import { POST as addScene } from '../src/routes/api/canvases/[id]/scenes/+server';
import {
	PATCH as updateScene,
	DELETE as removeScene
} from '../src/routes/api/canvases/[id]/scenes/[sceneId]/+server';
import type { RequestEvent } from '@sveltejs/kit';
import type { CanvasScene, StyleGuideline } from '$lib/canvas';

const state = vi.hoisted(() => ({
	user: { id: 'user-1' } as { id: string } | null,
	mockSceneLookup: true,
	canvas: {
		id: '11111111-1111-4111-8111-111111111111',
		userId: 'user-1',
		projectId: null as string | null,
		conversationId: null as string | null,
		title: 'Main Canvas',
		description: 'A visual canvas workspace',
		styleGuideline: {
			tokens: { colors: { primary: '#2563eb' } },
			rules: ['Keep it responsive'],
			avoidances: ['No hardcoded colors'],
			direction: 'Clean'
		} as StyleGuideline,
		activeSceneId: '22222222-2222-4222-8222-222222222222',
		revision: 1,
		scenes: [
			{
				id: '22222222-2222-4222-8222-222222222222',
				canvasId: '11111111-1111-4111-8111-111111111111',
				name: 'Scene 1',
				viewport: 'desktop',
				order: 0,
				html: '<div>Scene 1</div>',
				css: 'div { color: red; }',
				js: '',
				createdAt: new Date().toISOString(),
				updatedAt: new Date().toISOString()
			}
		],
		assets: [],
		createdAt: new Date().toISOString(),
		updatedAt: new Date().toISOString()
	}
}));

vi.mock('$lib/server/api', () => ({
	requireUser: vi.fn(async () => state.user),
	apiError: vi.fn((code: string, message: string, status = 400) => {
		return new Response(JSON.stringify({ error: { code, message } }), {
			status,
			headers: { 'content-type': 'application/json' }
		});
	}),
	handleApiError: vi.fn((error: unknown) => {
		const message = error instanceof Error ? error.message : 'Internal error';
		return new Response(JSON.stringify({ error: { code: message, message } }), {
			status: 400,
			headers: { 'content-type': 'application/json' }
		});
	}),
	getOwnedCanvas: vi.fn(async (canvasId: string, userId: string) => {
		if (state.user && state.user.id === userId && state.canvas.id === canvasId) {
			return { id: canvasId, userId };
		}
		return null;
	})
}));

vi.mock('$lib/server/canvas.service', () => ({
	getCanvasWithDetails: vi.fn(async (id: string, userId: string) => {
		if (state.canvas.id === id && state.canvas.userId === userId) {
			return state.canvas;
		}
		return null;
	}),
	listCanvases: vi.fn(async (userId: string) => {
		if (state.user && state.user.id === userId) {
			return [
				{
					id: state.canvas.id,
					userId: state.canvas.userId,
					title: state.canvas.title,
					description: state.canvas.description,
					projectId: state.canvas.projectId,
					conversationId: state.canvas.conversationId,
					revision: state.canvas.revision,
					sceneCount: state.canvas.scenes.length,
					createdAt: state.canvas.createdAt,
					updatedAt: state.canvas.updatedAt
				}
			];
		}
		return [];
	}),
	createCanvas: vi.fn(async (userId: string, input: { title: string; description?: string }) => {
		const newCanvas = {
			...state.canvas,
			id: 'new-canvas-id',
			userId,
			title: input.title,
			description: input.description ?? ''
		};
		return newCanvas;
	}),
	updateCanvasGuideline: vi.fn(async (_id: string, _userId: string, guideline: StyleGuideline) => {
		state.canvas.styleGuideline = guideline;
		state.canvas.revision += 1;
		return state.canvas;
	}),
	addCanvasScene: vi.fn(async (id: string, _userId: string, input: Partial<CanvasScene>) => {
		const sceneId = '33333333-3333-4333-8333-333333333333';
		const sc = {
			id: sceneId,
			canvasId: id,
			name: input.name ?? 'Untitled',
			viewport: input.viewport ?? 'desktop',
			order: state.canvas.scenes.length,
			html: input.html ?? '',
			css: input.css ?? '',
			js: input.js ?? '',
			createdAt: new Date().toISOString(),
			updatedAt: new Date().toISOString()
		};
		state.canvas.scenes.push(sc);
		state.canvas.revision += 1;
		return { canvas: state.canvas, sceneId };
	}),
	updateCanvasScene: vi.fn(
		async (_id: string, sceneId: string, _userId: string, updates: Partial<CanvasScene>) => {
			const sc = state.canvas.scenes.find((s) => s.id === sceneId);
			if (!sc) throw new Error('SCENE_NOT_FOUND');
			Object.assign(sc, updates);
			state.canvas.revision += 1;
			return state.canvas;
		}
	),
	deleteCanvasScene: vi.fn(async (_id: string, sceneId: string) => {
		if (state.canvas.scenes.length <= 1) throw new Error('CANNOT_DELETE_LAST_SCENE');
		state.canvas.scenes = state.canvas.scenes.filter((s) => s.id !== sceneId);
		state.canvas.revision += 1;
		return state.canvas;
	})
}));

vi.mock('$lib/server/db/client', () => ({
	getDb: vi.fn(() => ({
		select: vi.fn(() => ({
			from: vi.fn(() => ({
				where: vi.fn(() => ({
					limit: vi.fn(async () => {
						if (state.mockSceneLookup === false) return [];
						return [{ id: state.canvas.scenes[0]?.id }];
					})
				}))
			}))
		})),
		update: vi.fn(() => ({
			set: vi.fn(() => ({
				where: vi.fn(async () => [])
			}))
		})),
		delete: vi.fn(() => ({
			where: vi.fn(() => ({
				returning: vi.fn(async () => [{ id: state.canvas.id }])
			}))
		}))
	})),
	schema: {
		canvases: {
			id: 'canvases.id',
			userId: 'canvases.userId'
		},
		canvasScenes: {
			id: 'canvas_scenes.id',
			canvasId: 'canvas_scenes.canvasId'
		}
	}
}));

function mockEvent(
	options: {
		method?: string;
		params?: Record<string, string>;
		url?: string;
		body?: unknown;
	} = {}
): RequestEvent {
	const url = new URL(options.url ?? 'http://localhost/api/canvases');
	return {
		url,
		params: options.params ?? {},
		request: {
			method: options.method ?? 'GET',
			json: async () => options.body ?? {}
		} as Request,
		locals: { user: state.user }
	} as unknown as RequestEvent;
}

describe('Canvas Routes API', () => {
	beforeEach(() => {
		state.user = { id: 'user-1' };
		state.canvas.revision = 1;
		state.canvas.scenes = [
			{
				id: '22222222-2222-4222-8222-222222222222',
				canvasId: '11111111-1111-4111-8111-111111111111',
				name: 'Initial Scene',
				viewport: 'desktop',
				order: 0,
				html: '<div>Hello</div>',
				css: 'div { color: red; }',
				js: '',
				createdAt: new Date().toISOString(),
				updatedAt: new Date().toISOString()
			}
		];
	});

	it('GET /api/canvases requires authentication', async () => {
		state.user = null;
		const res = await getCanvases(mockEvent());
		expect(res.status).toBe(401);
	});

	it('GET /api/canvases returns canvases for user', async () => {
		const res = await getCanvases(mockEvent());
		expect(res.status).toBe(200);
		const json = await res.json();
		expect(json.canvases).toHaveLength(1);
		expect(json.canvases[0].title).toBe('Main Canvas');
	});

	it('POST /api/canvases validates payload and creates canvas', async () => {
		const res = await createCanvases(
			mockEvent({
				method: 'POST',
				body: { title: 'New Mockup Project', description: 'Testing canvas creation' }
			})
		);
		expect(res.status).toBe(201);
		const json = await res.json();
		expect(json.canvas.title).toBe('New Mockup Project');
	});

	it('GET /api/canvases/[id] returns detail with scenes', async () => {
		const res = await getCanvas(
			mockEvent({
				params: { id: state.canvas.id }
			})
		);
		expect(res.status).toBe(200);
		const json = await res.json();
		expect(json.canvas.id).toBe(state.canvas.id);
		expect(json.canvas.scenes).toHaveLength(1);
	});

	it('POST /api/canvases/[id]/scenes adds a new scene to the canvas', async () => {
		const res = await addScene(
			mockEvent({
				method: 'POST',
				params: { id: state.canvas.id },
				body: {
					name: 'Mobile Checkout',
					viewport: 'mobile',
					html: '<main>Checkout</main>',
					css: 'main { font-size: 14px; }'
				}
			})
		);
		expect(res.status).toBe(201);
		const json = await res.json();
		expect(json.sceneId).toBe('33333333-3333-4333-8333-333333333333');
		expect(json.canvas.scenes).toHaveLength(2);
	});

	it('PATCH /api/canvases/[id]/scenes/[sceneId] updates a scene', async () => {
		const res = await updateScene(
			mockEvent({
				method: 'PATCH',
				params: {
					id: state.canvas.id,
					sceneId: state.canvas.scenes[0].id
				},
				body: {
					name: 'Updated Scene Name'
				}
			})
		);
		expect(res.status).toBe(200);
		const json = await res.json();
		expect(json.canvas.scenes[0].name).toBe('Updated Scene Name');
	});

	it('PATCHing only the viewport preserves scene code', async () => {
		const original = state.canvas.scenes[0];
		const code = { html: original.html, css: original.css, js: original.js };
		const res = await updateScene(
			mockEvent({
				method: 'PATCH',
				params: { id: state.canvas.id, sceneId: original.id },
				body: { viewport: 'tablet' }
			})
		);
		expect(res.status).toBe(200);
		const json = await res.json();
		expect(json.canvas.scenes[0]).toMatchObject({ viewport: 'tablet', ...code });
	});

	it('PATCH /api/canvases/[id] updates canvas and validates activeSceneId', async () => {
		const res = await patchCanvas(
			mockEvent({
				method: 'PATCH',
				params: { id: state.canvas.id },
				body: {
					title: 'Updated Canvas Title',
					activeSceneId: state.canvas.scenes[0].id
				}
			})
		);
		expect(res.status).toBe(200);
		const json = await res.json();
		expect(json.canvas.id).toBe(state.canvas.id);

		// Rejects scene that doesn't exist on this canvas
		state.mockSceneLookup = false;
		const rejectRes = await patchCanvas(
			mockEvent({
				method: 'PATCH',
				params: { id: state.canvas.id },
				body: {
					activeSceneId: '00000000-0000-0000-0000-000000000000'
				}
			})
		);
		expect(rejectRes.status).toBe(400);
		const rejectJson = await rejectRes.json();
		expect(rejectJson.error.code).toBe('SCENE_NOT_FOUND');
		state.mockSceneLookup = true;
	});

	it('POST /api/canvases maps CONVERSATION_NOT_FOUND and mismatch errors', async () => {
		// Mock create Canvases error
		const { createCanvas } = await import('../src/lib/server/canvas.service');
		vi.mocked(createCanvas).mockRejectedValueOnce(new Error('CONVERSATION_NOT_FOUND'));
		const res = await createCanvases(
			mockEvent({
				method: 'POST',
				body: { title: 'Test', conversationId: '44444444-4444-4444-8444-444444444444' }
			})
		);
		expect(res.status).toBe(404);
		const json = await res.json();
		expect(json.error.code).toBe('CONVERSATION_NOT_FOUND');
	});

	it('DELETE /api/canvases/[id]/scenes/[sceneId] blocks deleting the only scene', async () => {
		const res = await removeScene(
			mockEvent({
				method: 'DELETE',
				params: {
					id: state.canvas.id,
					sceneId: state.canvas.scenes[0].id
				}
			})
		);
		expect(res.status).toBe(400);
		const json = await res.json();
		expect(json.error.code).toBe('CANNOT_DELETE_LAST_SCENE');
	});

	it('DELETE /api/canvases/[id] deletes canvas', async () => {
		const res = await deleteCanvas(
			mockEvent({
				method: 'DELETE',
				params: { id: state.canvas.id }
			})
		);
		expect(res.status).toBe(204);
	});
});
