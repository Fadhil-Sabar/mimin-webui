import { readFile } from 'node:fs/promises';
import { join } from 'node:path';

/**
 * The extension package is built ahead of the app and only injects its content script on the
 * origins it was built with (`MIMIN_EXTENSION_ORIGINS`). When those origins do not cover the
 * origin this instance is served from, the bridge can never answer, so the app has to be able
 * to tell that case apart from an extension that is simply not installed.
 *
 * Both browser targets embed the same allowed-origin list in `config.js`. The Chrome manifest
 * carries it verbatim, while Firefox patterns drop the port, so reading the Chrome manifest
 * keeps the comparison exact for the origin check the content script performs.
 */
export async function readShippedExtensionOrigins(root = process.cwd()): Promise<string[]> {
	try {
		const manifest = JSON.parse(
			await readFile(join(root, 'static', 'extensions', 'chrome', 'manifest.json'), 'utf8')
		) as { content_scripts?: Array<{ matches?: string[] }> };
		return (manifest.content_scripts?.[0]?.matches ?? [])
			.map((pattern) => pattern.replace(/\/\*$/, ''))
			.filter(Boolean);
	} catch {
		return [];
	}
}
