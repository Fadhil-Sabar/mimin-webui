import { describe, expect, it, vi, beforeEach } from 'vitest';
import { addCanvasScene, createCanvas, deleteCanvasScene } from '../src/lib/server/canvas.service';
import { SCENE_FRAME_WIDTH, SCENE_LAYOUT_GAP_X } from '../src/lib/canvas';

const dbState = vi.hoisted(() => ({
	schema: {
		canvases: {
			id: 'canvases.id',
			userId: 'canvases.userId',
			projectId: 'canvases.projectId',
			conversationId: 'canvases.conversationId',
			revision: 'canvases.revision'
		},
		canvasScenes: {
			id: 'canvas_scenes.id',
			canvasId: 'canvas_scenes.canvasId',
			order: 'canvas_scenes.order'
		},
		canvasAssets: {
			id: 'canvas_assets.id',
			canvasId: 'canvas_assets.canvasId'
		}
	},
	user: { id: '11111111-1111-4000-8000-000000000001' },
	otherUser: { id: '22222222-2222-4000-8000-000000000002' },
	projects: [
		{
			id: 'project-1',
			name: 'Project 1',
			userId: '11111111-1111-4000-8000-000000000001'
		},
		{
			id: 'project-other',
			name: 'Other Project',
			userId: '22222222-2222-4000-8000-000000000002'
		}
	],
	conversations: [
		{
			id: 'conv-1',
			userId: '11111111-1111-4000-8000-000000000001',
			projectId: 'project-1'
		},
		{
			id: 'conv-no-project',
			userId: '11111111-1111-4000-8000-000000000001',
			projectId: null
		},
		{
			id: 'conv-other',
			userId: '22222222-2222-4000-8000-000000000002',
			projectId: 'project-other'
		}
	],
	canvases: [] as Array<Record<string, unknown>>,
	scenes: [] as Array<Record<string, unknown>>
}));

vi.mock('$lib/server/api', () => ({
	getOwnedProject: vi.fn(async (projectId: string, userId: string) => {
		return dbState.projects.find((p) => p.id === projectId && p.userId === userId);
	}),
	getOwnedConversation: vi.fn(async (conversationId: string, userId: string) => {
		return dbState.conversations.find((c) => c.id === conversationId && c.userId === userId);
	})
}));

vi.mock('$lib/server/db/client', () => ({
	schema: dbState.schema,
	getDb: vi.fn(() => ({
		select: vi.fn((fields?: unknown) => {
			return {
				from: vi.fn((table?: unknown) => {
					const isCanvasTable =
						table === dbState.schema.canvases ||
						(typeof table === 'object' &&
							table !== null &&
							'id' in table &&
							(table as { id: unknown }).id === 'canvases.id');
					return {
						where: vi.fn(() => {
							return {
								orderBy: vi.fn(() => {
									return {
										limit: vi.fn(async () => []),
										then: (resolve: (val: unknown) => void) => resolve(dbState.scenes)
									};
								}),
								limit: vi.fn(async (n?: number) => {
									if (fields && typeof fields === 'object' && 'max' in fields) {
										return [{ max: dbState.scenes.length - 1 }];
									}
									// If looking up existing canvas by conversationId
									if (isCanvasTable) {
										return [];
									}
									return dbState.canvases.slice(0, n ?? 1);
								}),
								then: (resolve: (val: unknown) => void) => {
									if (isCanvasTable) {
										return resolve(dbState.canvases.slice(-1));
									}
									return resolve(dbState.scenes);
								}
							};
						}),
						orderBy: vi.fn(async () => [])
					};
				})
			};
		}),
		insert: vi.fn(() => ({
			values: vi.fn((val: Record<string, unknown>) => ({
				onConflictDoNothing: vi.fn(() => ({
					returning: vi.fn(async () => {
						const row = {
							...val,
							id: val.id ?? `id-${Date.now()}`,
							createdAt: new Date(),
							updatedAt: new Date()
						};
						dbState.canvases.push(row);
						return [row];
					})
				})),
				returning: vi.fn(async () => {
					const row = {
						...val,
						id: val.id ?? `id-${Date.now()}`,
						createdAt: new Date(),
						updatedAt: new Date()
					};
					if (val.canvasId) {
						dbState.scenes.push(row);
					} else {
						dbState.canvases.push(row);
					}
					return [row];
				})
			}))
		})),
		update: vi.fn(() => ({
			set: vi.fn((updates: Record<string, unknown>) => ({
				where: vi.fn(async () => {
					if (dbState.canvases[0]) {
						Object.assign(dbState.canvases[0], updates);
					}
					return [];
				})
			}))
		})),
		delete: vi.fn(() => ({
			where: vi.fn(() => ({
				returning: vi.fn(async () => {
					return [];
				})
			}))
		}))
	}))
}));

function canvasRow(overrides: Record<string, unknown> = {}) {
	return {
		id: 'canvas-1',
		userId: dbState.user.id,
		title: 'Test Canvas',
		description: '',
		projectId: null,
		conversationId: null,
		styleGuideline: { tokens: {}, rules: [], avoidances: [], direction: '' },
		activeSceneId: null,
		revision: 1,
		createdAt: new Date(),
		updatedAt: new Date(),
		...overrides
	};
}

function existingScene(overrides: Record<string, unknown> = {}) {
	return {
		id: 'scene-1',
		canvasId: 'canvas-1',
		name: 'Scene 1',
		description: '',
		viewport: 'mobile',
		order: 0,
		positionX: 0,
		positionY: 0,
		html: '',
		css: '',
		js: '',
		createdAt: new Date(),
		updatedAt: new Date(),
		...overrides
	};
}

describe('canvas.service correctness and security validation', () => {
	beforeEach(() => {
		dbState.canvases = [];
		dbState.scenes = [];
	});

	it('creates an empty Canvas without an automatic scene', async () => {
		const canvas = await createCanvas(dbState.user.id, { title: 'Blank Canvas' });
		expect(canvas.scenes).toEqual([]);
		expect(canvas.activeSceneId).toBeFalsy();
		expect(dbState.scenes).toHaveLength(0);
	});

	it('rejects creating a canvas with a conversation belonging to another user', async () => {
		await expect(
			createCanvas(dbState.user.id, {
				title: 'Cross-user canvas',
				conversationId: 'conv-other'
			})
		).rejects.toThrow('CONVERSATION_NOT_FOUND');
	});

	it('enforces consistent project and conversation relationship', async () => {
		dbState.projects.push({
			id: 'project-2',
			name: 'Project 2',
			userId: dbState.user.id
		});

		// 1. Matches -> succeeds
		await expect(
			createCanvas(dbState.user.id, {
				title: 'Matching project canvas',
				projectId: 'project-1',
				conversationId: 'conv-1'
			})
		).resolves.toBeDefined();

		// 2. Explicit mismatched projectId -> rejected
		await expect(
			createCanvas(dbState.user.id, {
				title: 'Mismatched canvas',
				projectId: 'project-2',
				conversationId: 'conv-1' // conv-1 belongs to project-1
			})
		).rejects.toThrow('PROJECT_CONVERSATION_MISMATCH');

		// 3. Conversation with project cannot be assigned explicit null projectId (or conversation project null vs non-null)
		await expect(
			createCanvas(dbState.user.id, {
				title: 'Null project for project conversation',
				projectId: null,
				conversationId: 'conv-1'
			})
		).rejects.toThrow('PROJECT_CONVERSATION_MISMATCH');

		// 4. Conversation without project cannot be assigned explicit projectId
		await expect(
			createCanvas(dbState.user.id, {
				title: 'Explicit project for standalone conversation',
				projectId: 'project-1',
				conversationId: 'conv-no-project'
			})
		).rejects.toThrow('PROJECT_CONVERSATION_MISMATCH');

		// 5. When projectId is omitted, it derives from conversation.projectId
		const derivedCanvas = await createCanvas(dbState.user.id, {
			title: 'Derived project canvas',
			conversationId: 'conv-1'
		});
		expect(derivedCanvas.projectId).toBe('project-1');

		// 6. When projectId is omitted and conversation has no project, canvas has null projectId
		const standaloneCanvas = await createCanvas(dbState.user.id, {
			title: 'Standalone conversation canvas',
			conversationId: 'conv-no-project'
		});
		expect(standaloneCanvas.projectId).toBeNull();
	});

	it('places a new scene automatically when no position is requested', async () => {
		dbState.canvases = [canvasRow()];
		dbState.scenes = [existingScene()];

		await addCanvasScene('canvas-1', dbState.user.id, {
			name: 'Scene 2',
			viewport: 'mobile',
			html: ''
		});

		const created = dbState.scenes.at(-1)!;
		expect(created.positionX).toBe(SCENE_FRAME_WIDTH + SCENE_LAYOUT_GAP_X);
		expect(created.positionY).toBe(0);
	});

	it('moves a requested position that would overlap an existing frame', async () => {
		dbState.canvases = [canvasRow()];
		dbState.scenes = [existingScene()];

		await addCanvasScene('canvas-1', dbState.user.id, {
			name: 'Scene 2',
			viewport: 'mobile',
			positionX: 0,
			positionY: 120,
			html: ''
		});

		const created = dbState.scenes.at(-1)!;
		expect(created.positionX).toBe(SCENE_FRAME_WIDTH + SCENE_LAYOUT_GAP_X);
		expect(created.positionY).toBe(0);
	});

	it('keeps a requested position that has room', async () => {
		dbState.canvases = [canvasRow()];
		dbState.scenes = [existingScene()];

		await addCanvasScene('canvas-1', dbState.user.id, {
			name: 'Scene 2',
			viewport: 'mobile',
			positionX: 0,
			positionY: 1600,
			html: ''
		});

		const created = dbState.scenes.at(-1)!;
		expect(created.positionX).toBe(0);
		expect(created.positionY).toBe(1600);
	});

	it('deleteCanvasScene throws SCENE_NOT_FOUND on nonexistent scene ID', async () => {
		// Populate canvas in mock
		dbState.canvases = [
			{
				id: 'canvas-1',
				userId: dbState.user.id,
				title: 'Test',
				revision: 1,
				styleGuideline: { tokens: {}, rules: [], avoidances: [], direction: '' }
			}
		];
		dbState.scenes = [
			{ id: 'scene-1', canvasId: 'canvas-1', name: 'Scene 1', order: 0 },
			{ id: 'scene-2', canvasId: 'canvas-1', name: 'Scene 2', order: 1 }
		];

		await expect(
			deleteCanvasScene('canvas-1', 'nonexistent-scene-uuid', dbState.user.id)
		).rejects.toThrow('SCENE_NOT_FOUND');
	});
});
