(() => {
	const extensionApi = globalThis.browser ?? globalThis.chrome;
	const configuredOrigins = globalThis.MIMIN_EXTENSION_CONFIG?.allowedOrigins ?? [];

	function isAllowedOrigin(origin) {
		return typeof origin === 'string' && configuredOrigins.includes(origin);
	}

	/**
	 * Read a message off a thrown value without `instanceof Error`.
	 * Content scripts bridge two realms (page and extension), and an Error built
	 * in one realm is not an instance of the other's Error constructor. Losing the
	 * message here would surface a useless "Bridge request failed." to the user.
	 */
	function errorMessage(error) {
		if (error && typeof error === 'object') {
			const message = error.message;
			if (typeof message === 'string' && message.trim()) return message;
		}
		if (typeof error === 'string' && error.trim()) return error;
		return 'Bridge request failed.';
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
			[
				'ping',
				'browser_search',
				'browser_open',
				'browser_tabs_list',
				'browser_tab_read',
				'browser_tab_interact'
			].includes(value.action) &&
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
				reply = { ok: false, error: errorMessage(error) };
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
