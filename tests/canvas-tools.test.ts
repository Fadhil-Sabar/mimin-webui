import { describe, expect, it, vi, beforeEach } from 'vitest';
import {
	createInspectCanvasTool,
	createCreateSceneTool,
	createEditSceneTool,
	createDeleteSceneTool,
	createUpdateStyleGuidelineTool,
	createCreateConnectionTool,
	createDeleteConnectionTool,
	type CanvasEvent
} from '$lib/server/ai/tools/canvas.tool';
import type { CanvasDetail, CanvasScene, StyleGuideline } from '$lib/canvas';

const mockCanvas: CanvasDetail = {
	id: 'canvas-123',
	userId: 'user-1',
	projectId: 'project-1',
	conversationId: 'conv-1',
	title: 'Test Canvas',
	description: 'Test Canvas Description',
	styleGuideline: {
		tokens: {
			colors: {
				primary: '#2563eb',
				background: '#f8fafc',
				surface: '#ffffff',
				text: '#0f172a'
			},
			typography: {
				fontFamily: 'sans-serif'
			}
		},
		rules: ['Use semantic HTML', 'Mobile first'],
		avoidances: ['No arbitrary colors'],
		direction: 'Clean minimalist dashboard'
	},
	activeSceneId: 'scene-1',
	revision: 1,
	scenes: [
		{
			id: 'scene-1',
			canvasId: 'canvas-123',
			name: 'Main Screen',
			description: 'Home screen',
			viewport: 'desktop',
			order: 0,
			positionX: 0,
			positionY: 0,
			html: '<main><h1>Welcome</h1></main>',
			css: 'body { margin: 0; }',
			js: 'console.log("ready");',
			createdAt: new Date().toISOString(),
			updatedAt: new Date().toISOString()
		},
		{
			id: 'scene-2',
			canvasId: 'canvas-123',
			name: 'Mobile Drawer',
			description: 'Navigation drawer',
			viewport: 'mobile',
			order: 1,
			positionX: 460,
			positionY: 0,
			html: '<nav><ul><li>Link</li></ul></nav>',
			css: 'nav { display: block; }',
			js: '',
			createdAt: new Date().toISOString(),
			updatedAt: new Date().toISOString()
		}
	],
	connections: [],
	assets: [],
	createdAt: new Date().toISOString(),
	updatedAt: new Date().toISOString()
};

let currentCanvas: CanvasDetail = JSON.parse(JSON.stringify(mockCanvas));

vi.mock('$lib/server/canvas.service', () => ({
	getCanvasWithDetails: vi.fn(async (canvasId: string, userId: string) => {
		if (canvasId === currentCanvas.id && userId === currentCanvas.userId) {
			return JSON.parse(JSON.stringify(currentCanvas));
		}
		return null;
	}),
	addCanvasScene: vi.fn(async (canvasId: string, _userId: string, input: Partial<CanvasScene>) => {
		const newSceneId = 'scene-' + (currentCanvas.scenes.length + 1);
		const newScene = {
			id: newSceneId,
			canvasId,
			name: input.name ?? 'Untitled',
			description: input.description,
			viewport: input.viewport ?? 'desktop',
			order: currentCanvas.scenes.length,
			positionX: input.positionX ?? currentCanvas.scenes.length * 460,
			positionY: input.positionY ?? 0,
			html: input.html ?? '',
			css: input.css ?? '',
			js: input.js ?? '',
			createdAt: new Date().toISOString(),
			updatedAt: new Date().toISOString()
		};
		currentCanvas.scenes.push(newScene);
		currentCanvas.activeSceneId = newSceneId;
		currentCanvas.revision += 1;
		return {
			canvas: JSON.parse(JSON.stringify(currentCanvas)),
			sceneId: newSceneId
		};
	}),
	updateCanvasScene: vi.fn(
		async (_canvasId: string, sceneId: string, _userId: string, updates: Partial<CanvasScene>) => {
			const scene = currentCanvas.scenes.find((s) => s.id === sceneId);
			if (!scene) throw new Error('SCENE_NOT_FOUND');
			Object.assign(scene, updates, { updatedAt: new Date().toISOString() });
			currentCanvas.revision += 1;
			return JSON.parse(JSON.stringify(currentCanvas));
		}
	),
	deleteCanvasScene: vi.fn(async (_canvasId: string, sceneId: string) => {
		const existing = currentCanvas.scenes.find((s) => s.id === sceneId);
		if (!existing) throw new Error('SCENE_NOT_FOUND');
		if (currentCanvas.scenes.length <= 1) {
			throw new Error('CANNOT_DELETE_LAST_SCENE');
		}
		currentCanvas.scenes = currentCanvas.scenes.filter((s) => s.id !== sceneId);
		if (currentCanvas.activeSceneId === sceneId) {
			currentCanvas.activeSceneId = currentCanvas.scenes[0].id;
		}
		currentCanvas.revision += 1;
		return JSON.parse(JSON.stringify(currentCanvas));
	}),
	createCanvasConnection: vi.fn(
		async (
			_canvasId: string,
			_userId: string,
			input: { sourceSceneId: string; targetSceneId: string }
		) => {
			if (input.sourceSceneId === input.targetSceneId) throw new Error('CONNECTION_SELF_REFERENCE');
			if (
				!currentCanvas.scenes.some((scene) => scene.id === input.sourceSceneId) ||
				!currentCanvas.scenes.some((scene) => scene.id === input.targetSceneId)
			)
				throw new Error('SCENE_NOT_FOUND');
			if (
				currentCanvas.connections.some(
					(connection) =>
						connection.sourceSceneId === input.sourceSceneId &&
						connection.targetSceneId === input.targetSceneId
				)
			)
				throw new Error('CONNECTION_EXISTS');
			const connection = {
				id: `connection-${currentCanvas.connections.length + 1}`,
				canvasId: currentCanvas.id,
				...input,
				createdAt: new Date().toISOString()
			};
			currentCanvas.connections.push(connection);
			currentCanvas.revision += 1;
			return { canvas: JSON.parse(JSON.stringify(currentCanvas)), connection };
		}
	),
	deleteCanvasConnection: vi.fn(async (_canvasId: string, connectionId: string) => {
		if (!currentCanvas.connections.some((connection) => connection.id === connectionId))
			throw new Error('CONNECTION_NOT_FOUND');
		currentCanvas.connections = currentCanvas.connections.filter(
			(connection) => connection.id !== connectionId
		);
		currentCanvas.revision += 1;
		return JSON.parse(JSON.stringify(currentCanvas));
	}),
	updateCanvasGuideline: vi.fn(
		async (_canvasId: string, _userId: string, guideline: StyleGuideline) => {
			currentCanvas.styleGuideline = guideline;
			currentCanvas.revision += 1;
			return JSON.parse(JSON.stringify(currentCanvas));
		}
	)
}));

describe('Canvas Agent Tools', () => {
	beforeEach(() => {
		currentCanvas = JSON.parse(JSON.stringify(mockCanvas));
	});

	it('creates and deletes directed connections, rejecting duplicate, self, and unknown scenes', async () => {
		const context = { canvasId: mockCanvas.id, userId: mockCanvas.userId };
		const create = createCreateConnectionTool(context);
		const remove = createDeleteConnectionTool(context);
		const first = await create.execute('tool-1', {
			sourceSceneId: 'scene-1',
			targetSceneId: 'scene-2'
		});
		expect(first.details).toMatchObject({ connectionId: 'connection-1' });
		expect(currentCanvas.connections).toHaveLength(1);
		for (const input of [
			{ sourceSceneId: 'scene-1', targetSceneId: 'scene-2' },
			{ sourceSceneId: 'scene-1', targetSceneId: 'scene-1' },
			{ sourceSceneId: 'scene-1', targetSceneId: 'scene-other-canvas' }
		]) {
			expect((await create.execute('tool-2', input)).details).toHaveProperty('error');
		}
		expect(
			(await create.execute('tool-3', { sourceSceneId: 'scene-2', targetSceneId: 'scene-1' }))
				.details
		).toMatchObject({ connectionId: 'connection-2' });
		expect(currentCanvas.connections).toHaveLength(2);
		expect(
			(await remove.execute('tool-4', { connectionId: 'connection-1' })).details
		).toMatchObject({ connectionId: 'connection-1' });
		expect(currentCanvas.connections).toHaveLength(1);
	});

	it('inspect_canvas returns style guidelines and scenes list', async () => {
		const tool = createInspectCanvasTool({ userId: 'user-1', canvasId: 'canvas-123' });

		const result = (await tool.execute('call-1', { includeCode: false })) as {
			isError?: boolean;
			details: CanvasDetail;
		};
		expect(result.isError).toBeFalsy();
		expect(result.details.title).toBe('Test Canvas');
		expect(result.details.styleGuideline.rules).toContain('Use semantic HTML');
		expect(result.details.scenes).toHaveLength(2);
		expect(result.details.scenes[0].name).toBe('Main Screen');
		expect(result.details.scenes[0].html).toBeUndefined();
	});

	it('create_scene adds a scene with mobile viewport and emits event', async () => {
		const events: CanvasEvent[] = [];
		const tool = createCreateSceneTool({ userId: 'user-1', canvasId: 'canvas-123' }, (e) =>
			events.push(e)
		);

		const result = (await tool.execute('call-2', {
			name: 'Tablet Settings',
			viewport: 'tablet',
			html: '<section>Settings</section>',
			css: 'section { padding: 1rem; }'
		})) as { isError?: boolean; details: { sceneId: string; revision: number } };

		expect(result.isError).toBeFalsy();
		expect(result.details.sceneId).toBe('scene-3');
		expect(result.details.revision).toBe(2);
		expect(events).toHaveLength(1);
		expect(events[0].type).toBe('canvas.scene_created');
		if (events[0].type === 'canvas.scene_created') {
			expect(events[0].sceneId).toBe('scene-3');
		}
	});

	it('edit_scene updates scene html and emits event', async () => {
		const events: CanvasEvent[] = [];
		const tool = createEditSceneTool({ userId: 'user-1', canvasId: 'canvas-123' }, (e) =>
			events.push(e)
		);

		const result = (await tool.execute('call-3', {
			sceneId: 'scene-1',
			html: '<main><h1>Updated Title</h1></main>'
		})) as { isError?: boolean };

		expect(result.isError).toBeFalsy();
		expect(currentCanvas.scenes[0].html).toBe('<main><h1>Updated Title</h1></main>');
		expect(events[0].type).toBe('canvas.scene_updated');
	});

	it('delete_scene deletes a scene and rejects deleting the last remaining scene', async () => {
		const events: CanvasEvent[] = [];
		const tool = createDeleteSceneTool({ userId: 'user-1', canvasId: 'canvas-123' }, (e) =>
			events.push(e)
		);

		// First delete succeeds (2 scenes -> 1 scene)
		const res1 = (await tool.execute('call-4', { sceneId: 'scene-2' })) as {
			isError?: boolean;
		};
		expect(res1.isError).toBeFalsy();
		expect(currentCanvas.scenes).toHaveLength(1);
		expect(events[0].type).toBe('canvas.scene_deleted');

		// Second delete fails because only 1 remains
		const res2 = (await tool.execute('call-5', { sceneId: 'scene-1' })) as {
			isError?: boolean;
			details: { error: string };
		};
		expect(res2.isError).toBe(true);
		expect(res2.details.error).toBe('CANNOT_DELETE_LAST_SCENE');

		// Nonexistent scene fails with SCENE_NOT_FOUND
		const res3 = (await tool.execute('call-6', { sceneId: 'scene-nonexistent' })) as {
			isError?: boolean;
			details: { error: string };
		};
		expect(res3.isError).toBe(true);
		expect(res3.details.error).toBe('SCENE_NOT_FOUND');
	});

	it('update_style_guideline merges tokens and updates contract', async () => {
		const events: CanvasEvent[] = [];
		const tool = createUpdateStyleGuidelineTool({ userId: 'user-1', canvasId: 'canvas-123' }, (e) =>
			events.push(e)
		);

		const result = (await tool.execute('call-7', {
			direction: 'Playful warm aesthetics',
			rules: ['Must use rounded corners on cards'],
			tokens: {
				colors: {
					primary: '#e11d48',
					accent: '#fb7185'
				}
			}
		})) as { isError?: boolean };

		expect(result.isError).toBeFalsy();
		expect(currentCanvas.styleGuideline.direction).toBe('Playful warm aesthetics');
		expect(currentCanvas.styleGuideline.rules).toContain('Must use rounded corners on cards');
		const colors = currentCanvas.styleGuideline.tokens.colors as Record<string, string>;
		expect(colors.primary).toBe('#e11d48');
		expect(colors.background).toBe('#f8fafc'); // preserved
		expect(events[0].type).toBe('canvas.updated');
	});

	it('buildMockupSrcdoc applies restrictive CSP and escapes title metadata', async () => {
		const { buildMockupSrcdoc } = await import('$lib/canvas');
		const doc = buildMockupSrcdoc({
			title: 'Mockup <script>alert(1)</script> & "Preview"',
			html: '<div class="test">Hello</div>',
			css: '.test { color: blue; }',
			js: 'console.log("ok");'
		});

		// Escaped metadata
		expect(doc).toContain('&lt;script&gt;alert(1)&lt;/script&gt; &amp; &quot;Preview&quot;');
		expect(doc).not.toContain('<title>Mockup <script>');

		// Restrictive CSP
		expect(doc).toContain('http-equiv="Content-Security-Policy"');
		expect(doc).toContain("default-src 'none'");
		expect(doc).toContain("connect-src 'none'");
		expect(doc).toContain("frame-src 'none'");
		expect(doc).toContain("navigate-to 'none'");
		expect(doc).toContain("form-action 'none'");
		expect(doc).toContain("style-src 'unsafe-inline' data:");
		expect(doc).toContain("script-src 'unsafe-inline'");
		expect(doc).toContain('img-src data: blob:');
	});

	it('buildMockupSrcdoc reports full content height only for scene frames', async () => {
		const { buildMockupSrcdoc } = await import('$lib/canvas');
		const scene = { html: '<main>Scene</main>', css: '' };
		const frameDoc = buildMockupSrcdoc({ ...scene, reportHeight: true });
		const interactiveDoc = buildMockupSrcdoc(scene);

		expect(frameDoc).toContain('ResizeObserver(report)');
		expect(frameDoc).toContain(
			"parent.postMessage({ type: 'mimin-canvas-preview-height', height }, '*')"
		);
		expect(interactiveDoc).not.toContain('mimin-canvas-preview-height');
	});
});
