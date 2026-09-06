(() => {
	const extensionApi = globalThis.browser ?? globalThis.chrome;
	const configuredOrigins = globalThis.MIMIN_EXTENSION_CONFIG?.allowedOrigins ?? [];

	function isAllowedOrigin(origin) {
		return typeof origin === 'string' && configuredOrigins.includes(origin);
	}

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
				const result = extensionApi?.runtime?.sendMessage(message);
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
				// fall through to callback pattern
			}

			try {
				const result = extensionApi?.runtime?.sendMessage(message, callback);
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

	function isValidRequest(value) {
		return (
			value &&
			typeof value === 'object' &&
			value.source === 'mimin-webui' &&
			typeof value.id === 'string' &&
			value.id.length > 0 &&
			value.id.length <= 128 &&
			['ping', 'browser_search', 'browser_open'].includes(value.action) &&
			(value.args === undefined ||
				(value.args && typeof value.args === 'object' && !Array.isArray(value.args)))
		);
	}

	window.addEventListener('message', (event) => {
		if (event.source !== window || !isAllowedOrigin(event.origin) || !isValidRequest(event.data))
			return;

		const { id, action, args = {} } = event.data;
		const request = { source: 'mimin-webui', id, action, args };

		void (async () => {
			let reply;
			try {
				reply = await sendRuntimeMessage({
					type: 'mimin:request',
					request,
					pageOrigin: event.origin
				});
			} catch (error) {
				reply = {
					ok: false,
					error: error instanceof Error ? error.message : 'Bridge request failed.'
				};
			}

			const message = {
				source: 'mimin-extension',
				id,
				ok: reply?.ok === true
			};
			if (message.ok) message.result = reply.result;
			else message.error = reply?.error ?? 'Bridge request failed.';
			window.postMessage(message, event.origin);
		})();
	});
})();
