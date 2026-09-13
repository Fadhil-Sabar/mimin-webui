import { mkdir, readFile, readdir, rm, writeFile } from 'node:fs/promises';
import { basename, dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
	extensionConfigSource,
	extensionMatchPatterns,
	parseExtensionOrigin,
	zipArchive
} from '../src/lib/server/browser/extension-package';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const source = join(root, 'browser-extension', 'src');
const output = join(root, 'static', 'extensions');
/**
 * The shipped manifest is the single source of truth for the extension version.
 * Keeping a second literal here is how the two drifted apart: the build shipped
 * an older package while the manifests claimed a different release, so the popup and the app handshake
 * disagreed about what was installed.
 */
const version = await readManifestVersion();
const defaultOrigins = ['http://localhost:5173', 'http://127.0.0.1:5173'];
const sharedFiles = [
	'popup.html',
	'popup.css',
	'popup.js',
	'content.js',
	'background-core.js',
	'background.chrome.js',
	'background.firefox.js'
];

/** Read and cross-check the version declared by both shipped manifests. */
async function readManifestVersion() {
	const versions = await Promise.all(
		['chrome', 'firefox'].map(async (target) => {
			const manifest = JSON.parse(
				await readFile(join(source, `manifest.${target}.json`), 'utf8')
			) as { version?: string };
			if (!manifest.version) throw new Error(`manifest.${target}.json has no version`);
			return { target, version: manifest.version };
		})
	);
	const [first, ...rest] = versions;
	for (const entry of rest) {
		if (entry.version !== first.version)
			throw new Error(
				`Extension manifests disagree on the version: ${first.target} ${first.version} vs ${entry.target} ${entry.version}`
			);
	}
	return first.version;
}

function readAllowedOrigins() {
	const raw = process.env.MIMIN_EXTENSION_ORIGINS;
	const origins = (raw ? raw.split(',') : defaultOrigins).map((value) => value.trim());
	const uniqueOrigins = [
		...new Set(
			origins.map((origin) => {
				const parsed = parseExtensionOrigin(origin);
				if (!parsed)
					throw new Error(
						`Mimin extension origins must be exact http(s) origins without a trailing slash: ${origin}`
					);
				return parsed;
			})
		)
	];
	if (!uniqueOrigins.length)
		throw new Error('MIMIN_EXTENSION_ORIGINS must contain at least one origin.');
	return uniqueOrigins;
}

const allowedOrigins = readAllowedOrigins();

async function buildTarget(target: 'chrome' | 'firefox') {
	const targetDirectory = join(output, target);
	await mkdir(targetDirectory, { recursive: true });

	for (const name of sharedFiles) {
		await writeFile(join(targetDirectory, name), await readFile(join(source, name)));
	}
	await writeFile(
		join(targetDirectory, 'config.js'),
		extensionConfigSource(version, allowedOrigins)
	);

	const manifest = JSON.parse(await readFile(join(source, `manifest.${target}.json`), 'utf8')) as {
		version: string;
		content_scripts?: Array<{ matches?: string[] }>;
	};
	manifest.version = version;
	if (manifest.content_scripts?.[0]) {
		manifest.content_scripts[0].matches = extensionMatchPatterns(target, allowedOrigins);
	}
	await writeFile(join(targetDirectory, 'manifest.json'), `${JSON.stringify(manifest, null, 2)}\n`);

	const files = await Promise.all(
		(await readdir(targetDirectory)).sort().map(async (name) => ({
			name: basename(name),
			data: await readFile(join(targetDirectory, name))
		}))
	);
	await writeFile(join(output, `mimin-search-${target}.zip`), zipArchive(files));
}

await rm(output, { recursive: true, force: true });
await mkdir(output, { recursive: true });
await Promise.all([buildTarget('chrome'), buildTarget('firefox')]);

console.log('Built Chrome and Firefox extension packages in static/extensions.');
