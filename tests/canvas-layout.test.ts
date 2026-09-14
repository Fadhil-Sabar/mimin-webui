import { describe, expect, it } from 'vitest';
import {
	SCENE_FRAME_WIDTH,
	SCENE_LAYOUT_COLUMNS,
	SCENE_LAYOUT_GAP_X,
	findFreeScenePosition,
	getSceneFrameHeight,
	getSceneLayoutHeight,
	planSceneLayout,
	sceneFramesOverlap,
	type ScenePlacement,
	type ViewportDevice
} from '../src/lib/canvas';

function scene(
	viewport: ViewportDevice,
	positionX: number,
	positionY: number,
	frameHeight?: number
): ScenePlacement {
	return { viewport, positionX, positionY, frameHeight };
}

function expectNoOverlap(scenes: ScenePlacement[]) {
	scenes.forEach((current, index) => {
		scenes.slice(index + 1).forEach((other) => {
			expect(sceneFramesOverlap(current, other)).toBe(false);
		});
	});
}

describe('canvas frame layout', () => {
	it('sizes a frame from the viewport and the fixed frame chrome', () => {
		expect(getSceneFrameHeight('desktop')).toBe(292);
		expect(getSceneFrameHeight('tablet')).toBe(492);
		expect(getSceneFrameHeight('mobile')).toBe(626);
	});

	it('grows a frame when the mockup content is taller than the viewport', () => {
		expect(getSceneFrameHeight('mobile', 2000)).toBe(1692);
		expect(getSceneFrameHeight('mobile', 400)).toBe(626);
	});

	it('only reports an overlap when the frame boxes really intersect', () => {
		expect(sceneFramesOverlap(scene('mobile', 0, 0, 626), scene('mobile', 0, 626, 626))).toBe(
			false
		);
		expect(sceneFramesOverlap(scene('mobile', 0, 0, 626), scene('mobile', 0, 625, 626))).toBe(true);
		// A frame that grew with its content overlaps a neighbour the viewport size would have cleared.
		expect(sceneFramesOverlap(scene('mobile', 0, 0, 2000), scene('mobile', 0, 700))).toBe(true);
		expect(sceneFramesOverlap(scene('mobile', 0, 0), scene('mobile', 500, 0))).toBe(false);
	});

	it('reserves room for content taller than the viewport when nothing was measured', () => {
		expect(getSceneLayoutHeight('mobile')).toBe(1159);
		expect(getSceneLayoutHeight('mobile')).toBeGreaterThan(getSceneFrameHeight('mobile'));
		// 760px apart is what a model picks from the viewport size alone; it still overlaps.
		expect(sceneFramesOverlap(scene('mobile', 0, 0), scene('mobile', 0, 760))).toBe(true);
	});

	it('places each new scene in a slot that no earlier frame occupies', () => {
		const placed: ScenePlacement[] = [];
		for (let index = 0; index < 6; index += 1) {
			const { x, y } = findFreeScenePosition(placed, 'mobile');
			placed.push(scene('mobile', x, y));
		}
		expectNoOverlap(placed);
		// A mobile frame is taller than the old 360px pitch, so scenes fill the row before wrapping.
		expect(placed.map((item) => item.positionX)).toEqual([
			0,
			SCENE_FRAME_WIDTH + SCENE_LAYOUT_GAP_X,
			2 * (SCENE_FRAME_WIDTH + SCENE_LAYOUT_GAP_X),
			3 * (SCENE_FRAME_WIDTH + SCENE_LAYOUT_GAP_X),
			0,
			SCENE_FRAME_WIDTH + SCENE_LAYOUT_GAP_X
		]);
		expect(placed.slice(0, SCENE_LAYOUT_COLUMNS).map((item) => item.positionY)).toEqual([
			0, 0, 0, 0
		]);
		expect(placed[SCENE_LAYOUT_COLUMNS].positionY).toBe(getSceneLayoutHeight('mobile') + 64);
	});

	it('skips dragged frames that already sit in the grid', () => {
		const placed: ScenePlacement[] = [scene('mobile', 0, 0)];
		const next = findFreeScenePosition(placed, 'mobile');
		expect(next).toEqual({ x: SCENE_FRAME_WIDTH + SCENE_LAYOUT_GAP_X, y: 0 });
	});

	it('repacks every scene row-major with uniform cells', () => {
		const scenes = Array.from({ length: 5 }, (_, index) => ({
			id: `scene-${index}`,
			viewport: 'mobile' as ViewportDevice
		}));
		const positions = planSceneLayout(scenes);
		expect(positions.get('scene-0')).toEqual({ x: 0, y: 0 });
		expect(positions.get('scene-3')).toEqual({
			x: 3 * (SCENE_FRAME_WIDTH + SCENE_LAYOUT_GAP_X),
			y: 0
		});
		expect(positions.get('scene-4')).toEqual({ x: 0, y: getSceneLayoutHeight('mobile') + 64 });
	});

	it('pitches rows by the tallest measured frame', () => {
		const scenes = [
			{ id: 'a', viewport: 'mobile' as ViewportDevice, frameHeight: 1600 },
			...Array.from({ length: 4 }, (_, index) => ({
				id: `scene-${index}`,
				viewport: 'desktop' as ViewportDevice
			}))
		];
		const positions = planSceneLayout(scenes);
		// Four frames share the first row, so the fifth wraps below the tallest frame of the canvas.
		expect(positions.get('scene-3')).toEqual({ x: 0, y: 1600 + 64 });
	});
});
