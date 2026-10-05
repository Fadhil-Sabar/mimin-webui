import { readFile, readdir } from 'node:fs/promises';
import { basename, join } from 'node:path';

/**
 * Mimin is self-hosted, so the origin a browser reaches it on is not knowable when the app is
 * built. This module handles both halves of that:
 *
 * - the settings page downloads the package from this app, and this module rebuilds `config.js`
 *   and `manifest.json` for the origin the browser is on, so a temporary build works anywhere;
 * - the package itself is `universal`: its manifest covers localhost on any port, `config.js`
 *   trusts localhost as a whole, and any other address is trusted through the popup, which grants
 *   the host permission and registers the content script at runtime. One signed artifact therefore
 *   serves every self-hosted instance, and a self-hoster never has to sign anything.
 */

export const EXTENSION_TARGETS = ['chrome', 'firefox'] as const;
export type ExtensionTarget = (typeof EXTENSION_TARGETS)[number];

/** Where `npm run extension:build` leaves the unpacked packages, relative to the app root. */
export const EXTENSION_PACKAGE_DIR = join('static', 'extensions');

/**
 * What `npm run extension:sign` leaves behind: the signed XPI and the metadata describing it.
 * Firefox release only installs signed add-ons, so this pair is what makes a permanent install
 * possible without `about:debugging`.
 */
export const SIGNED_FIREFOX_METADATA = 'firefox-signed.json';
export const SIGNED_FIREFOX_FILE = 'mimin-search-firefox.xpi';

/**
 * Baked into every package this module describes. `universal` means the package can be pointed at
 * an address it was not built for; `trustLocalhost` means localhost needs no connection step,
 * because the port a self-hosted instance listens on varies and cannot be baked in.
 */
export const UNIVERSAL_EXTENSION = true;
export const TRUST_LOCALHOST = true;

/** A signed XPI without this entry is not signed at all, whatever the metadata claims. */
const SIGNATURE_ENTRY = 'META-INF/cose.sig';

export type ExtensionArchiveEntry = { name: string; data: Buffer };

export type SignedFirefoxPackage = {
	version: string;
	allowedOrigins: string[];
	/** A universal package serves any origin, not only the ones in `allowedOrigins`. */
	universal: boolean;
	data: Buffer;
};

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
	return (
		`globalThis.MIMIN_EXTENSION_CONFIG = Object.freeze({\n` +
		`	version: ${JSON.stringify(version)},\n` +
		`	allowedOrigins: Object.freeze(${JSON.stringify(origins)}),\n` +
		`	trustLocalhost: ${TRUST_LOCALHOST},\n` +
		`	universal: ${UNIVERSAL_EXTENSION}\n` +
		`});\n`
	);
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

/**
 * Reads the signed Firefox package, or `undefined` when there is no usable one: files missing, an
 * XPI that carries no signature, or a signature older than the unpacked package it would replace.
 * A stale signature is worse than none — it would install a bridge older than the app requires —
 * so it is reported as absent and the caller falls back to the temporary package.
 */
export async function readSignedFirefoxPackage(
	root?: string
): Promise<SignedFirefoxPackage | undefined> {
	const directory = join(root ?? process.cwd(), EXTENSION_PACKAGE_DIR);
	try {
		const metadata = JSON.parse(
			await readFile(join(directory, SIGNED_FIREFOX_METADATA), 'utf8')
		) as { version?: unknown; allowedOrigins?: unknown; universal?: unknown };
		const version = typeof metadata.version === 'string' ? metadata.version : undefined;
		const allowedOrigins = Array.isArray(metadata.allowedOrigins)
			? metadata.allowedOrigins.filter((origin): origin is string => typeof origin === 'string')
			: [];
		const universal = metadata.universal === true;
		if (!version) return undefined;
		// A universal package needs no baked origins; a fixed one is useless without them.
		if (!universal && !allowedOrigins.length) return undefined;

		const built = JSON.parse(
			await readFile(join(directory, 'firefox', 'manifest.json'), 'utf8')
		) as {
			version?: unknown;
		};
		if (String(built.version ?? '') !== version) return undefined;

		const data = await readFile(join(directory, SIGNED_FIREFOX_FILE));
		if (!data.includes(SIGNATURE_ENTRY)) return undefined;
		return { version, allowedOrigins, universal, data };
	} catch {
		return undefined;
	}
}
