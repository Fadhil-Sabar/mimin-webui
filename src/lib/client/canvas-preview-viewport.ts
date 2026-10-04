import { VIEWPORT_SPECS, type ViewportDevice } from '$lib/canvas';

export function getCanvasPreviewScale(
	viewport: ViewportDevice,
	availableWidth: number,
	availableHeight: number,
	fit = true
): number {
	if (!fit) return 1;
	const { width, height } = VIEWPORT_SPECS[viewport];
	if (![availableWidth, availableHeight, width, height].every(Number.isFinite)) return 1;
	if (availableWidth <= 0 || availableHeight <= 0 || width <= 0 || height <= 0) return 1;
	return Math.max(0, Math.min(1, availableWidth / width, availableHeight / height));
}
