// The old setting only showed download links; it did not opt into agent browser access.
export const BROWSER_BRIDGE_STORAGE_KEY = 'mimin:browser-bridge-enabled';

export function isBrowserBridgeEnabled() {
	try {
		return (
			typeof window !== 'undefined' && localStorage.getItem(BROWSER_BRIDGE_STORAGE_KEY) === 'true'
		);
	} catch {
		return false;
	}
}

export function setBrowserBridgeEnabled(enabled: boolean) {
	localStorage.setItem(BROWSER_BRIDGE_STORAGE_KEY, String(enabled));
}

/**
 * crypto.randomUUID is only exposed in secure contexts, so a Mimin served over plain HTTP
 * on a LAN IP or Docker host would throw here. Build the v4 id from getRandomValues instead.
 */
function randomRequestId(): string {
	const webCrypto = globalThis.crypto;
	if (typeof webCrypto?.randomUUID === 'function') return webCrypto.randomUUID();
	if (typeof webCrypto?.getRandomValues === 'function') {
		const bytes = webCrypto.getRandomValues(new Uint8Array(16));
		bytes[6] = (bytes[6] & 0x0f) | 0x40;
		bytes[8] = (bytes[8] & 0x3f) | 0x80;
		const hex = Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('');
		return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
	}
	return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`;
}

/** Only the content script on this Mimin origin relays these messages to the extension. */
export function requestBrowserBridge(
	action:
		| 'ping'
		| 'browser_search'
		| 'browser_open'
		| 'browser_tabs_list'
		| 'browser_tab_read'
		| 'browser_tab_interact',
	args: Record<string, unknown> = {},
	signal?: AbortSignal
): Promise<unknown> {
	if (!isBrowserBridgeEnabled()) return Promise.reject(new Error('Browser bridge is disabled.'));
	if (signal?.aborted) return Promise.reject(new Error('Browser request canceled.'));
	return new Promise((resolve, reject) => {
		const id = randomRequestId();
		const timeout = setTimeout(
			() =>
				finish(
					new Error(
						action === 'ping'
							? 'Extension not connected. Install or reload Mimin Browser Bridge, then reload this page.'
							: 'Browser did not respond in time. Check the opened tab and try again.'
					)
				),
			action === 'ping' ? 1500 : 35000
		);
		function cleanup() {
			clearTimeout(timeout);
			window.removeEventListener('message', receive);
			signal?.removeEventListener('abort', abort);
		}
		function finish(error?: Error, result?: unknown) {
			cleanup();
			if (error) reject(error);
			else resolve(result);
		}
		function abort() {
			finish(new Error('Browser request canceled.'));
		}
		function receive(event: MessageEvent) {
			// Firefox can hide the source of messages sent by privileged extension code.
			// Keep the exact-origin and unpredictable request-id checks in both browsers.
			if (event.source !== window || event.origin !== window.location.origin) return;
			const message = event.data;
			if (!message || message.source !== 'mimin-extension' || message.id !== id) return;
			if (message.ok === true) finish(undefined, message.result);
			else if (message.ok === false)
				finish(
					new Error(typeof message.error === 'string' ? message.error : 'Browser request failed.')
				);
		}
		window.addEventListener('message', receive);
		signal?.addEventListener('abort', abort, { once: true });
		window.postMessage({ source: 'mimin-webui', id, action, args }, window.location.origin);
	});
}

export const REQUIRED_BROWSER_EXTENSION_VERSION = '0.4.2';

const BROWSER_BRIDGE_ACTIONS = [
	'browser_search',
	'browser_open',
	'browser_tabs_list',
	'browser_tab_read',
	'browser_tab_interact'
] as const;

export function compareExtensionVersions(v1: string, v2: string): number {
	const p1 = v1.split('.').map((s) => parseInt(s, 10) || 0);
	const p2 = v2.split('.').map((s) => parseInt(s, 10) || 0);
	const len = Math.max(p1.length, p2.length);
	for (let i = 0; i < len; i++) {
		const num1 = p1[i] ?? 0;
		const num2 = p2[i] ?? 0;
		if (num1 > num2) return 1;
		if (num1 < num2) return -1;
	}
	return 0;
}

export function isExtensionVersionCompatible(installed?: string): boolean {
	if (!installed) return false;
	return compareExtensionVersions(installed, REQUIRED_BROWSER_EXTENSION_VERSION) >= 0;
}

export type BrowserBridgeStatusResult = {
	connected: boolean;
	updateRequired?: boolean;
	message: string;
	version?: string;
	requiredVersion: string;
	permissions?: {
		google?: boolean;
		publicWebsites?: boolean;
	};
};

export async function getBrowserBridgeStatus(
	signal?: AbortSignal
): Promise<BrowserBridgeStatusResult> {
	if (!isBrowserBridgeEnabled()) {
		return {
			connected: false,
			updateRequired: false,
			message: 'Disabled on this browser.',
			requiredVersion: REQUIRED_BROWSER_EXTENSION_VERSION
		};
	}
	try {
		const res = (await requestBrowserBridge('ping', {}, signal)) as
			| { version?: string; permissions?: { google?: boolean; publicWebsites?: boolean } }
			| undefined;
		const installedVersion = res?.version;
		const isCompatible = isExtensionVersionCompatible(installedVersion);
		if (!isCompatible) {
			return {
				connected: false,
				updateRequired: true,
				message: `Extension update required. Installed: ${installedVersion ?? 'unknown'}, Required: ${REQUIRED_BROWSER_EXTENSION_VERSION}.`,
				version: installedVersion,
				requiredVersion: REQUIRED_BROWSER_EXTENSION_VERSION,
				permissions: res?.permissions
			};
		}
		return {
			connected: true,
			updateRequired: false,
			message: 'Connected. Mimin can open tabs from your chat.',
			version: installedVersion,
			requiredVersion: REQUIRED_BROWSER_EXTENSION_VERSION,
			permissions: res?.permissions
		};
	} catch (error) {
		return {
			connected: false,
			updateRequired: false,
			message: error instanceof Error ? error.message : 'Extension not connected.',
			requiredVersion: REQUIRED_BROWSER_EXTENSION_VERSION
		};
	}
}

export async function handleBrowserRequest(event: Record<string, unknown>, signal?: AbortSignal) {
	if (
		typeof event.requestId !== 'string' ||
		typeof event.token !== 'string' ||
		!BROWSER_BRIDGE_ACTIONS.includes(event.action as (typeof BROWSER_BRIDGE_ACTIONS)[number]) ||
		!event.args ||
		typeof event.args !== 'object' ||
		Array.isArray(event.args)
	)
		throw new Error('Invalid browser request.');
	let outcome: { ok: boolean; result?: unknown; error?: string };
	try {
		const result = await requestBrowserBridge(
			event.action as (typeof BROWSER_BRIDGE_ACTIONS)[number],
			event.args as Record<string, unknown>,
			signal
		);
		outcome = { ok: true, result };
	} catch (error) {
		outcome = {
			ok: false,
			error: error instanceof Error ? error.message : 'Browser request failed.'
		};
	}
	if (signal?.aborted) return;
	const response = await fetch('/api/browser/result', {
		method: 'POST',
		headers: { 'content-type': 'application/json' },
		body: JSON.stringify({ requestId: event.requestId, token: event.token, ...outcome }),
		signal
	});
	if (!response.ok) throw new Error('Could not deliver the browser result to Mimin. Please retry.');
}
