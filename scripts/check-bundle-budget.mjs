import { readFile, readdir, stat } from 'node:fs/promises';
import { gzipSync } from 'node:zlib';
import path from 'node:path';

export const BUDGETS = Object.freeze({
	js: 4.5 * 1024 * 1024,
	css: 512 * 1024,
	total: 7 * 1024 * 1024,
	// Mermaid 11.17.2's @mermaid-js/parser is one indivisible 662096-byte
	// minified lazy chunk. Keep only measured headroom until upstream changes.
	chunkRaw: 680 * 1024,
	chunkGzip: 150 * 1024
});

/** @param {string} directory @returns {Promise<string[]>} */
async function walk(directory) {
	const entries = await readdir(directory, { withFileTypes: true });
	const files = [];
	for (const entry of entries) {
		const file = path.join(directory, entry.name);
		if (entry.isDirectory()) files.push(...(await walk(file)));
		else files.push(file);
	}
	return files;
}

/** @returns {Promise<{js: number, css: number, total: number}>} */
export async function collectAssetSizes(buildDirectory = 'build/client') {
	const files = await walk(buildDirectory);
	const sizes = { js: 0, css: 0, total: 0 };
	for (const file of files) {
		const bytes = (await stat(file)).size;
		sizes.total += bytes;
		if (file.endsWith('.js')) sizes.js += bytes;
		if (file.endsWith('.css')) sizes.css += bytes;
	}
	return sizes;
}

/** @returns {Promise<Array<{file: string, raw: number, gzip: number}>>} */
export async function collectChunkSizes(buildDirectory = 'build/client') {
	const files = await walk(buildDirectory);
	return Promise.all(
		files
			.filter((file) => file.endsWith('.js'))
			.map(async (file) => {
				const contents = await readFile(file);
				return { file, raw: contents.length, gzip: gzipSync(contents, { level: 9 }).length };
			})
	);
}

/** @typedef {{file: string, isEntry?: boolean, isDynamicEntry?: boolean, imports?: string[]}} ManifestEntry */

/** @param {Record<string, ManifestEntry>} manifest */
export function verifyMermaidLazyLoad(manifest) {
	const mermaid = manifest['node_modules/mermaid/dist/mermaid.core.mjs'];
	if (!mermaid?.isDynamicEntry || !mermaid.file) return false;
	const initial = Object.values(manifest).filter((entry) => entry.isEntry && !entry.isDynamicEntry);
	const byFile = new Map(Object.values(manifest).map((entry) => [entry.file, entry]));
	const seen = new Set();
	/** @param {string} file @returns {boolean} */
	const visit = (file) => {
		if (seen.has(file)) return false;
		seen.add(file);
		const entry = byFile.get(file);
		return Boolean(
			entry?.imports?.some((imported) => imported === mermaid.file || visit(imported))
		);
	};
	return !initial.some((entry) => visit(entry.file));
}

/** @param {{js: number, css: number, total: number, chunks?: Array<{file: string, raw: number, gzip: number}>}} sizes @param {Record<string, number>} budgets */
export function checkBundleBudget(sizes, budgets = BUDGETS) {
	/** @type {Array<['js' | 'css' | 'total', number]>} */
	const limits = [
		['js', budgets.js],
		['css', budgets.css],
		['total', budgets.total]
	];
	const failures = limits
		.filter(([kind, limit]) => sizes[kind] > limit)
		.map(
			([kind, limit]) =>
				`${kind} ${(sizes[kind] / 1024 / 1024).toFixed(2)} MiB exceeds ${(limit / 1024 / 1024).toFixed(2)} MiB`
		);
	for (const chunk of sizes.chunks ?? []) {
		if (chunk.raw > budgets.chunkRaw) {
			failures.push(`${chunk.file} raw ${chunk.raw} bytes exceeds ${budgets.chunkRaw} bytes`);
		}
		if (chunk.gzip > budgets.chunkGzip) {
			failures.push(`${chunk.file} gzip ${chunk.gzip} bytes exceeds ${budgets.chunkGzip} bytes`);
		}
	}
	return failures;
}

if (import.meta.url === `file://${process.argv[1]}`) {
	const buildDirectory = process.argv[2] ?? '.svelte-kit/output/client';
	try {
		const sizes = await collectAssetSizes(buildDirectory);
		const chunks = await collectChunkSizes(buildDirectory);
		const manifest = JSON.parse(
			await readFile(path.join(buildDirectory, '.vite/manifest.json'), 'utf8')
		);
		const failures = checkBundleBudget({ ...sizes, chunks });
		if (!verifyMermaidLazyLoad(manifest)) failures.push('Mermaid parser chunk is not lazy-loaded');
		const largest = chunks.reduce((a, b) => (b.raw > a.raw ? b : a));
		console.log(
			`Bundle sizes: JS ${(sizes.js / 1024 / 1024).toFixed(2)} MiB, CSS ${(sizes.css / 1024 / 1024).toFixed(2)} MiB, total ${(sizes.total / 1024 / 1024).toFixed(2)} MiB; largest chunk ${largest.raw} raw / ${largest.gzip} gzip`
		);
		if (failures.length) {
			console.error(`Bundle budget failed: ${failures.join('; ')}`);
			process.exitCode = 1;
		} else {
			console.log('Bundle budget passed.');
		}
	} catch (error) {
		const message = error instanceof Error ? error.message : String(error);
		console.error(`Unable to inspect ${buildDirectory}: ${message}`);
		process.exitCode = 1;
	}
}
