(() => {
	const extensionApi = globalThis.browser ?? globalThis.chrome;
	const config = globalThis.MIMIN_EXTENSION_CONFIG ?? { version: '0.2.0', allowedOrigins: [] };
	const MAX_QUERY_LENGTH = 500;
	const LOAD_TIMEOUT_MS = 15_000;
	const SEARCH_ENGINES = Object.freeze({
		google: 'https://www.google.com/search',
		scholar: 'https://scholar.google.com/scholar'
	});
	let lastTabId = null;

	async function persistTabId(tabId) {
		lastTabId = tabId;
		const storage = extensionApi?.storage?.session ?? extensionApi?.storage?.local;
		if (storage && tabId !== null) {
			try {
				await apiCall(storage, 'set', { lastTabId: tabId });
			} catch {
				// ignore
			}
		} else if (storage && tabId === null) {
			try {
				await apiCall(storage, 'remove', 'lastTabId');
			} catch {
				// ignore
			}
		}
	}

	if (extensionApi?.tabs?.onRemoved?.addListener) {
		extensionApi.tabs.onRemoved.addListener((closedTabId) => {
			if (closedTabId === lastTabId) {
				void persistTabId(null);
			}
		});
	}

	async function findReusableTab() {
		if (lastTabId !== null) {
			try {
				const existing = await apiCall(extensionApi.tabs, 'get', lastTabId);
				if (existing?.id) return existing;
			} catch {
				lastTabId = null;
			}
		}

		const storage = extensionApi?.storage?.session ?? extensionApi?.storage?.local;
		if (storage) {
			try {
				const stored = await apiCall(storage, 'get', 'lastTabId');
				if (stored?.lastTabId) {
					const existing = await apiCall(extensionApi.tabs, 'get', stored.lastTabId);
					if (existing?.id) {
						lastTabId = existing.id;
						return existing;
					}
				}
			} catch {
				// ignore
			}
		}

		if (extensionApi?.tabs?.query) {
			try {
				const candidates = await apiCall(extensionApi.tabs, 'query', {
					url: ['https://www.google.com/*', 'https://scholar.google.com/*']
				});
				if (Array.isArray(candidates) && candidates.length > 0) {
					const picked = candidates[candidates.length - 1];
					if (picked?.id) {
						lastTabId = picked.id;
						return picked;
					}
				}
			} catch {
				// ignore
			}
		}

		return null;
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

	function errorResponse(message) {
		return { ok: false, error: message };
	}

	function successResponse(result) {
		return { ok: true, result };
	}

	function originFrom(value) {
		if (typeof value !== 'string') return null;
		try {
			return new URL(value).origin;
		} catch {
			return null;
		}
	}

	function isAllowedSender(sender) {
		const candidates = [sender?.origin, sender?.url, sender?.tab?.url]
			.map(originFrom)
			.filter(Boolean);
		return candidates.some((origin) => config.allowedOrigins.includes(origin));
	}

	function buildSearchUrl(engine, query) {
		const resolvedEngine = engine === 'google_scholar' ? 'scholar' : engine;
		if (!Object.hasOwn(SEARCH_ENGINES, resolvedEngine)) throw new Error('Unsupported search engine.');
		if (typeof query !== 'string' || query.length > MAX_QUERY_LENGTH)
			throw new Error('Search query is invalid or too long.');
		const normalizedQuery = query.trim();
		if (!normalizedQuery)
			return resolvedEngine === 'scholar' ? 'https://scholar.google.com/' : 'https://www.google.com/';
		const url = new URL(SEARCH_ENGINES[resolvedEngine]);
		url.searchParams.set('q', normalizedQuery);
		return url.toString();
	}

	function isReadableGoogleUrl(value) {
		try {
			const url = new URL(value);
			return (
				url.protocol === 'https:' && ['www.google.com', 'scholar.google.com'].includes(url.hostname)
			);
		} catch {
			return false;
		}
	}

	function isPrivateHost(hostname) {
		const host = hostname.toLowerCase().replace(/^\[|\]$/g, '');
		if (
			host === 'localhost' ||
			host.endsWith('.localhost') ||
			host.endsWith('.local') ||
			host.endsWith('.internal')
		)
			return true;
		if (host === '::1' || host === '0.0.0.0' || host === '::') return true;
		const octets = host.split('.').map(Number);
		if (
			octets.length !== 4 ||
			octets.some((octet) => !Number.isInteger(octet) || octet < 0 || octet > 255)
		)
			return false;
		const [first, second] = octets;
		return (
			first === 10 ||
			first === 127 ||
			(first === 172 && second >= 16 && second <= 31) ||
			(first === 192 && second === 168) ||
			(first === 169 && second === 254)
		);
	}

	function validatePublicUrl(value) {
		if (typeof value !== 'string' || value.length > 2_048)
			throw new Error('URL is invalid or too long.');
		let url;
		try {
			url = new URL(value);
		} catch {
			throw new Error('URL must be absolute.');
		}
		if (!['http:', 'https:'].includes(url.protocol))
			throw new Error('Only http(s) URLs can be opened.');
		if (url.username || url.password) throw new Error('URLs with credentials cannot be opened.');
		if (isPrivateHost(url.hostname)) throw new Error('Private or local URLs cannot be opened.');
		return url.toString();
	}

	function waitForTabLoad(tabId, isNewTab = true) {
		return new Promise((resolve, reject) => {
			let timer;
			let finished = false;
			const cleanup = () => {
				if (timer) clearTimeout(timer);
				extensionApi.tabs.onUpdated.removeListener(onUpdated);
				extensionApi.tabs.onRemoved.removeListener(onRemoved);
			};
			const finish = (callback, value) => {
				if (finished) return;
				finished = true;
				cleanup();
				callback(value);
			};
			const onUpdated = (updatedTabId, changeInfo) => {
				if (updatedTabId === tabId && changeInfo.status === 'complete') finish(resolve);
			};
			const onRemoved = (removedTabId) => {
				if (removedTabId === tabId)
					finish(reject, new Error('The browser tab was closed before it finished loading.'));
			};
			extensionApi.tabs.onUpdated.addListener(onUpdated);
			extensionApi.tabs.onRemoved.addListener(onRemoved);
			timer = setTimeout(
				() => finish(reject, new Error('The browser tab did not finish loading in time.')),
				LOAD_TIMEOUT_MS
			);
			if (isNewTab) {
				void apiCall(extensionApi.tabs, 'get', tabId).then(
					(tab) => {
						if (tab?.status === 'complete') finish(resolve);
					},
					() => undefined
				);
			}
		});
	}

	function pageSnapshot() {
		const normalize = (value, limit) => (value ?? '').replace(/\s+/g, ' ').trim().slice(0, limit);
		const limitUrl = (value) => value.slice(0, 4_000);
		const links = [];
		const seenLinks = new Set();
		for (const anchor of document.querySelectorAll('a[href]')) {
			const url = anchor.href;
			const title = normalize(anchor.textContent, 240);
			if (!/^https?:$/i.test(new URL(url, location.href).protocol) || !title || seenLinks.has(url))
				continue;
			seenLinks.add(url);
			links.push({ title, url: limitUrl(url) });
			if (links.length >= 100) break;
		}

		const results = [];
		const seenResults = new Set();
		for (const root of document.querySelectorAll('.MjjYud, .g, .gs_ri')) {
			const anchor = root.querySelector('h3 a[href], h3.gs_rt a[href], a[href]');
			const title = normalize(anchor?.textContent, 300);
			const url = anchor?.href;
			const snippet = normalize(
				root.querySelector('.VwiC3b, .gs_rs, [data-sncf]')?.textContent,
				4_000
			);
			if (!url || !title || seenResults.has(url)) continue;
			seenResults.add(url);
			results.push({ title, url: limitUrl(url), snippet });
			if (results.length >= 100) break;
		}

		const text = normalize(document.body?.innerText, 12_000);
		const lowered = `${location.href} ${document.title} ${text}`.toLowerCase();
		return {
			url: limitUrl(location.href),
			title: normalize(document.title, 300),
			text,
			links,
			results,
			captcha: /captcha|unusual traffic|not a robot|sorry\.google\.com/.test(lowered)
		};
	}

	async function readSnapshot(tabId, fallbackUrl) {
		let tab;
		try {
			tab = await apiCall(extensionApi.tabs, 'get', tabId);
		} catch {
			tab = null;
		}
		const currentUrl = tab?.url || fallbackUrl;
		if (!isReadableGoogleUrl(currentUrl))
			return {
				url: currentUrl.slice(0, 4_000),
				title: '',
				text: '',
				links: [],
				results: [],
				readable: false,
				reason: 'Only Google and Google Scholar pages can be read.',
				tabId
			};
		const executions = await apiCall(extensionApi.scripting, 'executeScript', {
			target: { tabId },
			func: pageSnapshot
		});
		const snapshot = executions?.[0]?.result;
		if (!snapshot || typeof snapshot !== 'object')
			throw new Error('The Google page did not return a readable snapshot.');
		if (snapshot.captcha)
			throw new Error(
				'Google returned a CAPTCHA or unusual-traffic page; Mimin will not bypass it.'
			);
		return { ...snapshot, readable: true, tabId };
	}

	async function openTab(url, readAllowed, options = {}) {
		const active = Boolean(options.active);
		const reuse = options.reuse ?? true;
		let tab = null;
		let isNewTab = false;

		if (reuse) {
			const existing = await findReusableTab();
			if (existing?.id) {
				try {
					const updateProps = { url };
					if (active) updateProps.active = true;
					const isSameUrl = existing.url === url;
					tab = await apiCall(extensionApi.tabs, 'update', existing.id, updateProps);
					await persistTabId(existing.id);
					if (isSameUrl) {
						await apiCall(extensionApi.tabs, 'reload', existing.id).catch(() => {});
					}
				} catch (err) {
					console.warn('Failed to update tab, falling back to create:', err);
					tab = null;
				}
			}
		}

		if (!tab?.id) {
			tab = await apiCall(extensionApi.tabs, 'create', { url, active });
			if (!tab?.id) throw new Error('The browser did not return the new tab id.');
			await persistTabId(tab.id);
			isNewTab = true;
		}

		await waitForTabLoad(tab.id, isNewTab);
		const snapshot = readAllowed
			? await readSnapshot(tab.id, url)
			: {
					url: url.slice(0, 4_000),
					title: '',
					text: '',
					links: [],
					results: [],
					readable: false,
					reason: 'The tab was opened, but reading is limited to Google and Google Scholar.',
					tabId: tab.id
				};
		if (options.autoClose) {
			try {
				await apiCall(extensionApi.tabs, 'remove', tab.id);
			} catch {
				// ignore if tab was already closed
			}
			if (lastTabId === tab.id) {
				void persistTabId(null);
			}
		}
		return snapshot;
	}

	async function handleRequest(request, sender) {
		if (!isAllowedSender(sender)) return errorResponse('This page is not an allowed Mimin origin.');
		if (!request || request.source !== 'mimin-webui' || typeof request.id !== 'string')
			return errorResponse('Invalid bridge request.');
		const args = request.args && typeof request.args === 'object' ? request.args : {};

		try {
			if (request.action === 'ping') return successResponse({ version: config.version });
			if (request.action === 'browser_search') {
				const url = buildSearchUrl(args.engine, args.query ?? '');
				return successResponse(
					await openTab(url, true, {
						active: Boolean(args.active),
						autoClose: Boolean(args.autoClose)
					})
				);
			}
			if (request.action === 'browser_open') {
				const url = validatePublicUrl(args.url);
				return successResponse(
					await openTab(url, isReadableGoogleUrl(url), {
						active: Boolean(args.active),
						autoClose: Boolean(args.autoClose)
					})
				);
			}
			return errorResponse('Unsupported bridge action.');
		} catch (error) {
			return errorResponse(error instanceof Error ? error.message : 'Bridge request failed.');
		}
	}

	extensionApi.runtime.onMessage.addListener((message, sender, sendResponse) => {
		if (message?.type === 'mimin:status') {
			sendResponse(
				successResponse({ version: config.version, allowedOrigins: config.allowedOrigins })
			);
			return false;
		}
		if (message?.type !== 'mimin:request') return false;
		void handleRequest(message.request, sender).then(sendResponse);
		return true;
	});
})();
