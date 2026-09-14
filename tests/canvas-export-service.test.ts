import { beforeEach, describe, expect, it, vi } from 'vitest';
import { unzipSync } from 'fflate';
import type { CanvasDetail, CanvasScene } from '$lib/canvas';
import type { Browser } from 'playwright';

type MockFunction = ReturnType<typeof vi.fn>;
type FakePage = {
	setDefaultTimeout: MockFunction;
	setContent: MockFunction;
	evaluate: MockFunction;
	screenshot: MockFunction;
};
type FakeContext = {
	route: MockFunction;
	newPage: MockFunction;
	close: MockFunction;
};
type FakeBrowser = {
	newContext: MockFunction;
	close: MockFunction;
};

const browserState = vi.hoisted(() => {
	const state = {
		height: 800,
		contexts: [] as Array<{
			options: unknown;
			context: FakeContext;
			page: FakePage;
		}>
	};

	const browser: FakeBrowser = {
		newContext: vi.fn(async (options: unknown): Promise<FakeContext> => {
			const page: FakePage = {
				setDefaultTimeout: vi.fn(),
				setContent: vi.fn(async () => undefined),
				evaluate: vi.fn(async () => {
					return page.evaluate.mock.calls.length === 1 ? undefined : state.height;
				}),
				screenshot: vi.fn(async () => new Uint8Array([137, 80, 78, 71]))
			};
			const context: FakeContext = {
				route: vi.fn(async () => undefined),
				newPage: vi.fn(async () => page),
				close: vi.fn(async () => undefined)
			};
			state.contexts.push({ options, context, page });
			return context;
		}),
		close: vi.fn(async () => undefined)
	};

	return {
		...state,
		browser,
		launch: vi.fn(async () => browser),
		get height() {
			return state.height;
		},
		set height(value: number) {
			state.height = value;
		}
	};
});

vi.mock('playwright', () => ({
	chromium: { launch: browserState.launch }
}));

import { buildCanvasZip, renderScenePng, CanvasExportError } from '../src/lib/server/canvas-export';

const canvasId = '11111111-1111-4111-8111-111111111111';

function scene(
	id: string,
	name: string,
	viewport: CanvasScene['viewport'],
	order: number
): CanvasScene {
	return {
		id,
		canvasId,
		name,
		description: `${name} description`,
		viewport,
		order,
		positionX: order * 460,
		positionY: order * 360,
		html: `<main>${name}</main>`,
		css: 'main { min-height: 100px; }',
		js: 'window.sceneReady = true;',
		createdAt: '2026-01-01T00:00:00.000Z',
		updatedAt: '2026-01-01T00:00:00.000Z'
	};
}

function canvasDetail(): CanvasDetail {
	return {
		id: canvasId,
		userId: 'user-1',
		projectId: null,
		conversationId: null,
		title: 'Export Fixture',
		description: 'A fixture canvas',
		styleGuideline: {
			tokens: { colors: { primary: '#2563eb' } },
			rules: ['Use semantic HTML'],
			avoidances: ['Avoid overflow'],
			direction: 'Clean'
		},
		activeSceneId: 'scene-mobile',
		revision: 4,
		scenes: [
			scene('scene-mobile', 'Mobile Home', 'mobile', 0),
			scene('scene-desktop', 'Desktop Home', 'desktop', 1)
		],
		connections: [
			{
				id: 'connection-1',
				canvasId,
				sourceSceneId: 'scene-mobile',
				targetSceneId: 'scene-desktop',
				createdAt: '2026-01-01T00:00:00.000Z'
			}
		],
		assets: [
			{
				id: 'asset-1',
				canvasId,
				name: 'logo.png',
				type: 'image',
				content: 'data:image/png;base64,aGVsbG8=',
				createdAt: '2026-01-01T00:00:00.000Z',
				updatedAt: '2026-01-01T00:00:00.000Z'
			}
		],
		createdAt: '2026-01-01T00:00:00.000Z',
		updatedAt: '2026-01-01T00:00:00.000Z'
	};
}

describe('Canvas export rendering and archives', () => {
	beforeEach(() => {
		browserState.height = 800;
		browserState.contexts.length = 0;
		vi.clearAllMocks();
	});

	it.each([
		['mobile', 375, 667],
		['tablet', 768, 1024],
		['desktop', 1200, 800]
	] as const)(
		'uses the stored %s viewport and captures full page height',
		async (viewport, width, height) => {
			const currentScene = scene(`scene-${viewport}`, `${viewport} scene`, viewport, 0);
			const png = await renderScenePng(currentScene, browserState.browser as unknown as Browser);
			const context = browserState.contexts[0];

			expect(png).toEqual(new Uint8Array([137, 80, 78, 71]));
			expect(context.options).toMatchObject({
				viewport: { width, height },
				deviceScaleFactor: 1,
				javaScriptEnabled: true,
				serviceWorkers: 'block'
			});
			expect(context.page.screenshot).toHaveBeenCalledWith({ type: 'png', fullPage: true });
			expect(context.context.close).toHaveBeenCalled();
		}
	);

	it('rejects a page that exceeds the height limit and closes the browser context', async () => {
		browserState.height = 12_001;

		await expect(
			renderScenePng(
				scene('scene-tall', 'Too Tall', 'mobile', 0),
				browserState.browser as unknown as Browser
			)
		).rejects.toMatchObject({ code: 'RENDER_TOO_LARGE' });
		expect(browserState.contexts[0].context.close).toHaveBeenCalled();
	});

	it('builds an all-scene PNG ZIP with deterministic scene and device names', async () => {
		const archive = await buildCanvasZip(canvasDetail(), 'pngs');
		const files = unzipSync(archive);

		expect(Object.keys(files).sort()).toEqual([
			'png/01-mobile-home-mobile.png',
			'png/02-desktop-home-desktop.png'
		]);
		expect(files['png/01-mobile-home-mobile.png']).toEqual(new Uint8Array([137, 80, 78, 71]));
		expect(browserState.launch).toHaveBeenCalledOnce();
	});

	it('builds a complete ZIP with HTML, PNG, assets, metadata, positions, connections, and guideline', async () => {
		const archive = await buildCanvasZip(canvasDetail(), 'complete');
		const files = unzipSync(archive);
		const metadata = JSON.parse(new TextDecoder().decode(files['canvas.json'])) as {
			scenes: Array<Record<string, unknown>>;
			connections: Array<Record<string, unknown>>;
			assets: Array<Record<string, unknown>>;
			styleGuideline: { direction: string };
		};

		expect(Object.keys(files).sort()).toEqual([
			'assets/01-logo.png',
			'canvas.json',
			'png/01-mobile-home-mobile.png',
			'png/02-desktop-home-desktop.png',
			'scenes/01-mobile-home-mobile.html',
			'scenes/02-desktop-home-desktop.html'
		]);
		expect(new TextDecoder().decode(files['scenes/01-mobile-home-mobile.html'])).toContain(
			'<main>Mobile Home</main>'
		);
		expect(files['assets/01-logo.png']).toEqual(new TextEncoder().encode('hello'));
		expect(metadata.scenes).toEqual(
			expect.arrayContaining([
				expect.objectContaining({
					id: 'scene-mobile',
					order: 0,
					viewport: 'mobile',
					positionX: 0,
					positionY: 0,
					file: 'scenes/01-mobile-home-mobile.html',
					png: 'png/01-mobile-home-mobile.png'
				}),
				expect.objectContaining({
					id: 'scene-desktop',
					order: 1,
					viewport: 'desktop',
					positionX: 460,
					positionY: 360
				})
			])
		);
		expect(metadata.connections).toEqual([
			expect.objectContaining({ sourceSceneId: 'scene-mobile', targetSceneId: 'scene-desktop' })
		]);
		expect(metadata.assets).toEqual([
			expect.objectContaining({ name: 'logo.png', file: 'assets/01-logo.png' })
		]);
		expect(metadata.styleGuideline.direction).toBe('Clean');
	});

	it('surfaces renderer errors as CanvasExportError', async () => {
		browserState.browser.newContext.mockRejectedValueOnce(new Error('browser failed'));

		await expect(
			renderScenePng(
				scene('scene-failure', 'Failure', 'desktop', 0),
				browserState.browser as unknown as Browser
			)
		).rejects.toBeInstanceOf(Error);
	});

	it('exports no data for an invalid viewport', async () => {
		const invalidScene = {
			...scene('scene-invalid', 'Invalid', 'desktop', 0),
			viewport: 'watch'
		} as unknown as CanvasScene;

		await expect(
			renderScenePng(invalidScene, browserState.browser as unknown as Browser)
		).rejects.toMatchObject({ code: 'INVALID_VIEWPORT' });
		expect(browserState.browser.newContext).not.toHaveBeenCalled();
		expect(CanvasExportError).toBeDefined();
	});
});
