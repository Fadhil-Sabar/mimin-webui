import { zipSync } from 'fflate';
import { chromium, type Browser } from 'playwright';
import {
	buildMockupSrcdoc,
	VIEWPORT_SPECS,
	type CanvasAsset,
	type CanvasDetail,
	type CanvasScene
} from '$lib/canvas';

const MAX_SCENES = 30;
const MAX_HEIGHT = 12_000;
const MAX_PIXELS = 14_400_000;
const MAX_PNG_BYTES = 25 * 1024 * 1024;
const MAX_ZIP_BYTES = 100 * 1024 * 1024;
const RENDER_TIMEOUT_MS = 15_000;

export class CanvasExportError extends Error {
	constructor(
		readonly code: string,
		message: string,
		readonly status = 422
	) {
		super(message);
	}
}

export function safeExportName(name: string): string {
	return (
		name
			.normalize('NFKD')
			.replace(/[\u0300-\u036f]/g, '')
			.toLowerCase()
			.replace(/[^a-z0-9._-]+/g, '-')
			.replace(/^[-.]+|[-.]+$/g, '')
			.slice(0, 70) || 'untitled'
	);
}

export function sceneExportStem(scene: CanvasScene, index: number): string {
	return `${String(index + 1).padStart(2, '0')}-${safeExportName(scene.name)}-${scene.viewport}`;
}

export function sceneHtml(scene: CanvasScene): string {
	return buildMockupSrcdoc({
		html: scene.html,
		css: scene.css,
		js: scene.js,
		title: scene.name
	});
}

function timed<T>(promise: Promise<T>, ms: number): Promise<T> {
	let timer: ReturnType<typeof setTimeout>;
	return Promise.race([
		promise,
		new Promise<T>((_, reject) => {
			timer = setTimeout(
				() => reject(new CanvasExportError('RENDER_TIMEOUT', 'Scene rendering timed out.')),
				ms
			);
		})
	]).finally(() => clearTimeout(timer));
}

export async function renderScenePng(scene: CanvasScene, browser: Browser): Promise<Uint8Array> {
	const viewport = VIEWPORT_SPECS[scene.viewport];
	if (!viewport) throw new CanvasExportError('INVALID_VIEWPORT', 'Scene viewport is invalid.');
	const context = await browser.newContext({
		viewport: { width: viewport.width, height: viewport.height },
		deviceScaleFactor: 1,
		javaScriptEnabled: true,
		serviceWorkers: 'block'
	});
	try {
		await context.route('**/*', (route) => route.abort());
		const page = await context.newPage();
		page.setDefaultTimeout(RENDER_TIMEOUT_MS);
		await timed(page.setContent(sceneHtml(scene), { waitUntil: 'load' }), RENDER_TIMEOUT_MS);
		await timed(
			page.evaluate(() => document.fonts.ready.then(() => undefined)),
			RENDER_TIMEOUT_MS
		);
		const height = await timed(
			page.evaluate(() =>
				Math.ceil(
					Math.max(
						document.documentElement.scrollHeight,
						document.documentElement.offsetHeight,
						document.body?.scrollHeight ?? 0,
						document.body?.offsetHeight ?? 0
					)
				)
			),
			RENDER_TIMEOUT_MS
		);
		if (height > MAX_HEIGHT || height * viewport.width > MAX_PIXELS) {
			throw new CanvasExportError(
				'RENDER_TOO_LARGE',
				`Scene exceeds the export limit (${MAX_HEIGHT}px height or ${MAX_PIXELS} pixels).`
			);
		}
		const png = await timed(page.screenshot({ type: 'png', fullPage: true }), RENDER_TIMEOUT_MS);
		if (png.byteLength > MAX_PNG_BYTES) {
			throw new CanvasExportError('RENDER_TOO_LARGE', 'Rendered PNG exceeds the 25 MB limit.');
		}
		return png;
	} finally {
		await context.close().catch(() => undefined);
	}
}

export async function withExportBrowser<T>(work: (browser: Browser) => Promise<T>): Promise<T> {
	let browser: Browser;
	try {
		browser = await chromium.launch({ headless: true });
	} catch (error) {
		console.error('Canvas export Chromium launch failed:', error);
		throw new CanvasExportError(
			'RENDERER_UNAVAILABLE',
			'PNG renderer is unavailable. Install the Playwright Chromium browser and try again.',
			503
		);
	}
	try {
		return await timed(work(browser), 120_000);
	} finally {
		await browser.close().catch(() => undefined);
	}
}

function assetBytes(asset: CanvasAsset): Uint8Array {
	const dataUri = /^data:[^,]*?(;base64)?,(.*)$/s.exec(asset.content);
	if (dataUri) {
		return dataUri[1]
			? Buffer.from(dataUri[2], 'base64')
			: Buffer.from(decodeURIComponent(dataUri[2]), 'utf8');
	}
	return Buffer.from(asset.content, 'utf8');
}

function assetFilename(asset: CanvasAsset, index: number): string {
	const extension = { css: 'css', js: 'js', image: 'bin', font: 'bin', data: 'json', svg: 'svg' }[
		asset.type
	];
	const name = safeExportName(asset.name);
	return `${String(index + 1).padStart(2, '0')}-${name.includes('.') ? name : `${name}.${extension}`}`;
}

export async function buildCanvasZip(
	canvas: CanvasDetail,
	mode: 'pngs' | 'complete'
): Promise<Uint8Array> {
	if (canvas.scenes.length > MAX_SCENES) {
		throw new CanvasExportError('TOO_MANY_SCENES', `Export supports up to ${MAX_SCENES} scenes.`);
	}
	const files: Record<string, Uint8Array> = {};
	const checkSize = () => {
		const total = Object.values(files).reduce((sum, bytes) => sum + bytes.byteLength, 0);
		if (total > MAX_ZIP_BYTES) {
			throw new CanvasExportError('EXPORT_TOO_LARGE', 'Export exceeds the 100 MB limit.');
		}
	};
	const metadataScenes = canvas.scenes.map((scene, index) => ({
		id: scene.id,
		name: scene.name,
		description: scene.description ?? '',
		order: scene.order,
		viewport: scene.viewport,
		positionX: scene.positionX,
		positionY: scene.positionY,
		file: `scenes/${sceneExportStem(scene, index)}.html`,
		png: `png/${sceneExportStem(scene, index)}.png`
	}));
	if (mode === 'complete') {
		canvas.scenes.forEach((scene, index) => {
			files[metadataScenes[index].file] = Buffer.from(sceneHtml(scene), 'utf8');
		});
		const assetFiles = canvas.assets.map((asset, index) => {
			const file = `assets/${assetFilename(asset, index)}`;
			files[file] = assetBytes(asset);
			return { id: asset.id, name: asset.name, type: asset.type, file };
		});
		files['canvas.json'] = Buffer.from(
			JSON.stringify(
				{
					id: canvas.id,
					title: canvas.title,
					description: canvas.description,
					revision: canvas.revision,
					activeSceneId: canvas.activeSceneId,
					styleGuideline: canvas.styleGuideline,
					scenes: metadataScenes,
					connections: canvas.connections,
					assets: assetFiles
				},
				null,
				2
			),
			'utf8'
		);
		checkSize();
	}
	if (mode === 'pngs' && canvas.scenes.length === 0) {
		throw new CanvasExportError('NO_SCENES', 'This canvas has no scenes to export.');
	}
	if (canvas.scenes.length) {
		await withExportBrowser(async (browser) => {
			for (const [index, scene] of canvas.scenes.entries()) {
				try {
					files[metadataScenes[index].png] = await renderScenePng(scene, browser);
					checkSize();
				} catch (error) {
					if (error instanceof CanvasExportError) throw error;
					console.error('Canvas scene PNG render failed:', error);
					throw new CanvasExportError('RENDER_FAILED', `Could not render scene "${scene.name}".`);
				}
			}
		});
	}
	return zipSync(files, { level: 6 });
}
