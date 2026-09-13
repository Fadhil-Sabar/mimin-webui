import { readFile, readdir } from 'node:fs/promises';
import { basename, join } from 'node:path';

/**
 * A browser extension only injects its content script on the origins its manifest matches, and
 * `config.js` refuses to answer any other origin. Mimin is self-hosted, so the origin is not
 * knowable when the app is built: an instance reached at a LAN IP, a Tailscale name, or a domain
 * would each need its own build. Instead the settings page downloads the package from this app
 * and this module rebuilds `config.js` and `manifest.json` for the origin the browser is on, so
 * the same image works for every origin without a rebuild.
 */

export const EXTENSION_TARGETS = ['chrome', 'firefox'] as const;
export type ExtensionTarget = (typeof EXTENSION_TARGETS)[number];

/** Where `npm run extension:build` leaves the unpacked packages, relative to the app root. */
export const EXTENSION_PACKAGE_DIR = join('static', 'extensions');

export type ExtensionArchiveEntry = { name: string; data: Buffer };

export function isExtensionTarget(value: string): value is ExtensionTarget {
	return (EXTENSION_TARGETS as readonly string[]).includes(value);
}

/**
 * Accepts one exact http(s) origin and nothing else: no path, query, hash, or trailing slash.
 * `new URL()` normalizes (lowercases the host, drops a redundant `:80`), so an origin that does
 * not survive that round trip is rejected rather than silently rewritten.
 */
export function parseExtensionOrigin(value: unknown): string | undefined {
	if (typeof value !== 'string' || !value || value.length > 255) return undefined;
	try {
		const url = new URL(value);
		if (url.protocol !== 'http:' && url.protocol !== 'https:') return undefined;
		return url.origin === value ? value : undefined;
	} catch {
		return undefined;
	}
}

/**
 * Extra origins from `MIMIN_EXTENSION_ORIGINS`, for an instance reached through more than one
 * hostname (a LAN IP and a domain, for example). The origin the package is downloaded from is
 * always included, so this is optional.
 */
export function configuredExtensionOrigins(
	env: Record<string, string | undefined> = process.env
): string[] {
	return [
		...new Set(
			(env.MIMIN_EXTENSION_ORIGINS ?? '')
				.split(',')
				.map((value) => parseExtensionOrigin(value.trim()))
				.filter((origin): origin is string => Boolean(origin))
		)
	];
}

/**
 * Content-script match patterns for `origins`. A Firefox match pattern cannot carry a port, so a
 * Firefox package matches every port on the host; `content.js` still checks the exact origin of
 * every message before answering it, and the background script re-checks the sender.
 */
export function extensionMatchPatterns(target: ExtensionTarget, origins: string[]): string[] {
	return [
		...new Set(
			origins.map((origin) => {
				if (target === 'firefox') {
					const url = new URL(origin);
					return `${url.protocol}//${url.hostname}/*`;
				}
				return `${origin}/*`;
			})
		)
	];
}

export function extensionConfigSource(version: string, origins: string[]): string {
	return `globalThis.MIMIN_EXTENSION_CONFIG = Object.freeze({\n\tversion: ${JSON.stringify(version)},\n\tallowedOrigins: Object.freeze(${JSON.stringify(origins)})\n});\n`;
}

/** The two package files that encode the allowed origins, rebuilt for `origins`. */
export function extensionOriginFiles(
	target: ExtensionTarget,
	manifest: Record<string, unknown>,
	origins: string[]
): ExtensionArchiveEntry[] {
	const patched = structuredClone(manifest);
	const contentScripts = patched.content_scripts;
	if (Array.isArray(contentScripts) && contentScripts[0]) {
		contentScripts[0].matches = extensionMatchPatterns(target, origins);
	}
	return [
		{ name: 'manifest.json', data: Buffer.from(`${JSON.stringify(patched, null, 2)}\n`, 'utf8') },
		{
			name: 'config.js',
			data: Buffer.from(extensionConfigSource(String(patched.version ?? '0'), origins), 'utf8')
		}
	];
}

function crc32(buffer: Buffer): number {
	let crc = 0xffffffff;
	for (const byte of buffer) {
		crc ^= byte;
		for (let bit = 0; bit < 8; bit += 1) crc = (crc >>> 1) ^ (0xedb88320 & -(crc & 1));
	}
	return (crc ^ 0xffffffff) >>> 0;
}

/** Writes a stored (uncompressed) ZIP archive, which is all a browser extension needs. */
export function zipArchive(files: ExtensionArchiveEntry[]): Buffer {
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

/**
 * Reads the unpacked package and zips it with `origins` baked in. The unpacked directory is
 * rebuilt on every download, so a freshly built package is served without restarting the app.
 */
export async function buildExtensionArchive(options: {
	target: ExtensionTarget;
	origins: string[];
	root?: string;
}): Promise<Buffer> {
	const directory = join(options.root ?? process.cwd(), EXTENSION_PACKAGE_DIR, options.target);
	const names = (await readdir(directory)).sort();
	const entries: ExtensionArchiveEntry[] = await Promise.all(
		names.map(async (name) => ({
			name: basename(name),
			data: await readFile(join(directory, name))
		}))
	);

	const manifestEntry = entries.find((entry) => entry.name === 'manifest.json');
	if (!manifestEntry)
		throw new Error(`The ${options.target} extension package has no manifest.json.`);

	const overrides = extensionOriginFiles(
		options.target,
		JSON.parse(manifestEntry.data.toString('utf8')) as Record<string, unknown>,
		options.origins
	);
	const byName = new Map(entries.map((entry) => [entry.name, entry]));
	for (const override of overrides) byName.set(override.name, override);
	return zipArchive([...byName.values()]);
}
