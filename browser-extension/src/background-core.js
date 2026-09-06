(() => {
	const extensionApi = globalThis.browser ?? globalThis.chrome;
	const config = globalThis.MIMIN_EXTENSION_CONFIG ?? { version: '0.3.0', allowedOrigins: [] };
	const MAX_QUERY_LENGTH = 500;
	const LOAD_TIMEOUT_MS = 15_000;
	const SEARCH_ENGINES = Object.freeze({
		google: 'https://www.google.com/search',
		scholar: 'https://scholar.google.com/scholar'
	});
	let lastTabId = null;
	const ownedTabIds = new Set();

	async function initOwnedTabs() {
		const storage = extensionApi?.storage?.session ?? extensionApi?.storage?.local;
		if (storage) {
			try {
				const stored = await apiCall(storage, 'get', 'miminOwnedTabIds');
				if (Array.isArray(stored?.miminOwnedTabIds)) {
					for (const id of stored.miminOwnedTabIds) ownedTabIds.add(id);
				}
			} catch {
				// ignore
			}
		}
	}
	void initOwnedTabs();

	async function markTabOwned(tabId) {
		if (tabId == null) return;
		ownedTabIds.add(tabId);
		const storage = extensionApi?.storage?.session ?? extensionApi?.storage?.local;
		if (storage) {
			try {
				await apiCall(storage, 'set', { miminOwnedTabIds: [...ownedTabIds] });
			} catch {
				// ignore
			}
		}
	}

	async function unmarkTabOwned(tabId) {
		if (tabId == null) return;
		ownedTabIds.delete(tabId);
		const storage = extensionApi?.storage?.session ?? extensionApi?.storage?.local;
		if (storage) {
			try {
				await apiCall(storage, 'set', { miminOwnedTabIds: [...ownedTabIds] });
			} catch {
				// ignore
			}
		}
	}

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
			void unmarkTabOwned(closedTabId);
			if (closedTabId === lastTabId) {
				void persistTabId(null);
			}
		});
	}

	async function findReusableTab(preferredTabId) {
		// 1. Check preferredTabId supplied by Mimin
		if (preferredTabId != null) {
			try {
				const tab = await apiCall(extensionApi.tabs, 'get', preferredTabId);
				if (tab?.id && ownedTabIds.has(tab.id)) {
					return tab;
				}
			} catch {
				// preferred tab is gone
			}
		}

		// 2. Fallback to existing lastTabId if owned
		if (lastTabId !== null) {
			try {
				const existing = await apiCall(extensionApi.tabs, 'get', lastTabId);
				if (existing?.id && ownedTabIds.has(existing.id)) {
					return existing;
				}
			} catch {
				lastTabId = null;
			}
		}

		// 3. Fallback to storage lastTabId if owned
		const storage = extensionApi?.storage?.session ?? extensionApi?.storage?.local;
		if (storage) {
			try {
				const stored = await apiCall(storage, 'get', 'lastTabId');
				if (stored?.lastTabId && ownedTabIds.has(stored.lastTabId)) {
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

		// Never hijack arbitrary user tabs via broad tabs.query
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
		if (!Object.hasOwn(SEARCH_ENGINES, resolvedEngine))
			throw new Error('Unsupported search engine.');
		if (typeof query !== 'string' || query.length > MAX_QUERY_LENGTH)
			throw new Error('Search query is invalid or too long.');
		const normalizedQuery = query.trim();
		if (!normalizedQuery)
			return resolvedEngine === 'scholar'
				? 'https://scholar.google.com/'
				: 'https://www.google.com/';
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
		const host = hostname
			.toLowerCase()
			.replace(/^\[|\]$/g, '')
			.replace(/\.$/, '');
		if (
			host === 'localhost' ||
			host.endsWith('.localhost') ||
			host.endsWith('.local') ||
			host.endsWith('.internal')
		)
			return true;
		if (
			host === '::1' ||
			host === '0.0.0.0' ||
			host === '::' ||
			/^::ffff:(?:127\.|10\.|192\.168\.|169\.254\.)/i.test(host) ||
			/^::ffff:172\.(1[6-9]|2\d|3[0-1])\./i.test(host) ||
			/^(fc|fd)[0-9a-f]{2}:/i.test(host) ||
			/^fe8[0-9a-f]:/i.test(host)
		)
			return true;
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

	async function hasHostPermission(url) {
		if (isReadableGoogleUrl(url)) return true;
		if (!extensionApi?.permissions?.contains) return false;
		try {
			const origin = new URL(url).origin;
			const hasOrigin = await apiCall(extensionApi.permissions, 'contains', {
				origins: [`${origin}/*`]
			}).catch(() => false);
			if (hasOrigin) return true;
			const hasAll = await apiCall(extensionApi.permissions, 'contains', {
				origins: ['http://*/*', 'https://*/*']
			}).catch(() => false);
			return Boolean(hasAll);
		} catch {
			return false;
		}
	}

	async function checkPublicWebsitePermission() {
		if (!extensionApi?.permissions?.contains) return false;
		try {
			const hasAll = await apiCall(extensionApi.permissions, 'contains', {
				origins: ['http://*/*', 'https://*/*']
			}).catch(() => false);
			return Boolean(hasAll);
		} catch {
			return false;
		}
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

	function googleSearchSnapshot() {
		const normalize = (value, limit) => (value ?? '').replace(/\s+/g, ' ').trim().slice(0, limit);
		const limitUrl = (value) => (value ?? '').slice(0, 4_000);
		const links = [];
		const seenLinks = new Set();
		for (const anchor of document.querySelectorAll('a[href]')) {
			const raw = anchor.getAttribute('href');
			if (!raw) continue;
			let resolved;
			try {
				resolved = new URL(raw, location.href).href;
			} catch {
				continue;
			}
			let parsed;
			try {
				parsed = new URL(resolved);
			} catch {
				continue;
			}
			if (!['http:', 'https:'].includes(parsed.protocol)) continue;
			const title = normalize(anchor.textContent, 240);
			if (!title || seenLinks.has(resolved)) continue;
			seenLinks.add(resolved);
			links.push({ title, url: limitUrl(resolved) });
			if (links.length >= 100) break;
		}

		const results = [];
		const seenResults = new Set();
		for (const root of document.querySelectorAll('.MjjYud, .g, .gs_ri')) {
			const anchor = root.querySelector('h3 a[href], h3.gs_rt a[href], a[href]');
			const title = normalize(anchor?.textContent, 300);
			const rawUrl = anchor?.getAttribute('href');
			if (!rawUrl || !title) continue;
			let resolvedUrl;
			try {
				resolvedUrl = new URL(rawUrl, location.href).href;
			} catch {
				continue;
			}
			if (seenResults.has(resolvedUrl)) continue;
			seenResults.add(resolvedUrl);
			const snippet = normalize(
				root.querySelector('.VwiC3b, .gs_rs, [data-sncf]')?.textContent,
				4_000
			);
			results.push({ title, url: limitUrl(resolvedUrl), snippet });
			if (results.length >= 100) break;
		}

		const text = normalize(document.body?.innerText, 20_000);
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

	function genericPageSnapshot() {
		const normalize = (value, limit) => (value ?? '').replace(/\s+/g, ' ').trim().slice(0, limit);
		const limitUrl = (value) => (value ?? '').slice(0, 4_000);

		const IGNORED_TAGS = new Set(['SCRIPT', 'STYLE', 'NOSCRIPT', 'SVG', 'TEMPLATE']);

		function extractCleanText(rootNode, limit) {
			if (!rootNode) return '';
			if (typeof document.createTreeWalker === 'function') {
				const NodeFilterConst = globalThis.NodeFilter ?? {
					SHOW_ELEMENT: 1,
					SHOW_TEXT: 4,
					FILTER_ACCEPT: 1,
					FILTER_REJECT: 2,
					FILTER_SKIP: 3
				};
				const walker = document.createTreeWalker(
					rootNode,
					NodeFilterConst.SHOW_ELEMENT | NodeFilterConst.SHOW_TEXT,
					{
						acceptNode(node) {
							if (node.nodeType === 1 /* Node.ELEMENT_NODE */) {
								const tagName = (node.tagName || '').toUpperCase();
								if (IGNORED_TAGS.has(tagName)) {
									return NodeFilterConst.FILTER_REJECT;
								}
								return NodeFilterConst.FILTER_SKIP;
							}
							if (node.nodeType === 3 /* Node.TEXT_NODE */) {
								const val = node.nodeValue;
								if (!val || !val.trim()) return NodeFilterConst.FILTER_SKIP;
								return NodeFilterConst.FILTER_ACCEPT;
							}
							return NodeFilterConst.FILTER_SKIP;
						}
					}
				);
				const chunks = [];
				let accumulated = 0;
				let currentNode;
				while ((currentNode = walker.nextNode())) {
					const str = (currentNode.nodeValue || '').replace(/\s+/g, ' ');
					if (str.trim()) {
						chunks.push(str.trim());
						accumulated += str.length + 1;
						if (accumulated >= limit * 2) break;
					}
				}
				return chunks.join(' ').replace(/\s+/g, ' ').trim().slice(0, limit);
			}
			return normalize(rootNode.innerText ?? rootNode.textContent, limit);
		}

		const contentRoot = document.querySelector('article, main, [role="main"]');
		let text = '';
		if (contentRoot) {
			text = extractCleanText(contentRoot, 20_000);
		}
		if (!text && document.body) {
			text = extractCleanText(document.body, 20_000);
		}

		const links = [];
		const seenLinks = new Set();
		for (const anchor of document.querySelectorAll('a[href]')) {
			const raw = anchor.getAttribute('href');
			if (!raw) continue;
			let resolved;
			try {
				resolved = new URL(raw, location.href).href;
			} catch {
				continue;
			}
			let parsed;
			try {
				parsed = new URL(resolved);
			} catch {
				continue;
			}
			if (!['http:', 'https:'].includes(parsed.protocol)) continue;
			const title = normalize(anchor.textContent, 240);
			if (!title || seenLinks.has(resolved)) continue;
			seenLinks.add(resolved);
			links.push({ title, url: limitUrl(resolved) });
			if (links.length >= 100) break;
		}

		const lowered = `${location.href} ${document.title} ${text}`.toLowerCase();
		return {
			url: limitUrl(location.href),
			title: normalize(document.title, 300),
			text,
			links,
			results: [],
			captcha:
				/captcha|unusual traffic|not a robot|verify you are human|turnstile|cloudflare\s+ray/i.test(
					lowered
				)
		};
	}

	async function readSnapshot(tabId, finalUrl, isGoogle) {
		const snapshotFunc = isGoogle ? googleSearchSnapshot : genericPageSnapshot;
		const executions = await apiCall(extensionApi.scripting, 'executeScript', {
			target: { tabId },
			func: snapshotFunc
		});
		const snapshot = executions?.[0]?.result;
		if (!snapshot || typeof snapshot !== 'object')
			throw new Error(
				isGoogle
					? 'The Google page did not return a readable snapshot.'
					: 'The webpage did not return a readable snapshot.'
			);
		if (snapshot.captcha)
			throw new Error(
				isGoogle
					? 'Google returned a CAPTCHA or unusual-traffic page; Mimin will not bypass it.'
					: 'The page returned a CAPTCHA or bot detection challenge; Mimin will not bypass it.'
			);
		return { ...snapshot, readable: true, tabId };
	}

	async function openTab(url, options = {}) {
		const active = Boolean(options.active);
		const reuse = options.reuse ?? true;
		let tab = null;
		let isNewTab = false;

		if (reuse) {
			const existing = await findReusableTab(options.preferredTabId);
			if (existing?.id) {
				try {
					const updateProps = { url };
					if (active) updateProps.active = true;
					const isSameUrl = existing.url === url;
					tab = await apiCall(extensionApi.tabs, 'update', existing.id, updateProps);
					await persistTabId(existing.id);
					await markTabOwned(existing.id);
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
			await markTabOwned(tab.id);
			isNewTab = true;
		}

		await waitForTabLoad(tab.id, isNewTab);

		// Read final tab URL after navigation/redirects complete
		let currentTab;
		try {
			currentTab = await apiCall(extensionApi.tabs, 'get', tab.id);
		} catch {
			currentTab = null;
		}
		const finalUrl = currentTab?.url || url;

		// Validate final URL to ensure it remains an allowed public HTTP/HTTPS URL
		let validatedFinalUrl;
		try {
			validatedFinalUrl = validatePublicUrl(finalUrl);
		} catch (err) {
			throw new Error(
				`Redirected to disallowed URL: ${err instanceof Error ? err.message : 'Disallowed URL'}`,
				{ cause: err }
			);
		}

		// Verify host permission for the final origin
		const isGoogle = isReadableGoogleUrl(validatedFinalUrl);
		const hasPermission = isGoogle || (await hasHostPermission(validatedFinalUrl));

		let snapshot;
		if (!hasPermission) {
			snapshot = {
				url: validatedFinalUrl.slice(0, 4_000),
				title: (currentTab?.title ?? '').slice(0, 300),
				text: '',
				links: [],
				results: [],
				readable: false,
				reason: 'host_permission_required',
				tabId: tab.id
			};
		} else {
			snapshot = await readSnapshot(tab.id, validatedFinalUrl, isGoogle);
		}

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
			if (request.action === 'ping') {
				const publicWebsites = await checkPublicWebsitePermission();
				return successResponse({
					version: config.version,
					permissions: { google: true, publicWebsites }
				});
			}
			if (request.action === 'browser_search') {
				const url = buildSearchUrl(args.engine, args.query ?? '');
				return successResponse(
					await openTab(url, {
						preferredTabId: args.preferredTabId,
						active: Boolean(args.active),
						autoClose: Boolean(args.autoClose)
					})
				);
			}
			if (request.action === 'browser_open') {
				const url = validatePublicUrl(args.url);
				return successResponse(
					await openTab(url, {
						preferredTabId: args.preferredTabId,
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
			void (async () => {
				const publicWebsites = await checkPublicWebsitePermission();
				sendResponse(
					successResponse({
						version: config.version,
						allowedOrigins: config.allowedOrigins,
						permissions: { google: true, publicWebsites }
					})
				);
			})();
			return true;
		}
		if (message?.type !== 'mimin:request') return false;
		void handleRequest(message.request, sender).then(sendResponse);
		return true;
	});
})();
