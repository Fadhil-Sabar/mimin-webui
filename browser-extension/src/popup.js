const extensionApi = globalThis.browser ?? globalThis.chrome;
const statusTitle = document.querySelector('#status-title');
const statusDetail = document.querySelector('#status-detail');
const statusDot = document.querySelector('#status-dot');
const origins = document.querySelector('#origins');

function sendRuntimeMessage(message) {
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
			const result = extensionApi?.runtime?.sendMessage(message, callback);
			if (result && typeof result.then === 'function')
				result.then(
					(value) => finish(value),
					(error) => finish(null, error)
				);
		} catch (firstError) {
			try {
				const result = extensionApi?.runtime?.sendMessage(message);
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
	}
}

void loadStatus();
