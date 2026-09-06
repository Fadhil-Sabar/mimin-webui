/**
 * @param {string | null | undefined} hostname
 * @returns {boolean}
 */
export function isPrivateHost(hostname) {
	if (typeof hostname !== 'string') return true;
	const host = hostname
		.toLowerCase()
		.replace(/^\[|\]$/g, '')
		.replace(/\.$/, '');
	if (
		host === 'localhost' ||
		host.endsWith('.localhost') ||
		host.endsWith('.local') ||
		host.endsWith('.internal')
	) {
		return true;
	}
	if (
		host === '::1' ||
		host === '0.0.0.0' ||
		host === '::' ||
		/^::ffff:(?:127\.|10\.|192\.168\.|169\.254\.)/i.test(host) ||
		/^::ffff:172\.(1[6-9]|2\d|3[0-1])\./i.test(host) ||
		/^(fc|fd)[0-9a-f]{2}:/i.test(host) ||
		/^fe8[0-9a-f]:/i.test(host)
	) {
		return true;
	}
	const octets = host.split('.').map(Number);
	if (
		octets.length !== 4 ||
		octets.some((octet) => !Number.isInteger(octet) || octet < 0 || octet > 255)
	) {
		return false;
	}
	const [first, second] = octets;
	return (
		first === 10 ||
		first === 127 ||
		(first === 172 && second >= 16 && second <= 31) ||
		(first === 192 && second === 168) ||
		(first === 169 && second === 254)
	);
}

/**
 * @param {string | null | undefined} value
 * @returns {string}
 */
export function validatePublicUrl(value) {
	if (typeof value !== 'string' || value.length > 2_048) {
		throw new Error('URL is invalid or too long.');
	}
	let url;
	try {
		url = new URL(value);
	} catch {
		throw new Error('URL must be absolute.');
	}
	if (!['http:', 'https:'].includes(url.protocol)) {
		throw new Error('Only http(s) URLs can be opened.');
	}
	if (url.username || url.password) {
		throw new Error('URLs with credentials cannot be opened.');
	}
	if (isPrivateHost(url.hostname)) {
		throw new Error('Private or local URLs cannot be opened.');
	}
	return url.toString();
}

/**
 * @param {string | null | undefined} value
 * @returns {boolean}
 */
export function isReadableGoogleUrl(value) {
	try {
		const url = new URL(value ?? '');
		return (
			url.protocol === 'https:' && ['www.google.com', 'scholar.google.com'].includes(url.hostname)
		);
	} catch {
		return false;
	}
}

/**
 * @param {any} [doc]
 * @param {any} [loc]
 */
export function googleSearchSnapshot(doc, loc) {
	const currentDoc = doc ?? (typeof document !== 'undefined' ? document : null);
	const currentLoc = loc ?? (typeof location !== 'undefined' ? location : null);
	if (!currentDoc || !currentLoc) {
		throw new Error('DOM document or location is unavailable.');
	}

	/**
	 * @param {string | null | undefined} value
	 * @param {number} limit
	 */
	const normalize = (value, limit) => (value ?? '').replace(/\s+/g, ' ').trim().slice(0, limit);
	/**
	 * @param {string | null | undefined} value
	 */
	const limitUrl = (value) => (value ?? '').slice(0, 4_000);

	const links = [];
	const seenLinks = new Set();
	for (const anchor of currentDoc.querySelectorAll('a[href]')) {
		const raw = anchor.getAttribute('href');
		if (!raw) continue;
		let resolved;
		try {
			resolved = new URL(raw, currentLoc.href).href;
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
	for (const root of currentDoc.querySelectorAll('.MjjYud, .g, .gs_ri')) {
		const anchor = root.querySelector('h3 a[href], h3.gs_rt a[href], a[href]');
		const title = normalize(anchor?.textContent, 300);
		const rawUrl = anchor?.getAttribute('href');
		if (!rawUrl || !title) continue;
		let resolvedUrl;
		try {
			resolvedUrl = new URL(rawUrl, currentLoc.href).href;
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

	const text = normalize(currentDoc.body?.innerText, 20_000);
	const lowered = `${currentLoc.href} ${currentDoc.title} ${text}`.toLowerCase();
	return {
		url: limitUrl(currentLoc.href),
		title: normalize(currentDoc.title, 300),
		text,
		links,
		results,
		captcha: /captcha|unusual traffic|not a robot|sorry\.google\.com/.test(lowered)
	};
}

/**
 * @param {any} [doc]
 * @param {any} [loc]
 */
export function genericPageSnapshot(doc, loc) {
	const currentDoc = doc ?? (typeof document !== 'undefined' ? document : null);
	const currentLoc = loc ?? (typeof location !== 'undefined' ? location : null);
	if (!currentDoc || !currentLoc) {
		throw new Error('DOM document or location is unavailable.');
	}

	/**
	 * @param {string | null | undefined} value
	 * @param {number} limit
	 */
	const normalize = (value, limit) => (value ?? '').replace(/\s+/g, ' ').trim().slice(0, limit);
	/**
	 * @param {string | null | undefined} value
	 */
	const limitUrl = (value) => (value ?? '').slice(0, 4_000);

	const IGNORED_TAGS = new Set(['SCRIPT', 'STYLE', 'NOSCRIPT', 'SVG', 'TEMPLATE']);

	/**
	 * @param {any} rootNode
	 * @param {number} limit
	 */
	function extractCleanText(rootNode, limit) {
		if (!rootNode) return '';
		if (typeof currentDoc.createTreeWalker === 'function') {
			const NodeFilterConst = globalThis.NodeFilter ?? {
				SHOW_ELEMENT: 1,
				SHOW_TEXT: 4,
				FILTER_ACCEPT: 1,
				FILTER_REJECT: 2,
				FILTER_SKIP: 3
			};
			const walker = currentDoc.createTreeWalker(
				rootNode,
				NodeFilterConst.SHOW_ELEMENT | NodeFilterConst.SHOW_TEXT,
				{
					/**
					 * @param {any} node
					 */
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

	const contentRoot = currentDoc.querySelector('article, main, [role="main"]');
	let text = '';
	if (contentRoot) {
		text = extractCleanText(contentRoot, 20_000);
	}
	if (!text && currentDoc.body) {
		text = extractCleanText(currentDoc.body, 20_000);
	}

	const links = [];
	const seenLinks = new Set();
	for (const anchor of currentDoc.querySelectorAll('a[href]')) {
		const raw = anchor.getAttribute('href');
		if (!raw) continue;
		let resolved;
		try {
			resolved = new URL(raw, currentLoc.href).href;
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

	const lowered = `${currentLoc.href} ${currentDoc.title} ${text}`.toLowerCase();
	return {
		url: limitUrl(currentLoc.href),
		title: normalize(currentDoc.title, 300),
		text,
		links,
		results: [],
		captcha:
			/captcha|unusual traffic|not a robot|verify you are human|turnstile|cloudflare\s+ray/i.test(
				lowered
			)
	};
}
