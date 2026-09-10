import { mkdir, readFile, readdir, rm, writeFile } from 'node:fs/promises';
import { basename, dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

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
	const origins = (raw ? raw.split(',') : defaultOrigins)
		.map((value) => value.trim())
		.filter(Boolean);
	const uniqueOrigins = [...new Set(origins)];
	if (!uniqueOrigins.length)
		throw new Error('MIMIN_EXTENSION_ORIGINS must contain at least one origin.');

	for (const origin of uniqueOrigins) {
		let parsed;
		try {
			parsed = new URL(origin);
		} catch {
			throw new Error(`Invalid Mimin extension origin: ${origin}`);
		}
		if (
			!['http:', 'https:'].includes(parsed.protocol) ||
			parsed.origin !== origin ||
			parsed.pathname !== '/' ||
			parsed.search ||
			parsed.hash
		) {
			throw new Error(`Mimin extension origins must be exact http(s) origins: ${origin}`);
		}
	}
	return uniqueOrigins;
}

const allowedOrigins = readAllowedOrigins();

function configSource() {
	return `globalThis.MIMIN_EXTENSION_CONFIG = Object.freeze({\n\tversion: ${JSON.stringify(version)},\n\tallowedOrigins: Object.freeze(${JSON.stringify(allowedOrigins)})\n});\n`;
}

function crc32(buffer: Buffer) {
	let crc = 0xffffffff;
	for (const byte of buffer) {
		crc ^= byte;
		for (let bit = 0; bit < 8; bit += 1) crc = (crc >>> 1) ^ (0xedb88320 & -(crc & 1));
	}
	return (crc ^ 0xffffffff) >>> 0;
}

function zipArchive(files: Array<{ name: string; data: Buffer }>) {
	const localParts: Buffer[] = [];
	const centralParts: Buffer[] = [];
	let offset = 0;

	for (const file of files) {
		const name = Buffer.from(file.name);
		const checksum = crc32(file.data);
		const local = Buffer.alloc(30);
		local.writeUInt32LE(0x04034b50, 0);
		local.writeUInt16LE(20, 4);
		local.writeUInt16LE(0, 6);
		local.writeUInt16LE(0, 8);
		local.writeUInt32LE(checksum, 14);
		local.writeUInt32LE(file.data.length, 18);
		local.writeUInt32LE(file.data.length, 22);
		local.writeUInt16LE(name.length, 26);

		localParts.push(local, name, file.data);

		const central = Buffer.alloc(46);
		central.writeUInt32LE(0x02014b50, 0);
		central.writeUInt16LE(20, 4);
		central.writeUInt16LE(20, 6);
		central.writeUInt16LE(0, 8);
		central.writeUInt16LE(0, 10);
		central.writeUInt32LE(checksum, 16);
		central.writeUInt32LE(file.data.length, 20);
		central.writeUInt32LE(file.data.length, 24);
		central.writeUInt16LE(name.length, 28);
		central.writeUInt32LE(offset, 42);
		centralParts.push(central, name);
		offset += local.length + name.length + file.data.length;
	}

	const centralDirectory = Buffer.concat(centralParts);
	const end = Buffer.alloc(22);
	end.writeUInt32LE(0x06054b50, 0);
	end.writeUInt16LE(files.length, 8);
	end.writeUInt16LE(files.length, 10);
	end.writeUInt32LE(centralDirectory.length, 12);
	end.writeUInt32LE(offset, 16);

	return Buffer.concat([...localParts, centralDirectory, end]);
}

async function buildTarget(target: 'chrome' | 'firefox') {
	const targetDirectory = join(output, target);
	await mkdir(targetDirectory, { recursive: true });

	for (const name of sharedFiles) {
		await writeFile(join(targetDirectory, name), await readFile(join(source, name)));
	}
	await writeFile(join(targetDirectory, 'config.js'), configSource());

	const manifest = JSON.parse(await readFile(join(source, `manifest.${target}.json`), 'utf8')) as {
		version: string;
		content_scripts?: Array<{ matches?: string[] }>;
	};
	manifest.version = version;
	if (manifest.content_scripts?.[0]) {
		const patterns = allowedOrigins.map((origin) => {
			if (target === 'firefox') {
				const url = new URL(origin);
				return `${url.protocol}//${url.hostname}/*`;
			}
			return `${origin}/*`;
		});
		manifest.content_scripts[0].matches = [...new Set(patterns)];
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
