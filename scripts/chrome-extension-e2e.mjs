/**
 * End-to-end check of the packed Chrome extension in a real Chromium browser.
 *
 * This is the only check that exercises the Chrome-specific pieces no unit test
 * can reach: MV3 service-worker startup via `importScripts`, real content-script
 * injection on the Mimin origin, real `postMessage` delivery, real tab creation,
 * and real page reading through the injected snapshot.
 *
 * It drives the browser over the DevTools Protocol using Node's built-in
 * WebSocket, so there is no dependency to install. It needs:
 *   - the Chrome package built:  npm run extension:build
 *   - the Mimin dev server on the extension's allowed origin (default :5173)
 *   - a Chromium that allows --load-extension. Branded Google Chrome refuses
 *     ("--load-extension is not allowed in Google Chrome"), and some Chrome for
 *     Testing builds ignore it too, so candidates are tried newest first and the
 *     first one that actually starts the service worker wins. Set CHROME_PATH to
 *     force a specific binary.
 *
 * Usage: npm run extension:e2e:chrome
 */
import { spawn } from 'node:child_process';
import { existsSync } from 'node:fs';
import { mkdtemp, readdir, readFile, rm } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const extensionDir = join(root, 'static', 'extensions', 'chrome');
const builtVersion = JSON.parse(
	await readFile(join(extensionDir, 'manifest.json'), 'utf8')
).version;
const targetUrl = process.env.EXTENSION_E2E_URL ?? 'http://localhost:5173/';
const debugPort = Number(process.env.EXTENSION_E2E_PORT ?? 9333);
const scratchRoot = process.env.JCODE_SCRATCH_DIR ?? '/tmp';

/** Candidate Chromium binaries, newest build number first. */
async function findBrowsers() {
	if (process.env.CHROME_PATH) return [process.env.CHROME_PATH];
	const home = process.env.HOME ?? '';
	const found = [];
	const playwrightRoot = join(home, '.cache', 'ms-playwright');
	const puppeteerRoot = join(home, '.cache', 'puppeteer', 'chrome');
	const collect = async (parent, suffixes) => {
		if (!existsSync(parent)) return;
		for (const entry of await readdir(parent)) {
			const build = Number(entry.split('-').pop());
			for (const suffix of suffixes) {
				const path = join(parent, entry, suffix);
				if (existsSync(path)) found.push({ path, build: Number.isFinite(build) ? build : 0 });
			}
		}
	};
	await collect(playwrightRoot, [join('chrome-linux64', 'chrome'), join('chrome-linux', 'chrome')]);
	await collect(puppeteerRoot, [join('chrome-linux', 'chrome')]);
	if (!found.length)
		throw new Error(
			'No Chromium found. Install Playwright/Puppeteer Chromium or set CHROME_PATH to a Chromium build.'
		);
	return found.sort((a, b) => b.build - a.build).map((entry) => entry.path);
}

async function waitForVersion(port, timeoutMs = 15_000) {
	const deadline = Date.now() + timeoutMs;
	while (Date.now() < deadline) {
		try {
			const response = await fetch(`http://localhost:${port}/json/version`);
			if (response.ok) return await response.json();
		} catch {
			// not up yet
		}
		await new Promise((r) => setTimeout(r, 250));
	}
	throw new Error('Chromium did not expose a debugging port in time.');
}

/** Minimal DevTools Protocol client over the built-in WebSocket. */
function connectCdp(webSocketDebuggerUrl) {
	const socket = new WebSocket(webSocketDebuggerUrl);
	const pending = new Map();
	let nextId = 1;
	socket.addEventListener('message', (event) => {
		const message = JSON.parse(String(event.data));
		if (message.id === undefined) return;
		const entry = pending.get(message.id);
		if (!entry) return;
		pending.delete(message.id);
		if (message.error) entry.reject(new Error(message.error.message));
		else entry.resolve(message.result);
	});
	const ready = new Promise((open, fail) => {
		socket.addEventListener('open', () => open());
		socket.addEventListener('error', () => fail(new Error('CDP socket error')));
	});
	return {
		ready,
		send(method, params = {}, sessionId) {
			const id = nextId++;
			return new Promise((resolvePromise, rejectPromise) => {
				pending.set(id, { resolve: resolvePromise, reject: rejectPromise });
				socket.send(JSON.stringify({ id, method, params, ...(sessionId ? { sessionId } : {}) }));
			});
		},
		close() {
			socket.close();
		}
	};
}

/** Launch a browser and wait until the extension's MV3 worker is running. */
async function launchWithExtension(browserPath, profileDir) {
	const child = spawn(
		browserPath,
		[
			'--headless=new',
			'--no-sandbox',
			'--disable-gpu',
			'--no-first-run',
			'--disable-features=Translate',
			`--user-data-dir=${profileDir}`,
			`--load-extension=${extensionDir}`,
			`--remote-debugging-port=${debugPort}`,
			'about:blank'
		],
		{ stdio: ['ignore', 'ignore', 'pipe'] }
	);
	let log = '';
	child.stderr.on('data', (chunk) => {
		log += String(chunk);
	});
	try {
		const version = await waitForVersion(debugPort, 12_000);
		const cdp = connectCdp(version.webSocketDebuggerUrl);
		await cdp.ready;
		// An MV3 service worker starts lazily, so poll for it instead of checking once.
		const deadline = Date.now() + 12_000;
		let worker;
		while (Date.now() < deadline) {
			const { targetInfos } = await cdp.send('Target.getTargets');
			worker = targetInfos.find(
				(target) => target.type === 'service_worker' && target.url.endsWith('background.chrome.js')
			);
			if (worker) break;
			await new Promise((r) => setTimeout(r, 400));
		}
		if (worker) return { child, cdp, version, worker, log };
		cdp.close();
		child.kill('SIGKILL');
		return null;
	} catch {
		child.kill('SIGKILL');
		return null;
	}
}

/** Runs one bridge call from inside the real Mimin page. */
function probeExpression(action, args) {
	return `(async () => {
		const id = 'probe-' + Date.now() + '-' + Math.random().toString(36).slice(2);
		const reply = await new Promise((resolve) => {
			const timer = setTimeout(() => { window.removeEventListener('message', on); resolve({ timeout: true }); }, 40000);
			function on(event) {
				if (event.source !== window || event.origin !== location.origin) return;
				const data = event.data;
				if (!data || data.source !== 'mimin-extension' || data.id !== id) return;
				clearTimeout(timer);
				window.removeEventListener('message', on);
				resolve(data);
			}
			window.addEventListener('message', on);
			window.postMessage({ source: 'mimin-webui', id, action: ${JSON.stringify(action)}, args: ${JSON.stringify(args)} }, location.origin);
		});
		return JSON.stringify(reply);
	})()`;
}

/**
 * Evaluate in the page, retrying until a live execution context exists.
 * A freshly attached target has no context yet, and `Runtime.evaluate` then
 * fails with "Cannot find context"; the page also navigates after attach.
 */
async function evaluate(cdp, sessionId, expression, awaitPromise = false) {
	const deadline = Date.now() + 15_000;
	let lastError = 'no execution context';
	while (Date.now() < deadline) {
		const outcome = await cdp.send(
			'Runtime.evaluate',
			{ expression, awaitPromise, returnByValue: true },
			sessionId
		);
		if (outcome.exceptionDetails) {
			lastError =
				outcome.exceptionDetails.exception?.description ??
				outcome.exceptionDetails.text ??
				'unknown exception';
			await new Promise((r) => setTimeout(r, 400));
			continue;
		}
		if (outcome.result === undefined) {
			await new Promise((r) => setTimeout(r, 400));
			continue;
		}
		return { ok: true, value: outcome.result.value };
	}
	return { ok: false, error: lastError };
}

const results = [];
function record(name, passed, detail) {
	results.push({ name, passed, detail });
	console.log(`${passed ? 'PASS' : 'FAIL'} ${name}${detail === undefined ? '' : ` :: ${detail}`}`);
}

const browsers = await findBrowsers();
const createdProfiles = [];
let session = null;
let browserLog = '';

try {
	for (const browserPath of browsers) {
		console.log(`Trying browser: ${browserPath}`);
		// A fresh profile per attempt: a killed browser can leave a singleton lock.
		const profileDir = await mkdtemp(join(scratchRoot, 'mimin-chrome-e2e-'));
		createdProfiles.push(profileDir);
		session = await launchWithExtension(browserPath, profileDir);
		if (session) {
			console.log(`Loaded extension with: ${browserPath} (${session.version.Browser})`);
			break;
		}
		console.log('  extension did not load with this build; trying next');
		await new Promise((r) => setTimeout(r, 500));
	}
	if (!session) {
		record('extension service worker started', false, 'no Chromium build loaded the extension');
		throw new Error('No Chromium build allowed --load-extension.');
	}

	const { cdp, worker, child } = session;
	browserLog = session.log;
	record('extension service worker started', true, worker.url);

	// Open the Mimin origin so the content script injects.
	const { targetId } = await cdp.send('Target.createTarget', { url: targetUrl });
	const { sessionId } = await cdp.send('Target.attachToTarget', { targetId, flatten: true });
	await cdp.send('Runtime.enable', {}, sessionId);
	await cdp.send('Page.enable', {}, sessionId).catch(() => {});
	await new Promise((r) => setTimeout(r, 1_500));

	const locationProbe = await evaluate(cdp, sessionId, 'location.origin');
	record(
		'opened the Mimin origin',
		locationProbe.ok && locationProbe.value === new URL(targetUrl).origin,
		locationProbe.ok ? String(locationProbe.value) : locationProbe.error
	);

	async function probe(name, action, args, check) {
		const outcome = await evaluate(cdp, sessionId, probeExpression(action, args), true);
		if (!outcome.ok) {
			record(name, false, `evaluate failed: ${outcome.error}`);
			return null;
		}
		let reply;
		try {
			reply = JSON.parse(String(outcome.value));
		} catch {
			record(name, false, `unparseable reply: ${String(outcome.value).slice(0, 200)}`);
			return null;
		}
		const verdict = check(reply);
		record(name, verdict.ok, verdict.detail);
		return reply;
	}

	await probe('page reaches the extension (ping)', 'ping', {}, (reply) => {
		if (reply.timeout) return { ok: false, detail: 'timed out waiting for a reply' };
		if (reply.ok !== true) return { ok: false, detail: `error: ${reply.error}` };
		// Compared against the packaged manifest so the handshake cannot silently
		// report a version the build did not ship.
		return {
			ok: reply.result?.version === builtVersion,
			detail: `version=${reply.result?.version} expected=${builtVersion} publicWebsites=${reply.result?.permissions?.publicWebsites}`
		};
	});

	await probe('lists tabs without host permission', 'browser_tabs_list', {}, (reply) => {
		if (reply.timeout) return { ok: false, detail: 'timed out' };
		if (reply.ok !== true) return { ok: false, detail: `error: ${reply.error}` };
		const tabs = reply.result?.tabs ?? [];
		const leaked = tabs.some((tab) => String(tab.url ?? '').includes('localhost'));
		return { ok: !leaked, detail: `${tabs.length} tab(s), private localhost leaked=${leaked}` };
	});

	await probe(
		'opens and reads a real public page',
		'browser_open',
		{ url: 'https://www.google.com/' },
		(reply) => {
			if (reply.timeout) return { ok: false, detail: 'timed out' };
			if (reply.ok !== true) return { ok: false, detail: `error: ${reply.error}` };
			const result = reply.result ?? {};
			if (result.readable !== true)
				return { ok: false, detail: `readable=${result.readable} reason=${result.reason}` };
			return {
				ok: Boolean(result.text && result.title),
				detail: `title="${String(result.title).slice(0, 40)}" text=${String(result.text).length}B elements=${result.elements?.length ?? 0}`
			};
		}
	);

	await probe('rejects a private URL', 'browser_open', { url: 'http://192.168.1.1/' }, (reply) => {
		if (reply.timeout) return { ok: false, detail: 'timed out' };
		return { ok: reply.ok === false, detail: `error=${reply.error}` };
	});

	cdp.close();
	child.kill('SIGKILL');
} catch (error) {
	record('harness completed', false, error instanceof Error ? error.message : String(error));
} finally {
	await new Promise((r) => setTimeout(r, 500));
	for (const dir of createdProfiles)
		await rm(dir, { recursive: true, force: true }).catch(() => {});
}

const failures = results.filter((entry) => !entry.passed).length;
console.log(`\nSUMMARY ${results.length - failures} passed, ${failures} failed`);
if (failures > 0 && browserLog) {
	console.log('\n--- browser log (filtered) ---');
	console.log(
		browserLog
			.split('\n')
			.filter((line) => /extension|manifest|error|fail|invalid/i.test(line))
			.slice(0, 20)
			.join('\n')
	);
}
process.exit(failures === 0 ? 0 : 1);
