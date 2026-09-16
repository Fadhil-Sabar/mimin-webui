export type ViewportDevice = 'mobile' | 'tablet' | 'desktop';

export interface StyleGuidelineTokens {
	colors?: {
		primary?: string;
		secondary?: string;
		background?: string;
		surface?: string;
		text?: string;
		muted?: string;
		border?: string;
		accent?: string;
		[key: string]: string | undefined;
	};
	typography?: {
		fontFamily?: string;
		headingFamily?: string;
		fontSizeBase?: string;
		scale?: Record<string, string>;
		lineHeightBase?: string;
		[key: string]: unknown;
	};
	spacing?: Record<string, string>;
	radii?: Record<string, string>;
	shadows?: Record<string, string>;
	[category: string]: unknown;
}

export interface StyleGuideline {
	tokens: StyleGuidelineTokens;
	rules: string[];
	avoidances: string[];
	direction: string;
}

export interface CanvasScene {
	id: string;
	canvasId: string;
	name: string;
	description?: string;
	viewport: ViewportDevice;
	order: number;
	/** Position of the scene frame in the Canvas workspace coordinate system. */
	positionX: number;
	positionY: number;
	html: string;
	css: string;
	js?: string;
	createdAt: string;
	updatedAt: string;
}

export interface CanvasConnection {
	id: string;
	canvasId: string;
	sourceSceneId: string;
	targetSceneId: string;
	createdAt: string;
}

export interface CanvasAsset {
	id: string;
	canvasId: string;
	name: string;
	type: 'css' | 'js' | 'image' | 'font' | 'data' | 'svg';
	content: string;
	createdAt: string;
	updatedAt: string;
}

export interface CanvasDetail {
	id: string;
	userId: string;
	projectId: string | null;
	conversationId: string | null;
	title: string;
	description: string;
	styleGuideline: StyleGuideline;
	activeSceneId: string | null;
	revision: number;
	scenes: CanvasScene[];
	connections: CanvasConnection[];
	assets: CanvasAsset[];
	createdAt: string;
	updatedAt: string;
}

export interface CanvasSummary {
	id: string;
	userId: string;
	projectId: string | null;
	conversationId: string | null;
	title: string;
	description: string;
	sceneCount: number;
	activeSceneId: string | null;
	revision: number;
	createdAt: string;
	updatedAt: string;
}

export const DEFAULT_STYLE_GUIDELINE: StyleGuideline = {
	tokens: {
		colors: {
			primary: '#2563eb',
			secondary: '#475569',
			background: '#f8fafc',
			surface: '#ffffff',
			text: '#0f172a',
			muted: '#64748b',
			border: '#e2e8f0',
			accent: '#3b82f6'
		},
		typography: {
			fontFamily: 'Roboto, ui-sans-serif, system-ui, -apple-system, sans-serif',
			headingFamily: 'Roboto, ui-sans-serif, system-ui, -apple-system, sans-serif',
			fontSizeBase: '16px'
		},
		spacing: {
			xs: '4px',
			sm: '8px',
			md: '16px',
			lg: '24px',
			xl: '32px'
		},
		radii: {
			none: '0px',
			sm: '4px',
			md: '8px',
			lg: '12px',
			full: '9999px'
		}
	},
	rules: [
		'Keep layouts flexible and content-driven.',
		'Use semantic HTML elements (header, nav, main, section, footer, button).',
		'All UI states (hover, focus, active, empty) should be clear and accessible.',
		'Respect mobile viewport constraints first before scaling up.'
	],
	avoidances: [
		'Do not hardcode bright unharmonized hex colors outside of the palette tokens.',
		'Do not use arbitrary fixed pixel widths that overflow mobile screens.',
		'Avoid deep nested unstyled divs.'
	],
	direction:
		'Modern, clean, and accessible UI mockups following high design standard and consistent token variables.'
};

export const VIEWPORT_SPECS: Record<
	ViewportDevice,
	{ width: number; height: number; label: string }
> = {
	mobile: { width: 375, height: 667, label: 'Mobile (375x667)' },
	tablet: { width: 768, height: 1024, label: 'Tablet (768x1024)' },
	desktop: { width: 1200, height: 800, label: 'Desktop (1200x800)' }
};

/**
 * Rendered frame box in the Canvas workspace. These numbers mirror the markup and CSS of
 * `SceneFrameNode.svelte` (`width: 324px`, `42px` heading, `11px` preview margins, `11px`
 * footer padding, `1px` borders) and `SCENE_PREVIEW_WIDTH` mirrors `.frame-preview`'s `300px`.
 * Keep them in sync when the frame chrome changes, otherwise automatic placement overlaps.
 */
export const SCENE_FRAME_WIDTH = 324;
export const SCENE_PREVIEW_WIDTH = 300;
export const SCENE_FRAME_CHROME_HEIGHT = 92;

/** Minimum empty space between two frame boxes when the workspace lays scenes out. */
export const SCENE_LAYOUT_GAP_X = 64;
export const SCENE_LAYOUT_GAP_Y = 64;
/** Frames per row in automatic layouts. */
export const SCENE_LAYOUT_COLUMNS = 4;
/**
 * A mockup is a full screen, so its rendered content is usually taller than the viewport.
 * Placement runs on the server too, where the frame is not rendered and its height cannot be
 * measured, so reserve room for content up to this multiple of the viewport height. The
 * workspace "Auto arrange" action repacks with real measurements afterwards.
 */
export const SCENE_LAYOUT_CONTENT_BOUND = 2;

export type ScenePlacement = {
	viewport: ViewportDevice;
	positionX: number;
	positionY: number;
	/** Height of the rendered frame, measured in the workspace when available. */
	frameHeight?: number;
};

export function getScenePreviewScale(viewport: ViewportDevice): number {
	return SCENE_PREVIEW_WIDTH / VIEWPORT_SPECS[viewport].width;
}

/** Height of the frame box: scaled preview plus the fixed frame chrome. */
export function getSceneFrameHeight(viewport: ViewportDevice, contentHeight = 0): number {
	const previewHeight = Math.max(VIEWPORT_SPECS[viewport].height, contentHeight);
	return Math.round(previewHeight * getScenePreviewScale(viewport)) + SCENE_FRAME_CHROME_HEIGHT;
}

/** Frame height to reserve while laying out, using the content bound when nothing was measured. */
export function getSceneLayoutHeight(viewport: ViewportDevice, contentHeight?: number): number {
	return getSceneFrameHeight(
		viewport,
		contentHeight ?? VIEWPORT_SPECS[viewport].height * SCENE_LAYOUT_CONTENT_BOUND
	);
}

/** Layout cell big enough for the tallest frame on the canvas, so rows never overlap. */
function getSceneLayoutCell(scenes: Array<{ viewport: ViewportDevice; frameHeight?: number }>) {
	const tallest = scenes.reduce(
		(max, scene) => Math.max(max, scene.frameHeight ?? getSceneLayoutHeight(scene.viewport)),
		0
	);
	return {
		width: SCENE_FRAME_WIDTH + SCENE_LAYOUT_GAP_X,
		height: (tallest || getSceneLayoutHeight('desktop')) + SCENE_LAYOUT_GAP_Y
	};
}

export function sceneFramesOverlap(a: ScenePlacement, b: ScenePlacement): boolean {
	const aHeight = a.frameHeight ?? getSceneLayoutHeight(a.viewport);
	const bHeight = b.frameHeight ?? getSceneLayoutHeight(b.viewport);
	return (
		a.positionX < b.positionX + SCENE_FRAME_WIDTH &&
		b.positionX < a.positionX + SCENE_FRAME_WIDTH &&
		a.positionY < b.positionY + bHeight &&
		b.positionY < a.positionY + aHeight
	);
}

/** First free cell of the row-major grid that no existing frame overlaps. */
export function findFreeScenePosition(
	existing: ScenePlacement[],
	viewport: ViewportDevice
): { x: number; y: number } {
	const { width, height } = getSceneLayoutCell([
		...existing,
		{ viewport, positionX: 0, positionY: 0 }
	]);
	const candidateCount = existing.length + SCENE_LAYOUT_COLUMNS;
	let fallback = { x: 0, y: 0 };
	for (let index = 0; index < candidateCount; index += 1) {
		const candidate: ScenePlacement = {
			viewport,
			positionX: (index % SCENE_LAYOUT_COLUMNS) * width,
			positionY: Math.floor(index / SCENE_LAYOUT_COLUMNS) * height
		};
		fallback = { x: candidate.positionX, y: candidate.positionY };
		if (!existing.some((scene) => sceneFramesOverlap(scene, candidate))) {
			return fallback;
		}
	}
	return fallback;
}

/** Row-major repack of every scene, used by the workspace "Auto arrange" action. */
export function planSceneLayout(
	scenes: Array<{ id: string; viewport: ViewportDevice; frameHeight?: number }>
): Map<string, { x: number; y: number }> {
	const { width, height } = getSceneLayoutCell(scenes);
	const positions = new Map<string, { x: number; y: number }>();
	scenes.forEach((scene, index) => {
		positions.set(scene.id, {
			x: (index % SCENE_LAYOUT_COLUMNS) * width,
			y: Math.floor(index / SCENE_LAYOUT_COLUMNS) * height
		});
	});
	return positions;
}

export function escapeHtml(str: string): string {
	return str
		.replace(/&/g, '&amp;')
		.replace(/</g, '&lt;')
		.replace(/>/g, '&gt;')
		.replace(/"/g, '&quot;')
		.replace(/'/g, '&#39;');
}

export function buildMockupSrcdoc(options: {
	html: string;
	css: string;
	js?: string;
	title?: string;
	reportHeight?: boolean;
}): string {
	const scriptBlock = options.js
		? '<' +
			'script>\n    try {\n' +
			options.js +
			'\n    } catch (e) {\n      console.error("Mockup script error:", e);\n    }\n  </' +
			'script>'
		: '';

	const safeTitle = escapeHtml(options.title ?? 'Mockup Preview');
	const heightReporter = options.reportHeight
		? '<' +
			'script>\n' +
			'    (() => {\n' +
			'      const report = () => {\n' +
			'        const root = document.documentElement;\n' +
			'        const body = document.body;\n' +
			'        const height = Math.ceil(Math.max(root.scrollHeight, root.offsetHeight, body?.scrollHeight ?? 0, body?.offsetHeight ?? 0));\n' +
			"        parent.postMessage({ type: 'mimin-canvas-preview-height', height }, '*');\n" +
			'      };\n' +
			'      const observer = new ResizeObserver(report);\n' +
			'      observer.observe(document.documentElement);\n' +
			'      if (document.body) observer.observe(document.body);\n' +
			"      addEventListener('load', report);\n" +
			'      requestAnimationFrame(report);\n' +
			'    })();\n  </' +
			'script>'
		: '';
	const cspPolicy =
		"default-src 'none'; " +
		"style-src 'unsafe-inline' data:; " +
		"script-src 'unsafe-inline'; " +
		'img-src data: blob:; ' +
		'font-src data:; ' +
		"connect-src 'none'; " +
		"frame-src 'none'; " +
		"navigate-to 'none'; " +
		"form-action 'none';";

	return (
		'<!DOCTYPE html>\n<html lang="en">\n<head>\n' +
		'  <meta charset="utf-8" />\n' +
		'  <meta name="viewport" content="width=device-width, initial-scale=1.0" />\n' +
		'  <meta http-equiv="Content-Security-Policy" content="' +
		cspPolicy +
		'" />\n' +
		'  <title>' +
		safeTitle +
		'</title>\n' +
		'  <style>\n' +
		'    *, *::before, *::after { box-sizing: border-box; }\n' +
		'    body {\n' +
		'      margin: 0;\n' +
		'      padding: 0;\n' +
		"      font-family: 'Roboto', ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;\n" +
		'      -webkit-font-smoothing: antialiased;\n' +
		'      -moz-osx-font-smoothing: grayscale;\n' +
		'    }\n' +
		options.css +
		'\n  </' +
		'style>\n</' +
		'head>\n<body' +
		'>\n' +
		options.html +
		'\n' +
		scriptBlock +
		'\n' +
		heightReporter +
		'\n</' +
		'body>\n</' +
		'html>'
	);
}
