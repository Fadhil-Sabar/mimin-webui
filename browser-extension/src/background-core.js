(() => {
	const extensionApi = globalThis.browser ?? globalThis.chrome;
	const config = globalThis.MIMIN_EXTENSION_CONFIG ?? { version: '0.4.2', allowedOrigins: [] };
	const MAX_QUERY_LENGTH = 500;
	const LOAD_TIMEOUT_MS = 15_000;
	const INTERACTION_SETTLE_MS = 350;
	const TAB_SETTLE_TIMEOUT_MS = 4_000;
	const RENDER_POLL_INTERVAL_MS = 100;
	const RENDER_TIMEOUT_MS = 4_000;
	const MAX_WAIT_MS = 10_000;
	const MAX_TABS = 50;
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
				// fall through to callback pattern
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

	function errorResponse(message) {
		return { ok: false, error: message };
	}

	/**
	 * Read a message off a thrown value without `instanceof Error`. Errors here can
	 * come from the browser API in another realm, where `instanceof` is false and
	 * the message would be replaced by a useless generic fallback.
	 */
	function errorMessage(error, fallback) {
		if (error && typeof error === 'object') {
			const message = error.message;
			if (typeof message === 'string' && message.trim()) return message;
		}
		if (typeof error === 'string' && error.trim()) return error;
		return fallback;
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

	/**
	 * Wait for a navigation we just started to commit.
	 *
	 * `tabs.get().status` still reports "complete" for the document being
	 * navigated away from, so accepting that as "loaded" returns immediately and
	 * the following read runs against the old page. That is worse than merely
	 * stale: the ref registry lives in the old document's injected world, so the
	 * next interaction reports a missing element once the new page replaces it.
	 *
	 * A commit means the tab finished loading *and* its URL is no longer the one
	 * we navigated away from. Requiring both keeps this correct whether the
	 * browser reports the new URL before or only after the new document commits.
	 */
	function waitForNavigationCommit(tabId, previousUrl, timeoutMs) {
		return new Promise((resolve, reject) => {
			let finished = false;
			let timer;
			const committed = (tab) => {
				if (!tab || tab.status !== 'complete') return false;
				const url = tabUrl(tab.url);
				return Boolean(url) && url !== previousUrl;
			};
			const inspect = () => {
				void apiCall(extensionApi.tabs, 'get', tabId).then(
					(tab) => {
						if (committed(tab)) finish();
					},
					() => undefined
				);
			};
			const finish = () => {
				if (finished) return;
				finished = true;
				clearTimeout(timer);
				clearInterval(poll);
				extensionApi.tabs.onUpdated.removeListener(onUpdated);
				extensionApi.tabs.onRemoved.removeListener(onRemoved);
				resolve();
			};
			const fail = (error) => {
				if (finished) return;
				finished = true;
				clearTimeout(timer);
				clearInterval(poll);
				extensionApi.tabs.onUpdated.removeListener(onUpdated);
				extensionApi.tabs.onRemoved.removeListener(onRemoved);
				reject(error);
			};
			const onUpdated = (updatedTabId) => {
				if (updatedTabId === tabId) inspect();
			};
			const onRemoved = (removedTabId) => {
				if (removedTabId === tabId) fail(new Error('The browser tab was closed while loading.'));
			};
			extensionApi.tabs.onUpdated.addListener(onUpdated);
			extensionApi.tabs.onRemoved.addListener(onRemoved);
			// Some browsers commit so quickly that no event is observed, and others
			// coalesce events for background tabs, so poll as well.
			const poll = setInterval(inspect, 100);
			timer = setTimeout(
				() =>
					fail(
						new Error(
							'The page did not finish navigating in time, so nothing was read from it. Check the URL and try again.'
						)
					),
				timeoutMs
			);
			inspect();
		});
	}

	/**
	 * Injected into a tab. Returns a readable snapshot plus a ref registry for
	 * interactive elements so later actions can target them reliably.
	 */
	function pageSnapshot(options) {
		const isGoogle = Boolean(options && options.google);
		const normalize = (value, limit) => (value ?? '').replace(/\s+/g, ' ').trim().slice(0, limit);
		const limitUrl = (value) => (value ?? '').slice(0, 4_000);

		const IGNORED_TAGS = new Set(['SCRIPT', 'STYLE', 'NOSCRIPT', 'SVG', 'TEMPLATE']);
		const INTERACTIVE_SELECTOR = [
			'a[href]',
			'button',
			'input:not([type="hidden"])',
			'textarea',
			'select',
			'summary',
			'[contenteditable="true"]',
			'[role="button"]',
			'[role="link"]',
			'[role="checkbox"]',
			'[role="radio"]',
			'[role="tab"]',
			'[role="menuitem"]',
			'[role="switch"]'
		].join(', ');

		function escapeCss(value) {
			if (globalThis.CSS && typeof globalThis.CSS.escape === 'function')
				return globalThis.CSS.escape(value);
			return String(value).replace(/[^a-zA-Z0-9_-]/g, (character) => `\\${character}`);
		}

		function cssPath(element) {
			const parts = [];
			let node = element;
			while (node && node.nodeType === 1 && parts.length < 6) {
				const tag = (node.tagName || '').toLowerCase();
				if (!tag) break;
				let part = tag;
				const id = node.getAttribute?.('id');
				if (id) {
					parts.unshift(`${part}#${escapeCss(id)}`);
					break;
				}
				const parent = node.parentElement;
				if (parent) {
					const siblings = [];
					for (const child of parent.children || [])
						if (child.tagName === node.tagName) siblings.push(child);
					if (siblings.length > 1) part += `:nth-of-type(${siblings.indexOf(node) + 1})`;
				}
				parts.unshift(part);
				node = parent;
			}
			return parts.join(' > ');
		}

		function isVisible(element) {
			if (element.hidden) return false;
			const style =
				typeof globalThis.getComputedStyle === 'function'
					? globalThis.getComputedStyle(element)
					: null;
			if (style) {
				if (style.display === 'none' || style.visibility === 'hidden') return false;
				const opacity = Number(style.opacity);
				if (Number.isFinite(opacity) && opacity === 0) return false;
			}
			if (typeof element.getBoundingClientRect === 'function') {
				const rect = element.getBoundingClientRect();
				if (rect && rect.width <= 0 && rect.height <= 0) return false;
			}
			return true;
		}

		function labelFor(element) {
			const candidates = [
				element.getAttribute?.('aria-label'),
				element.getAttribute?.('placeholder'),
				element.getAttribute?.('title'),
				element.getAttribute?.('name'),
				element.innerText,
				element.value,
				element.textContent
			];
			for (const candidate of candidates) {
				const text = normalize(candidate, 240);
				if (text) return text;
			}
			return '';
		}

		function collectInteractive(root) {
			const registry = [];
			const elements = [];
			if (!root || typeof root.querySelectorAll !== 'function') {
				globalThis.__miminElementRefs = registry;
				return elements;
			}
			for (const element of root.querySelectorAll(INTERACTIVE_SELECTOR)) {
				if (elements.length >= 200) break;
				if (!isVisible(element)) continue;
				registry.push(element);
				let selector = '';
				try {
					selector = cssPath(element).slice(0, 400);
				} catch {
					// Elements without a stable path are still addressable by ref.
				}
				const type = element.getAttribute?.('type');
				const disabled = Boolean(
					element.disabled || element.getAttribute?.('aria-disabled') === 'true'
				);
				elements.push({
					ref: registry.length - 1,
					tag: (element.tagName || '').toLowerCase(),
					name: labelFor(element),
					type: type || undefined,
					disabled: disabled || undefined,
					selector: selector || undefined
				});
			}
			globalThis.__miminElementRefs = registry;
			return elements;
		}

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
							if (node.nodeType === 1) {
								const tagName = (node.tagName || '').toUpperCase();
								if (IGNORED_TAGS.has(tagName)) return NodeFilterConst.FILTER_REJECT;
								return NodeFilterConst.FILTER_SKIP;
							}
							if (node.nodeType === 3) {
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

		function collectLinks() {
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
			return links;
		}

		function collectGoogleResults() {
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
			return results;
		}

		let text = '';
		if (isGoogle) {
			text = normalize(document.body?.innerText, 20_000);
		} else {
			const contentRoot = document.querySelector('article, main, [role="main"]');
			if (contentRoot) text = extractCleanText(contentRoot, 20_000);
			if (!text && document.body) text = extractCleanText(document.body, 20_000);
		}

		const lowered = `${location.href} ${document.title} ${text}`.toLowerCase();
		return {
			url: limitUrl(location.href),
			title: normalize(document.title, 300),
			text,
			links: collectLinks(),
			results: isGoogle ? collectGoogleResults() : [],
			elements: collectInteractive(document.body || document.documentElement),
			captcha: isGoogle
				? /captcha|unusual traffic|not a robot|sorry\.google\.com/.test(lowered)
				: /captcha|unusual traffic|not a robot|verify you are human|turnstile|cloudflare\s+ray/i.test(
						lowered
					)
		};
	}

	/**
	 * Injected into a tab to fingerprint the page before and after an interaction.
	 *
	 * A scripted interaction can be accepted by the DOM yet ignored by the site's
	 * own code: Google Maps, for example, keeps its search box value but only
	 * reacts to a real key press. Comparing two fingerprints lets the result say
	 * "nothing changed" instead of reporting a success the model would repeat.
	 */
	function pageDigest() {
		const text = (document.body?.innerText || '').replace(/\s+/g, ' ').slice(0, 20_000);
		let hash = 2_166_136_261;
		for (let index = 0; index < text.length; index += 1) {
			hash ^= text.charCodeAt(index);
			hash = Math.imul(hash, 16_777_619);
		}
		return { url: location.href, length: text.length, hash: hash >>> 0 };
	}

	/**
	 * Injected into a tab to perform one interaction. Resolves targets through the
	 * ref registry written by pageSnapshot, then falls back to selector or label text.
	 */
	function interactPage(payload) {
		const action = payload && payload.action;

		function setNativeValue(element, value) {
			const prototype = Object.getPrototypeOf(element);
			const descriptor = prototype && Object.getOwnPropertyDescriptor(prototype, 'value');
			if (descriptor && typeof descriptor.set === 'function') descriptor.set.call(element, value);
			else element.value = value;
		}

		function fill(element, value) {
			setNativeValue(element, value);
			element.dispatchEvent(new Event('input', { bubbles: true }));
			element.dispatchEvent(new Event('change', { bubbles: true }));
		}

		function pressKey(element, key) {
			const init = { key, code: key, bubbles: true, cancelable: true };
			element.dispatchEvent(new KeyboardEvent('keydown', init));
			element.dispatchEvent(new KeyboardEvent('keypress', init));
			element.dispatchEvent(new KeyboardEvent('keyup', init));
		}

		/**
		 * Candidates must match the names a snapshot shows for the same element,
		 * because the model reads a name there and may pass it back as `text`.
		 * Leaving out `placeholder` made typing into a field by its displayed name
		 * impossible: the snapshot said `input "Email address"` while the matcher
		 * could not see it.
		 */
		function normalizeLabel(element) {
			return [
				element.getAttribute?.('aria-label'),
				element.getAttribute?.('placeholder'),
				element.getAttribute?.('title'),
				element.getAttribute?.('name'),
				element.value,
				element.innerText,
				element.textContent
			]
				.filter(Boolean)
				.join(' ')
				.replace(/\s+/g, ' ')
				.trim()
				.toLowerCase()
				.slice(0, 300);
		}

		// Labels that usually mean "act on me": controls, links, and clickable rows.
		const CLICKABLE_LABELS =
			'a,button,summary,label,[role="button"],[role="link"],input[type="submit"],input[type="button"]';
		// Fields that text can actually be typed into. Kept separate so a click by
		// label cannot accidentally land on a text box.
		const EDITABLE_LABELS =
			'input:not([type="hidden"]),textarea,select,[contenteditable=""],[contenteditable="true"]';

		/** True when the element is actually rendered, not merely present. */
		function isRendered(element) {
			if (element.hidden) return false;
			const style =
				typeof globalThis.getComputedStyle === 'function'
					? globalThis.getComputedStyle(element)
					: null;
			if (style && (style.display === 'none' || style.visibility === 'hidden')) return false;
			if (typeof element.getBoundingClientRect === 'function') {
				const rect = element.getBoundingClientRect();
				if (rect && rect.width <= 0 && rect.height <= 0) return false;
			}
			return true;
		}

		function findTarget(options = {}) {
			if (typeof payload.ref === 'number') {
				const list = globalThis.__miminElementRefs;
				const element = Array.isArray(list) ? list[payload.ref] : undefined;
				if (element && element.isConnected !== false) return element;
			}
			if (typeof payload.selector === 'string' && payload.selector) {
				try {
					const element = document.querySelector(payload.selector);
					if (element) return element;
				} catch {
					/* invalid selector */
				}
			}
			if (typeof payload.text === 'string' && payload.text) {
				const wanted = payload.text.toLowerCase();
				const selector = options.editable
					? `${CLICKABLE_LABELS},${EDITABLE_LABELS}`
					: CLICKABLE_LABELS;
				for (const element of document.querySelectorAll(selector)) {
					const label = normalizeLabel(element);
					if (!label || !label.includes(wanted)) continue;
					// Label matching is a convenience for the model. Never act on
					// something the page is not showing, since the snapshot would not
					// have listed it either.
					if (isRendered(element)) return element;
				}
			}
			return null;
		}

		/**
		 * A ref only means something for the snapshot it came from; the registry
		 * lives in this document's injected world and dies with the document. When
		 * the page has moved on, say so instead of leaving the caller to retry the
		 * same doomed call.
		 */
		function missingTarget(options = {}) {
			if (typeof payload.ref === 'number') {
				const reason = Array.isArray(globalThis.__miminElementRefs)
					? `Ref ${payload.ref} does not match anything on this page any more.`
					: `Ref ${payload.ref} cannot be used because this tab has not been read since the page changed, so the reference is stale.`;
				return `${reason} Read the tab again to get current refs.`;
			}
			if (options.editable) {
				return 'No editable field matched that text. Read the tab and pass the ref of the field instead of its label.';
			}
			return 'No element matched. Read the tab again to see the elements it now has.';
		}

		let target;
		if (action === 'click') {
			target = findTarget();
			if (!target) return { ok: false, error: missingTarget() };
			try {
				target.scrollIntoView({ block: 'center', inline: 'center' });
			} catch {
				/* ignore */
			}
			target.focus?.();
			if ((target.tagName || '').toUpperCase() === 'SELECT') fill(target, payload.value ?? '');
			else target.click();
			return { ok: true, action, performed: 'clicked' };
		}

		if (action === 'type') {
			target = findTarget({ editable: true });
			if (!target) return { ok: false, error: missingTarget({ editable: true }) };
			target.focus?.();
			if (typeof target.select === 'function') {
				try {
					target.select();
				} catch {
					/* ignore */
				}
			}
			fill(target, typeof payload.text === 'string' ? payload.text : '');
			if (payload.submit) {
				pressKey(target, 'Enter');
				if (target.form && typeof target.form.requestSubmit === 'function') {
					try {
						target.form.requestSubmit();
					} catch {
						/* ignore */
					}
				}
			}
			return { ok: true, action, performed: 'typed' };
		}

		if (action === 'select') {
			target = findTarget({ editable: true });
			if (!target) return { ok: false, error: missingTarget({ editable: true }) };
			target.focus?.();
			fill(target, String(payload.value ?? payload.text ?? ''));
			return { ok: true, action, performed: 'selected' };
		}

		if (action === 'press') {
			const element = document.activeElement || document.body;
			pressKey(element, payload.key || 'Enter');
			return { ok: true, action, performed: 'pressed' };
		}

		if (action === 'hover') {
			target = findTarget();
			if (!target) return { ok: false, error: missingTarget() };
			try {
				target.scrollIntoView({ block: 'center' });
			} catch {
				/* ignore */
			}
			for (const type of ['mouseover', 'mouseenter', 'mousemove'])
				target.dispatchEvent(new MouseEvent(type, { bubbles: true }));
			return { ok: true, action, performed: 'hovered' };
		}

		if (action === 'scroll') {
			const amount = typeof payload.amount === 'number' ? payload.amount : 600;
			const direction = payload.direction || 'down';
			if (direction === 'top') globalThis.scrollTo({ top: 0, behavior: 'instant' });
			else if (direction === 'bottom')
				globalThis.scrollTo({ top: document.body?.scrollHeight ?? 0, behavior: 'instant' });
			else globalThis.scrollBy({ top: direction === 'up' ? -amount : amount, behavior: 'instant' });
			return { ok: true, action, performed: 'scrolled' };
		}

		if (action === 'wait' || action === 'read') return { ok: true, action, performed: action };

		return { ok: false, error: `Unsupported interaction: ${action}` };
	}
	/** True when the action is expected to alter the page. */
	function shouldVerifyChange(args) {
		const action = args?.action;
		if (action === 'click' || action === 'select' || action === 'press' || action === 'scroll')
			return true;
		if (action === 'navigate' || action === 'back' || action === 'forward' || action === 'reload')
			return true;
		return action === 'type' && Boolean(args.submit);
	}

	/** Fingerprint a tab, or null when the page cannot be read. */
	async function readPageDigest(tabId) {
		try {
			const executions = await apiCall(extensionApi.scripting, 'executeScript', {
				target: { tabId },
				func: pageDigest
			});
			return executions?.[0]?.result ?? null;
		} catch {
			return null;
		}
	}

	async function readSnapshot(tabId, finalUrl, isGoogle) {
		const executions = await apiCall(extensionApi.scripting, 'executeScript', {
			target: { tabId },
			func: pageSnapshot,
			args: [{ google: Boolean(isGoogle) }]
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

	function snapshotHasContent(snapshot) {
		return Boolean(snapshot?.text?.trim()) || Boolean(snapshot?.elements?.length);
	}

	/**
	 * A committed document can still be an empty client-side shell. Keep reading
	 * until text or an interactive element appears, but never wait indefinitely.
	 */
	async function readRenderedSnapshot(tabId, finalUrl, isGoogle, minimumWaitMs = 0) {
		const startedAt = Date.now();
		const minimumUntil = startedAt + minimumWaitMs;
		const deadline = startedAt + Math.max(RENDER_TIMEOUT_MS, minimumWaitMs);
		let latest = null;
		let rejectClosed;
		const closed = new Promise((_, reject) => {
			rejectClosed = reject;
		});
		const onRemoved = (removedTabId) => {
			if (removedTabId === tabId)
				rejectClosed(
					new Error('The browser tab was closed while waiting for page content to render.')
				);
		};
		const removedEvents = extensionApi.tabs?.onRemoved;
		if (removedEvents?.addListener) removedEvents.addListener(onRemoved);
		try {
			while (Date.now() < deadline) {
				latest = await readSnapshot(tabId, finalUrl, isGoogle);
				if (snapshotHasContent(latest) && Date.now() >= minimumUntil) return latest;
				const remaining = Math.max(0, deadline - Date.now());
				if (!remaining) break;
				await Promise.race([delay(Math.min(RENDER_POLL_INTERVAL_MS, remaining)), closed]);
			}
			if (!latest) latest = await readSnapshot(tabId, finalUrl, isGoogle);
			return snapshotHasContent(latest) ? latest : { ...latest, renderingPending: true };
		} catch (error) {
			if (error?.message?.includes('closed while waiting for page content')) throw error;
			try {
				await apiCall(extensionApi.tabs, 'get', tabId);
			} catch {
				throw new Error('The browser tab was closed while waiting for page content to render.');
			}
			throw error;
		} finally {
			if (removedEvents?.removeListener) removedEvents.removeListener(onRemoved);
		}
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
					const previousUrl = tabUrl(existing.url);
					const updateProps = { url };
					if (active) updateProps.active = true;
					const isSameUrl = existing.url === url;
					tab = await apiCall(extensionApi.tabs, 'update', existing.id, updateProps);
					await persistTabId(existing.id);
					await markTabOwned(existing.id);
					if (isSameUrl) {
						await apiCall(extensionApi.tabs, 'reload', existing.id).catch(() => {});
						await waitForTabSettled(existing.id, TAB_SETTLE_TIMEOUT_MS);
					} else {
						await waitForNavigationCommit(existing.id, previousUrl, LOAD_TIMEOUT_MS);
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

		if (isNewTab) await waitForTabLoad(tab.id, true);

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
			throw new Error(`Redirected to disallowed URL: ${errorMessage(err, 'Disallowed URL')}`, {
				cause: err
			});
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
			snapshot = await readRenderedSnapshot(tab.id, validatedFinalUrl, isGoogle);
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

	function delay(ms) {
		return new Promise((resolve) => setTimeout(resolve, ms));
	}

	/** Wait until a tab finishes loading, or give up after timeoutMs. */
	async function waitForTabSettled(tabId, timeoutMs) {
		try {
			const current = await apiCall(extensionApi.tabs, 'get', tabId);
			if (current?.status === 'complete') return;
		} catch {
			return;
		}
		await new Promise((resolve) => {
			let done = false;
			const finish = () => {
				if (done) return;
				done = true;
				clearTimeout(timer);
				extensionApi.tabs.onUpdated.removeListener(onUpdated);
				resolve();
			};
			const onUpdated = (updatedTabId, changeInfo) => {
				if (updatedTabId === tabId && changeInfo.status === 'complete') finish();
			};
			extensionApi.tabs.onUpdated.addListener(onUpdated);
			const timer = setTimeout(finish, timeoutMs);
		});
	}

	/** Pick the tab a request refers to: explicit id, url match, active tab, then session tab. */
	async function resolveTab(args = {}) {
		if (args.tabId !== undefined && args.tabId !== null) {
			// An explicit tabId is authoritative: never fall back to a different tab.
			try {
				const tab = await apiCall(extensionApi.tabs, 'get', args.tabId);
				if (tab?.id !== undefined && tab.id !== null) return tab;
			} catch {
				// fall through to the null return below
			}
			return null;
		}

		if (typeof args.urlIncludes === 'string' && args.urlIncludes.trim()) {
			const needle = args.urlIncludes.trim().toLowerCase();
			try {
				const tabs = await apiCall(extensionApi.tabs, 'query', {});
				const match = (tabs || []).find(
					(tab) => typeof tab.url === 'string' && tab.url.toLowerCase().includes(needle)
				);
				if (match?.id !== undefined && match.id !== null) return match;
			} catch {
				// ignore and continue
			}
		}

		if (args.active) {
			try {
				const tabs = await apiCall(extensionApi.tabs, 'query', {
					active: true,
					currentWindow: true
				});
				if (tabs?.[0]?.id !== undefined) return tabs[0];
			} catch {
				// ignore and continue
			}
		}

		// Mimin tracks the last tab per conversation. Honor it before the generic
		// fallbacks, but do not adopt it: only tabs Mimin opened may be reused for
		// navigation by browser_open.
		if (args.preferredTabId !== undefined && args.preferredTabId !== null) {
			try {
				const tab = await apiCall(extensionApi.tabs, 'get', args.preferredTabId);
				if (tab?.id !== undefined && tab.id !== null) return tab;
			} catch {
				// the conversation's previous tab is gone; fall back
			}
		}

		const reusable = await findReusableTab(null);
		if (reusable?.id !== undefined && reusable.id !== null) return reusable;

		try {
			const tabs = await apiCall(extensionApi.tabs, 'query', {
				active: true,
				currentWindow: true
			});
			if (tabs?.[0]?.id !== undefined) return tabs[0];
		} catch {
			// no tab available
		}
		return null;
	}

	function tabUrl(value) {
		return typeof value === 'string' && /^https?:\/\//i.test(value) ? value : null;
	}

	async function listTabs(limit) {
		const tabs = await apiCall(extensionApi.tabs, 'query', {});
		const summaries = [];
		for (const tab of tabs || []) {
			if (tab?.id === undefined || tab.id === null) continue;
			const rawUrl = tabUrl(tab.url);
			if (tab.url && !rawUrl) continue; // skip internal pages we cannot read
			let url = null;
			if (rawUrl) {
				try {
					url = validatePublicUrl(rawUrl);
				} catch {
					continue; // never expose private or local addresses
				}
			}
			const readable = url ? isReadableGoogleUrl(url) || (await hasHostPermission(url)) : false;
			summaries.push({
				tabId: tab.id,
				title: (tab.title ?? '').slice(0, 500),
				url: url ? url.slice(0, 2_048) : undefined,
				active: Boolean(tab.active),
				pinned: Boolean(tab.pinned),
				readable,
				reason: readable ? undefined : url ? 'host_permission_required' : 'url_hidden'
			});
		}
		summaries.sort(
			(a, b) => Number(b.active) - Number(a.active) || Number(a.tabId) - Number(b.tabId)
		);
		const bounded =
			typeof limit === 'number' && Number.isFinite(limit)
				? Math.max(1, Math.min(50, Math.floor(limit)))
				: 50;
		const active = summaries.find((summary) => summary.active);
		return {
			tabs: summaries.slice(0, bounded),
			tabId: active?.tabId
		};
	}

	function unreadableResult(tab, url, reason) {
		return {
			url: (url || '').slice(0, 4_000),
			title: (tab?.title ?? '').slice(0, 300),
			text: '',
			links: [],
			results: [],
			elements: [],
			readable: false,
			reason,
			tabId: tab?.id
		};
	}

	async function readTab(args) {
		const tab = await resolveTab(args);
		if (!tab) throw new Error('No matching open tab was found. Use browser_tabs to list tabs.');
		const rawUrl = tabUrl(tab.url);
		if (!rawUrl)
			throw new Error(
				'This tab is not readable. Grant public website access in the Mimin Browser Bridge popup, then retry.'
			);
		const finalUrl = validatePublicUrl(rawUrl);
		const isGoogle = isReadableGoogleUrl(finalUrl);
		if (!isGoogle && !(await hasHostPermission(finalUrl))) {
			return unreadableResult(tab, finalUrl, 'host_permission_required');
		}
		await persistTabId(tab.id);
		return readSnapshot(tab.id, finalUrl, isGoogle);
	}

	async function interactTab(args) {
		const tab = await resolveTab(args);
		if (!tab?.id) throw new Error('No matching open tab was found. Use browser_tabs to list tabs.');
		const rawUrl = tabUrl(tab.url);
		if (!rawUrl)
			throw new Error(
				'This tab is not readable. Grant public website access in the Mimin Browser Bridge popup, then retry.'
			);
		const finalUrl = validatePublicUrl(rawUrl);
		const isGoogle = isReadableGoogleUrl(finalUrl);
		if (!isGoogle && !(await hasHostPermission(finalUrl))) {
			return unreadableResult(tab, finalUrl, 'host_permission_required');
		}

		// Track the tab for this conversation without adopting it: a user tab the
		// agent clicked in must never become a reusable navigation target.
		await persistTabId(tab.id);
		// Actions that are supposed to change the page get fingerprinted first so
		// the result can report when the site ignored the interaction.
		const before = shouldVerifyChange(args) ? await readPageDigest(tab.id) : null;
		if (args.action === 'navigate') {
			const target = validatePublicUrl(args.url);
			await apiCall(extensionApi.tabs, 'update', tab.id, { url: target });
			// Wait for the new document, not for the old one's "complete" status.
			await waitForNavigationCommit(tab.id, finalUrl, LOAD_TIMEOUT_MS);
		} else if (args.action === 'back') {
			await apiCall(extensionApi.tabs, 'goBack', tab.id);
			await waitForTabSettled(tab.id, TAB_SETTLE_TIMEOUT_MS);
		} else if (args.action === 'forward') {
			await apiCall(extensionApi.tabs, 'goForward', tab.id);
			await waitForTabSettled(tab.id, TAB_SETTLE_TIMEOUT_MS);
		} else if (args.action === 'reload') {
			await apiCall(extensionApi.tabs, 'reload', tab.id);
			await waitForTabSettled(tab.id, TAB_SETTLE_TIMEOUT_MS);
		} else if (args.action === 'wait') {
			const waitMs =
				args.waitMs === undefined
					? 1_000
					: Math.min(Math.max(Number(args.waitMs) || 0, 0), MAX_WAIT_MS);
			await delay(waitMs);
		} else {
			let outcome;
			try {
				const executions = await apiCall(extensionApi.scripting, 'executeScript', {
					target: { tabId: tab.id },
					func: interactPage,
					args: [args]
				});
				outcome = executions?.[0]?.result;
			} catch (error) {
				// A click can start a navigation that destroys the injected context.
				outcome = { ok: true, action: args.action, performed: 'navigating' };
				if (!/context|frame|document|message port/i.test(error?.message ?? '')) throw error;
			}
			if (outcome && outcome.ok === false)
				throw new Error(outcome.error || 'The interaction could not be performed.');
			await delay(INTERACTION_SETTLE_MS);
		}

		await waitForTabSettled(tab.id, TAB_SETTLE_TIMEOUT_MS);
		const current = await apiCall(extensionApi.tabs, 'get', tab.id).catch(() => null);
		const settledUrl = validatePublicUrl(tabUrl(current?.url) || finalUrl);
		const minimumWaitMs =
			args.action === 'wait' ? 0 : Math.min(Math.max(Number(args.waitMs) || 0, 0), MAX_WAIT_MS);
		const result = await readRenderedSnapshot(
			tab.id,
			settledUrl,
			isReadableGoogleUrl(settledUrl),
			minimumWaitMs
		);
		if (before) {
			const after = await readPageDigest(tab.id);
			if (after) result.changed = before.url !== after.url || before.hash !== after.hash;
		}
		return result;
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
			if (request.action === 'browser_tabs_list') {
				return successResponse(await listTabs(args.limit ?? MAX_TABS));
			}
			if (request.action === 'browser_tab_read') {
				return successResponse(await readTab(args));
			}
			if (request.action === 'browser_tab_interact') {
				return successResponse(await interactTab(args));
			}
			return errorResponse('Unsupported bridge action.');
		} catch (error) {
			return errorResponse(errorMessage(error, 'Bridge request failed.'));
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

	// Opt-in seam for tests. Never populated in a real browser session.
	const testHooks = globalThis.MIMIN_EXTENSION_TEST_HOOKS;
	if (testHooks && typeof testHooks === 'object') {
		Object.assign(testHooks, {
			pageSnapshot,
			pageDigest,
			interactPage,
			listTabs,
			readTab,
			interactTab,
			resolveTab
		});
	}
})();
