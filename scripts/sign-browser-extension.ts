import { spawn } from 'node:child_process';
import { copyFile, mkdir, readFile, readdir, rm, writeFile } from 'node:fs/promises';
import { homedir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

/**
 * Signs the built Firefox package with Mozilla Add-ons so Firefox will install it permanently.
 *
 * Firefox release only runs a temporary add-on from `about:debugging` when the package is
 * unsigned; a signed package installs from a file like any store add-on and survives restarts.
 * Signing is therefore the difference between "reload it every time" and "install it once".
 *
 * The channel is `unlisted`: AMO validates, signs and returns the XPI immediately, the add-on is
 * never listed publicly, and updates are not served by Mozilla. That is the right channel for a
 * self-hosted bridge that users install from their own Mimin instance.
 *
 * Credentials come from AMO (Settings -> API keys on addons.mozilla.org) and are read from
 * `WEB_EXT_API_KEY` / `WEB_EXT_API_SECRET`, or from `~/.config/mimin/amo.json` so they stay out of
 * the repository.
 */

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const source = join(root, 'static', 'extensions', 'firefox');
const output = join(root, 'static', 'extensions');
const artifacts = join(output, 'signed');
const credentialsPath = join(homedir(), '.config', 'mimin', 'amo.json');

/** A signed XPI always carries this entry; its absence means AMO returned an unsigned artifact. */
const SIGNATURE_ENTRY = 'META-INF/cose.sig';

type Credentials = { apiKey: string; apiSecret: string };

async function readJson(path: string): Promise<Record<string, unknown> | undefined> {
	try {
		return JSON.parse(await readFile(path, 'utf8')) as Record<string, unknown>;
	} catch {
		return undefined;
	}
}

function credentialValue(
	json: Record<string, unknown> | undefined,
	...names: string[]
): string | undefined {
	for (const name of names) {
		const value = json?.[name];
		if (typeof value === 'string' && value.trim()) return value.trim();
	}
	return undefined;
}

async function readCredentials(): Promise<Credentials> {
	const json = await readJson(credentialsPath);
	const apiKey =
		process.env.WEB_EXT_API_KEY?.trim() ?? credentialValue(json, 'apiKey', 'api_key', 'key');
	const apiSecret =
		process.env.WEB_EXT_API_SECRET?.trim() ??
		credentialValue(json, 'apiSecret', 'api_secret', 'secret');

	if (!apiKey || !apiSecret)
		throw new Error(
			[
				'No Mozilla Add-ons credentials.',
				'Create them at https://addons.mozilla.org/en-US/developers/addon/api/key/ (sign in, then Generate new credentials), then either:',
				`  - write {"apiKey": "...", "apiSecret": "..."} to ${credentialsPath}, or`,
				'  - export WEB_EXT_API_KEY and WEB_EXT_API_SECRET.'
			].join('\n')
		);

	return { apiKey, apiSecret };
}

/**
 * Reads what the built package covers, so the signed artifact can declare all of it. A universal
 * package serves origins it was not built for, which is the whole point of the declaration: the
 * download route can hand the same XPI to every self-hosted instance.
 */
async function readBakedConfig(): Promise<{
	version: string;
	allowedOrigins: string[];
	universal: boolean;
	trustLocalhost: boolean;
}> {
	const manifest = await readJson(join(source, 'manifest.json'));
	if (!manifest) throw new Error(`No built package at ${source}. Run: npm run extension:build`);

	const config = await readFile(join(source, 'config.js'), 'utf8');
	const origins = config.match(/allowedOrigins: Object\.freeze\((\[[^)]*\])\)/)?.[1];
	if (!origins)
		throw new Error('config.js has no allowedOrigins list. Run: npm run extension:build');

	return {
		version: String(manifest.version ?? '0'),
		allowedOrigins: JSON.parse(origins) as string[],
		universal: /universal: true/.test(config),
		trustLocalhost: /trustLocalhost: true/.test(config)
	};
}

function run(command: string, args: string[]): Promise<void> {
	return new Promise((resolvePromise, rejectPromise) => {
		const child = spawn(command, args, { cwd: root, stdio: 'inherit' });
		child.on('error', rejectPromise);
		child.on('close', (code) =>
			code === 0
				? resolvePromise()
				: rejectPromise(new Error(`${command} ${args[0] ?? ''} exited with ${code}`))
		);
	});
}

try {
	const { version, allowedOrigins, universal, trustLocalhost } = await readBakedConfig();
	const { apiKey, apiSecret } = await readCredentials();

	// web-ext always writes its own name, and AMO re-signs whatever directory it is handed, so the
	// artifact directory starts empty and the single XPI in it is unambiguously this run's result.
	await rm(artifacts, { recursive: true, force: true });
	await mkdir(artifacts, { recursive: true });

	await run('npx', [
		'--yes',
		'web-ext@latest',
		'sign',
		'--channel=unlisted',
		`--source-dir=${source}`,
		`--artifacts-dir=${artifacts}`,
		`--api-key=${apiKey}`,
		`--api-secret=${apiSecret}`,
		'--no-input'
	]);

	const [produced] = (await readdir(artifacts)).filter((name) => name.endsWith('.xpi'));
	if (!produced) throw new Error(`web-ext sign wrote no XPI into ${artifacts}.`);

	const signed = await readFile(join(artifacts, produced));
	if (!signed.includes(SIGNATURE_ENTRY))
		throw new Error(`${produced} carries no ${SIGNATURE_ENTRY}; AMO did not sign it.`);

	const packageName = 'mimin-search-firefox.xpi';
	await writeFile(join(output, packageName), signed);
	if (produced !== packageName)
		await copyFile(join(artifacts, produced), join(artifacts, packageName));

	await writeFile(
		join(output, 'firefox-signed.json'),
		`${JSON.stringify(
			{
				version,
				allowedOrigins,
				universal,
				trustLocalhost,
				signedAt: new Date().toISOString(),
				channel: 'unlisted',
				file: packageName
			},
			null,
			2
		)}\n`
	);

	console.log(
		[
			`Signed Firefox package ${version} -> ${join('static', 'extensions', packageName)}`,
			`  built for: ${allowedOrigins.join(', ') || 'no fixed origin'}`,
			`  serves: ${
				universal
					? 'any origin the user connects in the popup, plus localhost on any port' +
						(trustLocalhost ? '' : ' (localhost needs connecting too)')
					: 'only the origins listed above'
			}`,
			`  install: open the file in Firefox (or about:addons -> Install Add-on From File)`,
			`  a signed package installs permanently; about:debugging is no longer needed`
		].join('\n')
	);
} catch (error) {
	// A missing or rejected credential is the common case here, so it should read as a message
	// rather than a stack trace.
	console.error(error instanceof Error ? error.message : error);
	process.exit(1);
}
