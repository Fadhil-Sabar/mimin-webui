const extensionApi = globalThis.browser ?? globalThis.chrome;
const statusTitle = document.querySelector('#status-title');
const statusDetail = document.querySelector('#status-detail');
const statusDot = document.querySelector('#status-dot');
const origins = document.querySelector('#origins');
const publicPermBadge = document.querySelector('#public-perm-badge');
const publicPermBtn = document.querySelector('#public-perm-btn');

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
			const result = namespace?.[method]?.(...args, callback);
			if (result && typeof result.then === 'function')
				result.then(
					(value) => finish(value),
					(error) => finish(null, error)
				);
			else if (result !== undefined) finish(result);
		} catch (firstError) {
			try {
				const result = namespace?.[method]?.(...args);
				if (result && typeof result.then === 'function')
					result.then(
						(value) => finish(value),
						(error) => finish(null, error)
					);
				else finish(result);
			} catch (secondError) {
				finish(null, secondError ?? firstError);
			}
		}
	});
}

function sendRuntimeMessage(message) {
	return apiCall(extensionApi?.runtime, 'sendMessage', message);
}

function renderOrigins(allowedOrigins) {
	origins.replaceChildren();
	for (const origin of allowedOrigins ?? []) {
		const item = document.createElement('li');
		item.textContent = origin;
		origins.append(item);
	}
	if (!origins.children.length) {
		const item = document.createElement('li');
		item.textContent = 'No configured origins';
		origins.append(item);
	}
}

async function updatePermissions() {
	if (!publicPermBadge || !publicPermBtn || !extensionApi?.permissions) return;
	try {
		const isGranted = await apiCall(extensionApi.permissions, 'contains', {
			origins: ['http://*/*', 'https://*/*']
		});
		if (isGranted) {
			publicPermBadge.textContent = 'Enabled';
			publicPermBadge.classList.add('ok');
			publicPermBtn.textContent = 'Revoke';
		} else {
			publicPermBadge.textContent = 'Not granted';
			publicPermBadge.classList.remove('ok');
			publicPermBtn.textContent = 'Grant';
		}
	} catch {
		publicPermBadge.textContent = 'Not granted';
		publicPermBadge.classList.remove('ok');
		publicPermBtn.textContent = 'Grant';
	}
}

if (publicPermBtn) {
	publicPermBtn.addEventListener('click', async () => {
		publicPermBtn.disabled = true;
		try {
			const isGranted = await apiCall(extensionApi.permissions, 'contains', {
				origins: ['http://*/*', 'https://*/*']
			}).catch(() => false);

			if (isGranted) {
				await apiCall(extensionApi.permissions, 'remove', {
					origins: ['http://*/*', 'https://*/*']
				});
			} else {
				await apiCall(extensionApi.permissions, 'request', {
					origins: ['http://*/*', 'https://*/*']
				});
			}
		} catch (error) {
			console.warn('Could not update permission:', error);
		} finally {
			await updatePermissions();
			publicPermBtn.disabled = false;
		}
	});
}

async function loadStatus() {
	try {
		const response = await sendRuntimeMessage({ type: 'mimin:status' });
		if (!response?.ok) throw new Error(response?.error ?? 'Bridge is unavailable.');
		statusDot.classList.add('connected');
		statusTitle.textContent = 'Bridge is ready';
		statusDetail.textContent = `Mimin extension v${response.result?.version ?? '0.2.0'} is listening for requests.`;
		renderOrigins(response.result?.allowedOrigins);
	} catch (error) {
		statusDot.classList.add('error');
		statusTitle.textContent = 'Bridge is unavailable';
		statusDetail.textContent =
			error instanceof Error ? error.message : 'Reload the extension and try again.';
		renderOrigins(globalThis.MIMIN_EXTENSION_CONFIG?.allowedOrigins);
	} finally {
		await updatePermissions();
	}
}

void loadStatus();
