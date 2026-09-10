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

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const source = join(root, 'browser-extension', 'src', 'background-core.js');
const probePage = join(root, 'browser-extension', 'probe', 'index.html');
const port = Number(process.env.PROBE_PORT ?? 8931);

/** Extract a top-level function declaration by matching braces. */
function extractFunction(code, name) {
	const start = code.indexOf(`function ${name}(`);
	if (start === -1) throw new Error(`Could not find function ${name} in ${source}`);
	let index = code.indexOf('{', start);
	let depth = 0;
	for (; index < code.length; index += 1) {
		const char = code[index];
		if (char === '{') depth += 1;
		else if (char === '}') {
			depth -= 1;
			if (depth === 0) return code.slice(start, index + 1);
		} else if (char === '"' || char === "'" || char === '`') {
			const quote = char;
			index += 1;
			while (index < code.length && code[index] !== quote) {
				if (code[index] === '\\') index += 1;
				index += 1;
			}
		}
	}
	throw new Error(`Unbalanced braces while extracting ${name}`);
}

const background = await readFile(source, 'utf8');
const injected = [
	'// Generated from browser-extension/src/background-core.js. Do not edit.',
	extractFunction(background, 'pageSnapshot'),
	'',
	extractFunction(background, 'pageDigest'),
	'',
	extractFunction(background, 'interactPage')
].join('\n');

const page = await readFile(probePage, 'utf8');

const server = createServer((request, response) => {
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
		response.end(injected);
		return;
	}
	response.writeHead(404, { 'content-type': 'text/plain' });
	response.end('not found');
});

server.listen(port, () => {
	console.log(`Probe ready: http://localhost:${port}/`);
	console.log('Every check must print PASS. Read the summary line at the bottom.');
});
