import { readdir, stat } from 'node:fs/promises';
import path from 'node:path';

export const BUDGETS = Object.freeze({
	js: 4.5 * 1024 * 1024,
	css: 512 * 1024,
	total: 7 * 1024 * 1024
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

/** @param {{js: number, css: number, total: number}} sizes @param {Record<string, number>} budgets */
export function checkBundleBudget(sizes, budgets = BUDGETS) {
	/** @type {Array<['js' | 'css' | 'total', number]>} */
	const limits = [
		['js', budgets.js],
		['css', budgets.css],
		['total', budgets.total]
	];
	return limits
		.filter(([kind, limit]) => sizes[kind] > limit)
		.map(
			([kind, limit]) =>
				`${kind} ${(sizes[kind] / 1024 / 1024).toFixed(2)} MiB exceeds ${(limit / 1024 / 1024).toFixed(2)} MiB`
		);
}

if (import.meta.url === `file://${process.argv[1]}`) {
	const buildDirectory = process.argv[2] ?? 'build/client';
	try {
		const sizes = await collectAssetSizes(buildDirectory);
		const failures = checkBundleBudget(sizes);
		console.log(
			`Bundle sizes: JS ${(sizes.js / 1024 / 1024).toFixed(2)} MiB, CSS ${(sizes.css / 1024 / 1024).toFixed(2)} MiB, total ${(sizes.total / 1024 / 1024).toFixed(2)} MiB`
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
