import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import {
	buildExtensionArchive,
	configuredExtensionOrigins,
	extensionMatchPatterns,
	parseExtensionOrigin
} from '$lib/server/browser/extension-package';

const roots: string[] = [];

async function fixture(
	target: 'chrome' | 'firefox',
	manifest: Record<string, unknown> | null,
	extra: Record<string, string> = {}
) {
	const root = await mkdtemp(join(tmpdir(), 'mimin-extension-'));
	roots.push(root);
	const directory = join(root, 'static', 'extensions', target);
	await mkdir(directory, { recursive: true });
	if (manifest) await writeFile(join(directory, 'manifest.json'), JSON.stringify(manifest));
	for (const [name, content] of Object.entries(extra)) {
		await writeFile(join(directory, name), content);
	}
	return root;
}

function manifest(matches: string[], version = '0.4.2') {
	return { version, content_scripts: [{ matches, js: ['config.js', 'content.js'] }] };
}

/** Reads the stored (uncompressed) entries back out of an archive this module wrote. */
function readArchive(archive: Buffer) {
	const files: Record<string, string> = {};
	let offset = 0;
	while (archive.readUInt32LE(offset) === 0x04034b50) {
		const size = archive.readUInt32LE(offset + 18);
		const nameLength = archive.readUInt16LE(offset + 26);
		const extraLength = archive.readUInt16LE(offset + 28);
		const name = archive.subarray(offset + 30, offset + 30 + nameLength).toString('utf8');
		const start = offset + 30 + nameLength + extraLength;
		files[name] = archive.subarray(start, start + size).toString('utf8');
		offset = start + size;
	}
	return files;
}

afterEach(async () => {
	await Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true })));
});

describe('parseExtensionOrigin', () => {
	it('accepts exact http and https origins, including a port', () => {
		expect(parseExtensionOrigin('http://100.76.208.102:3200')).toBe('http://100.76.208.102:3200');
		expect(parseExtensionOrigin('https://mimin.example.com')).toBe('https://mimin.example.com');
	});

	it('rejects anything that is not a bare origin', () => {
		for (const value of [
			'http://100.76.208.102:3200/',
			'http://100.76.208.102:3200/settings',
			'http://100.76.208.102:3200/?a=1',
			'http://100.76.208.102:3200#x',
			'file:///tmp/x',
			'chrome-extension://abc',
			'localhost:5173',
			'',
			null
		]) {
			expect(parseExtensionOrigin(value)).toBeUndefined();
		}
	});

	it('rejects an origin the URL parser would rewrite', () => {
		expect(parseExtensionOrigin('http://EXAMPLE.com:80')).toBeUndefined();
	});
});

describe('configuredExtensionOrigins', () => {
	it('splits, trims, and dedupes MIMIN_EXTENSION_ORIGINS', () => {
		expect(
			configuredExtensionOrigins({
				MIMIN_EXTENSION_ORIGINS: ' http://a.test:3000 , https://b.test ,http://a.test:3000'
			})
		).toEqual(['http://a.test:3000', 'https://b.test']);
	});

	it('is empty when the variable is unset or holds no valid origin', () => {
		expect(configuredExtensionOrigins({})).toEqual([]);
		expect(configuredExtensionOrigins({ MIMIN_EXTENSION_ORIGINS: 'not-an-origin,' })).toEqual([]);
	});
});

describe('extensionMatchPatterns', () => {
	it('keeps the port for Chrome and drops it for Firefox', () => {
		expect(extensionMatchPatterns('chrome', ['http://100.76.208.102:3200'])).toEqual([
			'http://100.76.208.102:3200/*'
		]);
		expect(extensionMatchPatterns('firefox', ['http://100.76.208.102:3200'])).toEqual([
			'http://100.76.208.102/*'
		]);
	});

	it('dedupes patterns that collapse to the same host', () => {
		expect(extensionMatchPatterns('firefox', ['http://a.test:3000', 'http://a.test:5173'])).toEqual(
			['http://a.test/*']
		);
	});
});

describe('buildExtensionArchive', () => {
	it('bakes the requested origin into the manifest and config', async () => {
		const root = await fixture('chrome', manifest(['http://localhost:5173/*']), {
			'config.js':
				'globalThis.MIMIN_EXTENSION_CONFIG = { allowedOrigins: ["http://localhost:5173"] };',
			'content.js': '// unchanged\n'
		});

		const archive = await buildExtensionArchive({
			target: 'chrome',
			origins: ['http://100.76.208.102:3200'],
			root
		});
		const files = readArchive(archive);

		expect(JSON.parse(files['manifest.json']).content_scripts[0]).toEqual({
			matches: ['http://100.76.208.102:3200/*'],
			js: ['config.js', 'content.js']
		});
		expect(files['config.js']).toContain('"http://100.76.208.102:3200"');
		expect(files['config.js']).toContain('version: "0.4.2"');
		expect(files['config.js']).not.toContain('localhost');
		expect(files['content.js']).toBe('// unchanged\n');
	});

	it('keeps every origin it was given, so one package bridges each hostname', async () => {
		const root = await fixture('firefox', manifest([]));
		const archive = await buildExtensionArchive({
			target: 'firefox',
			origins: ['http://100.76.208.102:3200', 'http://localhost:3200'],
			root
		});
		const files = readArchive(archive);

		expect(JSON.parse(files['manifest.json']).content_scripts[0].matches).toEqual([
			'http://100.76.208.102/*',
			'http://localhost/*'
		]);
		expect(files['config.js']).toContain('"http://100.76.208.102:3200"');
		expect(files['config.js']).toContain('"http://localhost:3200"');
	});

	it('adds a config for an unpacked package that is missing one', async () => {
		const root = await fixture('firefox', manifest([]));
		const files = readArchive(
			await buildExtensionArchive({ target: 'firefox', origins: ['http://a.test'], root })
		);

		expect(files['config.js']).toContain('"http://a.test"');
	});

	it('rejects a package that was never built', async () => {
		const root = await fixture('chrome', null);
		await expect(
			buildExtensionArchive({ target: 'chrome', origins: ['http://a.test'], root })
		).rejects.toThrow(/no manifest\.json/);
	});
});
