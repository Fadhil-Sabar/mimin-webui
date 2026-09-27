/**
 * Renders one canvas scene through the real export path and writes the PNG next to the report.
 *
 * This runs the same `renderScenePng` and Playwright browser wrapper that the export endpoint uses,
 * without building and running the whole app.
 *
 * It also proves the offline guarantee: `--proxy-server` plus a resolver that answers nothing must
 * stop a scene's own `<img>` and `fetch()` from reaching the network.
 *
 * Usage: bun scripts/render-scene-check.ts [output-directory]
 */
import { mkdir, writeFile } from 'node:fs/promises';
import { createServer } from 'node:http';
import { join } from 'node:path';
import { renderScenePng, withExportBrowser } from '../src/lib/server/canvas-export';
import type { CanvasScene } from '../src/lib/canvas';

const PROBE_PORT = 45_999;
const outputDirectory = process.argv[2] ?? join(process.cwd(), 'test-artifacts');

let outboundRequests = 0;
const probe = createServer((_request, response) => {
	outboundRequests += 1;
	response.end('this response must never be used');
});
await new Promise<void>((resolve) => probe.listen(PROBE_PORT, '127.0.0.1', () => resolve()));

const scene: CanvasScene = {
	id: 'scene-check',
	canvasId: 'canvas-check',
	name: 'Renderer Check',
	description: 'Exercises fonts, viewport units, a fixed header, and a blocked network call',
	viewport: 'desktop',
	order: 0,
	positionX: 0,
	positionY: 0,
	html: `
		<header class="bar">Fixed header</header>
		<section class="hero"><h1>Renderer check</h1><p>Body copy</p></section>
		<section class="tall"><img src="data:image/svg+xml;utf8,<svg xmlns="http://www.w3.org/2000/svg" width="60" height="60"><rect width="60" height="60" fill="%232563eb"/></svg>" alt=""></section>
		<img src="http://127.0.0.1:${PROBE_PORT}/scene-should-not-load.png" alt="blocked">
	`,
	css: `
		body { margin: 0; font-family: system-ui, sans-serif; }
		h1 { font-size: 48px; margin: 0; }
		.bar { position: fixed; inset: 0 0 auto; height: 56px; background: #111; color: #fff; }
		.hero { padding: 96px 32px 32px; min-height: 50vh; background: linear-gradient(120deg, #2563eb, #f8fafc); }
		.tall { min-height: 150vh; }
	`,
	js: `document.querySelector('.hero h1').textContent += ' (js)';
		fetch('http://127.0.0.1:${PROBE_PORT}/scene-should-not-fetch.json').catch(() => {});`,
	createdAt: '2026-01-01T00:00:00.000Z',
	updatedAt: '2026-01-01T00:00:00.000Z'
};

try {
	const png = Buffer.from(await withExportBrowser((browser) => renderScenePng(scene, browser)));
	const width = png.readUInt32BE(16);
	const height = png.readUInt32BE(20);

	await mkdir(outputDirectory, { recursive: true });
	const file = join(outputDirectory, 'renderer-check.png');
	await writeFile(file, png);

	await new Promise((resolve) => setTimeout(resolve, 500));

	console.log(`png bytes: ${png.byteLength}`);
	console.log(`png dimensions: ${width}x${height}`);
	console.log(`wrote: ${file}`);
	console.log(`outbound requests that reached the probe (must be 0): ${outboundRequests}`);

	if (png[0] !== 0x89 || png[1] !== 0x50 || png[2] !== 0x4e)
		throw new Error('Output is not a PNG.');
	if (height <= 800) throw new Error('Expected a full-page capture taller than the viewport.');
	if (outboundRequests !== 0) throw new Error('A scene reached the network during export.');
	console.log('renderer check passed');
} finally {
	probe.close();
}
