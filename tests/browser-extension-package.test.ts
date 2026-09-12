import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { readShippedExtensionOrigins } from '$lib/server/browser/extension-package';

const roots: string[] = [];

async function fixture(chromeManifest: string | null, firefoxManifest?: string) {
	const root = await mkdtemp(join(tmpdir(), 'mimin-extension-'));
	roots.push(root);
	await mkdir(join(root, 'static', 'extensions', 'chrome'), { recursive: true });
	if (chromeManifest !== null)
		await writeFile(join(root, 'static', 'extensions', 'chrome', 'manifest.json'), chromeManifest);
	if (firefoxManifest) {
		await mkdir(join(root, 'static', 'extensions', 'firefox'), { recursive: true });
		await writeFile(
			join(root, 'static', 'extensions', 'firefox', 'manifest.json'),
			firefoxManifest
		);
	}
	return root;
}

function manifest(matches: string[]) {
	return JSON.stringify({ content_scripts: [{ matches }] });
}

afterEach(async () => {
	await Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true })));
});

describe('readShippedExtensionOrigins', () => {
	it('strips the /* suffix so matches compare as exact origins', async () => {
		const root = await fixture(manifest(['https://mimin.example.com/*', 'http://localhost/*']));
		expect(await readShippedExtensionOrigins(root)).toEqual([
			'https://mimin.example.com',
			'http://localhost'
		]);
	});

	it('reads origins from a hosted-instance build', async () => {
		const root = await fixture(manifest(['http://203.0.113.9:3000/*']));
		expect(await readShippedExtensionOrigins(root)).toEqual(['http://203.0.113.9:3000']);
	});

	it('returns an empty list when the package was never built', async () => {
		const root = await fixture(null);
		expect(await readShippedExtensionOrigins(root)).toEqual([]);
	});

	it('returns an empty list when the manifest is not valid JSON', async () => {
		const root = await fixture('not json');
		expect(await readShippedExtensionOrigins(root)).toEqual([]);
	});

	it('returns an empty list when the manifest has no content scripts', async () => {
		const root = await fixture(JSON.stringify({ manifest_version: 3 }));
		expect(await readShippedExtensionOrigins(root)).toEqual([]);
	});

	it('reads the Chrome manifest rather than the Firefox host pattern', async () => {
		const root = await fixture(
			manifest(['http://203.0.113.9:3000/*']),
			manifest(['http://203.0.113.9/*'])
		);
		expect(await readShippedExtensionOrigins(root)).toEqual(['http://203.0.113.9:3000']);
	});
});
