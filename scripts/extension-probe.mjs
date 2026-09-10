/**
 * Serves `browser-extension/probe/index.html` with the real injected functions.
 *
 * The probe exercises `pageSnapshot` and `interactPage` from
 * `browser-extension/src/background-core.js` against a real browser DOM, which
 * unit tests cannot do: real CSS selectors, real event dispatch, real computed
 * styles, and real layout for the visibility check.
 *
 * The functions are closed over by the extension IIFE, so they are extracted by
 * source and loaded into the page. `tests/extension-probe.test.ts` guards this
 * extraction so a rename cannot silently break the probe.
 *
 * Usage: npm run extension:probe   (then open the printed URL)
 */
import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { extractFunction } from './extract-function.mjs';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const source = join(root, 'browser-extension', 'src', 'background-core.js');
const probePage = join(root, 'browser-extension', 'probe', 'index.html');
const port = Number(process.env.PROBE_PORT ?? 8931);

/**
 * Rebuilt for every request so editing `background-core.js` only needs a reload,
 * instead of a server restart that silently kept serving the previous functions.
 */
async function injectedSource() {
	const background = await readFile(source, 'utf8');
	return [
		'// Generated from browser-extension/src/background-core.js. Do not edit.',
		extractFunction(background, 'pageSnapshot'),
		'',
		extractFunction(background, 'pageDigest'),
		'',
		extractFunction(background, 'interactPage')
	].join('\n');
}

const page = await readFile(probePage, 'utf8');

const server = createServer(async (request, response) => {
	const path = (request.url ?? '/').split('?')[0];
	if (path === '/' || path === '/index.html') {
		response.writeHead(200, { 'content-type': 'text/html; charset=utf-8' });
		response.end(page);
		return;
	}
	if (path === '/injected.js') {
		response.writeHead(200, {
			'content-type': 'text/javascript; charset=utf-8',
			'cache-control': 'no-store'
		});
		response.end(await injectedSource());
		return;
	}
	response.writeHead(404, { 'content-type': 'text/plain' });
	response.end('not found');
});

server.listen(port, () => {
	console.log(`Probe ready: http://localhost:${port}/`);
	console.log('Every check must print PASS. Read the summary line at the bottom.');
});
