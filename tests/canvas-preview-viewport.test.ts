import { describe, expect, it } from 'vitest';
import { getCanvasPreviewScale } from '../src/lib/client/canvas-preview-viewport';

describe('getCanvasPreviewScale', () => {
	it('fits narrow and tall available stages', () => {
		expect(getCanvasPreviewScale('desktop', 600, 900)).toBe(0.5);
		expect(getCanvasPreviewScale('desktop', 1600, 400)).toBe(0.5);
	});

	it('fits mobile while preserving the native iframe viewport', () => {
		expect(getCanvasPreviewScale('mobile', 300, 500)).toBeCloseTo(500 / 667);
	});

	it('clamps scale to native size and supports 100% mode', () => {
		expect(getCanvasPreviewScale('tablet', 1200, 1400)).toBe(1);
		expect(getCanvasPreviewScale('mobile', 100, 100, false)).toBe(1);
	});

	it('safely handles zero and invalid dimensions', () => {
		expect(getCanvasPreviewScale('desktop', 0, 400)).toBe(1);
		expect(getCanvasPreviewScale('desktop', 400, 0)).toBe(1);
		expect(getCanvasPreviewScale('desktop', Number.NaN, 400)).toBe(1);
	});
});
