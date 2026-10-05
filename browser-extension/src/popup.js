const extensionApi = globalThis.browser ?? globalThis.chrome;
const statusTitle = document.querySelector('#status-title');
const statusDetail = document.querySelector('#status-detail');
const statusDot = document.querySelector('#status-dot');
const origins = document.querySelector('#origins');
const publicPermBadge = document.querySelector('#public-perm-badge');
const publicPermBtn = document.querySelector('#public-perm-btn');
const permissionFeedback = document.querySelector('#permission-feedback');
const siteOrigin = document.querySelector('#site-origin');
const siteDetail = document.querySelector('#site-detail');
const siteBadge = document.querySelector('#site-badge');
const siteBtn = document.querySelector('#site-btn');
const siteHelp = document.querySelector('#site-help');
const siteFeedback = document.querySelector('#site-feedback');

const PUBLIC_ORIGINS = ['http://*/*', 'https://*/*'];
let isPublicPermGranted = false;
let activeTab = null;
/** Mirrors the background's view, filled from `mimin:status`. */
const state = {
	version: '0.4.3',
	allowedOrigins: [],
	connectedOrigins: [],
	universal: false,
	trustLocalhost: false
};

/**
 * Match patterns carry no port, which is how one granted permission covers whatever port a
 * self-hosted instance listens on. The background builds the same pattern in `background-core.js`.
 */
function originMatchPattern(origin) {
	const url = new URL(origin);
	return `${url.protocol}//${url.hostname}/*`;
}

function originFromUrl(value) {
	try {
		return new URL(value).origin;
	} catch {
		return null;
	}
}

function isLocalhost(origin) {
	const url = new URL(origin);
	return url.protocol === 'http:' && (url.hostname === 'localhost' || url.hostname === '127.0.0.1');
}

function apiCall(namespace, method, ...args) {
	return new Promise((resolve, reject) => {
		let settled = false;
		const finish = (value, error) => {
			if (settled) return;
			settled = true;
			if (error) reject(error);
			else resolve(value);
		};

		const callback = (value) => {
			const lastError = extensionApi?.runtime?.lastError;
			finish(value, lastError ? new Error(lastError.message) : null);
		};

		try {
			const result = namespace?.[method]?.(...args);
			if (result && typeof result.then === 'function') {
				result.then(
					(value) => finish(value),
					(error) => finish(null, error)
				);
				return;
			} else if (result !== undefined) {
				finish(result);
				return;
			}
		} catch {
			// Method may require a callback or threw synchronously; fall through to callback invocation
		}

		try {
			const result = namespace?.[method]?.(...args, callback);
			if (result && typeof result.then === 'function')
				result.then(
					(value) => finish(value),
					(error) => finish(null, error)
				);
			else if (result !== undefined) finish(result);
		} catch (secondError) {
			finish(null, secondError);
		}
	});
}

function sendRuntimeMessage(message) {
	return apiCall(extensionApi?.runtime, 'sendMessage', message);
}

function addOriginItem(text, note) {
	const item = document.createElement('li');
	item.textContent = text;
	if (note) {
		const small = document.createElement('small');
		small.textContent = note;
		item.append(' ', small);
	}
	origins.append(item);
}

function renderOrigins() {
	origins.replaceChildren();
	for (const origin of state.allowedOrigins) addOriginItem(origin, 'built in');
	for (const origin of state.connectedOrigins) {
		if (!state.allowedOrigins.includes(origin)) addOriginItem(origin, 'connected');
	}
	if (state.trustLocalhost) addOriginItem('http://localhost:<port>', 'any port');
	if (!origins.children.length) addOriginItem('No Mimin pages yet', null);
}

/**
 * What the extension currently thinks of the tab the popup was opened from. This is the same set of
 * rules the background applies to a request, so the popup never claims a connection it does not have.
 */
function siteState() {
	const origin = activeTab?.url ? originFromUrl(activeTab.url) : null;
	if (!origin) return { origin: null, kind: 'no-tab' };
	if (state.allowedOrigins.includes(origin)) return { origin, kind: 'built-in' };
	if (state.trustLocalhost && isLocalhost(origin)) return { origin, kind: 'localhost' };
	if (state.connectedOrigins.includes(origin)) return { origin, kind: 'connected' };
	if (state.universal) return { origin, kind: 'available' };
	return { origin, kind: 'fixed' };
}

function updateSite() {
	if (!siteOrigin || !siteDetail || !siteBadge || !siteBtn) return;
	const { origin, kind } = siteState();
	siteBtn.hidden = true;
	siteBtn.textContent = 'Connect this site';
	siteBadge.classList.remove('ok');
	switch (kind) {
		case 'no-tab':
			siteOrigin.textContent = 'No Mimin tab';
			siteDetail.textContent = 'Open your Mimin instance in a tab, then reopen this panel.';
			siteBadge.textContent = 'Unavailable';
			break;
		case 'built-in':
			siteOrigin.textContent = origin;
			siteDetail.textContent = 'Signed into this package at build time.';
			siteBadge.textContent = 'Built in';
			siteBadge.classList.add('ok');
			break;
		case 'localhost':
			siteOrigin.textContent = origin;
			siteDetail.textContent = 'Localhost is covered whatever port it runs on.';
			siteBadge.textContent = 'Connected';
			siteBadge.classList.add('ok');
			break;
		case 'connected':
			siteOrigin.textContent = origin;
			siteDetail.textContent = 'Connected from this popup.';
			siteBadge.textContent = 'Connected';
			siteBadge.classList.add('ok');
			siteBtn.hidden = false;
			siteBtn.textContent = 'Disconnect this site';
			break;
		case 'available':
			siteOrigin.textContent = origin;
			siteDetail.textContent = 'Connect it to let Mimin use the bridge on this address.';
			siteBadge.textContent = 'Not connected';
			siteBtn.hidden = false;
			break;
		default:
			siteOrigin.textContent = origin;
			siteDetail.textContent = 'This package only bridges the addresses it was built for.';
			siteBadge.textContent = 'Fixed build';
	}
}

async function loadActiveTab() {
	try {
		const tabs = await apiCall(extensionApi.tabs, 'query', { active: true, currentWindow: true });
		activeTab = Array.isArray(tabs) ? (tabs[0] ?? null) : null;
	} catch {
		activeTab = null;
	}
	updateSite();
}

if (siteBtn) {
	siteBtn.addEventListener('click', async () => {
		const { origin, kind } = siteState();
		if (!origin) return;
		// Firefox requires permissions.request() synchronously inside the user input handler, so it
		// is called before anything is awaited. The background then verifies the grant before it
		// trusts the origin, which keeps a page from talking its way into the bridge.
		siteBtn.disabled = true;
		siteFeedback.textContent = '';
		siteFeedback.classList.remove('success');
		try {
			if (kind === 'connected') {
				const response = await sendRuntimeMessage({ type: 'mimin:disconnect-site', origin });
				if (!response?.ok) throw new Error(response?.error ?? 'Could not disconnect this site.');
				siteFeedback.textContent = `${origin} is disconnected. Reopen the Mimin tab to be sure.`;
			} else {
				const pattern = originMatchPattern(origin);
				const requested =
					extensionApi?.permissions?.request?.({ origins: [pattern] }) ??
					apiCall(extensionApi?.permissions, 'request', { origins: [pattern] });
				const granted = await requested;
				if (!granted) {
					siteFeedback.textContent = `Access to ${pattern} was not granted.`;
					return;
				}
				const response = await sendRuntimeMessage({
					type: 'mimin:connect-site',
					origin,
					tabId: activeTab?.id
				});
				if (!response?.ok) throw new Error(response?.error ?? 'Could not connect this site.');
				siteFeedback.textContent = `${origin} is connected. Mimin can use the bridge here now.`;
				siteFeedback.classList.add('success');
			}
		} catch (error) {
			siteFeedback.textContent =
				error instanceof Error ? error.message : 'Could not update this site.';
		} finally {
			siteBtn.disabled = false;
			await loadStatus();
		}
	});
}

async function updatePermissions() {
	if (!publicPermBadge || !publicPermBtn || !extensionApi?.permissions) return;
	try {
		const isGranted = await (extensionApi.permissions.contains?.({ origins: PUBLIC_ORIGINS }) ??
			apiCall(extensionApi.permissions, 'contains', { origins: PUBLIC_ORIGINS }));
		isPublicPermGranted = Boolean(isGranted);
		if (isGranted) {
			publicPermBadge.textContent = 'Enabled';
			publicPermBadge.classList.add('ok');
			publicPermBtn.textContent = 'Revoke tab access';
		} else {
			publicPermBadge.textContent = 'Not granted';
			publicPermBadge.classList.remove('ok');
			publicPermBtn.textContent = 'Grant tab access';
		}
	} catch {
		isPublicPermGranted = false;
		publicPermBadge.textContent = 'Permission status unavailable';
		publicPermBadge.classList.remove('ok');
		publicPermBtn.textContent = 'Grant tab access';
	}
}

if (publicPermBtn) {
	publicPermBtn.addEventListener('click', async () => {
		// In Firefox, permissions.request() MUST be called synchronously within the
		// user input handler. Do not await anything before invoking permissions.request().
		const wantGrant = !isPublicPermGranted;
		publicPermBtn.disabled = true;
		permissionFeedback.textContent = '';
		permissionFeedback.classList.remove('success');
		publicPermBadge.textContent = wantGrant ? 'Requesting…' : 'Revoking…';
		try {
			if (wantGrant) {
				const reqPromise =
					extensionApi?.permissions?.request?.({ origins: PUBLIC_ORIGINS }) ??
					apiCall(extensionApi?.permissions, 'request', { origins: PUBLIC_ORIGINS });
				await reqPromise;
			} else {
				await apiCall(extensionApi?.permissions, 'remove', { origins: PUBLIC_ORIGINS });
			}
		} catch (error) {
			console.warn('Could not update permission:', error);
			permissionFeedback.textContent = error instanceof Error
				? `Could not update permission: ${error.message}`
				: 'Could not update permission. Check the browser prompt and try again.';
		} finally {
			await updatePermissions();
			publicPermBtn.disabled = false;
			if (!permissionFeedback.textContent) {
				permissionFeedback.textContent = isPublicPermGranted
					? 'Tab access is enabled.'
					: 'Tab access was not granted.';
				permissionFeedback.classList.toggle('success', isPublicPermGranted);
			}
		}
	});
}

async function loadStatus() {
	try {
		const response = await sendRuntimeMessage({ type: 'mimin:status' });
		if (!response?.ok) throw new Error(response?.error ?? 'Bridge is unavailable.');
		statusDot.classList.remove('error');
		statusDot.classList.add('connected');
		statusTitle.textContent = 'Bridge is ready';
		state.version = response.result?.version ?? state.version;
		statusDetail.textContent = `Mimin extension v${state.version} is listening for requests.`;
		state.allowedOrigins = Array.isArray(response.result?.allowedOrigins)
			? response.result.allowedOrigins
			: [];
		state.connectedOrigins = Array.isArray(response.result?.connectedOrigins)
			? response.result.connectedOrigins
			: [];
		state.universal = response.result?.universal === true;
		state.trustLocalhost = response.result?.trustLocalhost === true;
		if (siteHelp && state.universal) {
			siteHelp.textContent =
				'Localhost addresses are covered automatically. For any other address, open your Mimin instance in a tab, click Connect this site, and approve the browser prompt once.';
		}
		renderOrigins();
	} catch (error) {
		statusDot.classList.remove('connected');
		statusDot.classList.add('error');
		statusTitle.textContent = 'Bridge is unavailable';
		statusDetail.textContent =
			error instanceof Error ? error.message : 'Reload the extension and try again.';
		renderOrigins();
	} finally {
		updateSite();
		await updatePermissions();
	}
}

void loadStatus();
void loadActiveTab();
