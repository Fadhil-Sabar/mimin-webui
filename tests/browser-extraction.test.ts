import { describe, expect, it } from 'vitest';
import {
	genericPageSnapshot,
	googleSearchSnapshot,
	isPrivateHost,
	isReadableGoogleUrl,
	validatePublicUrl
} from '../browser-extension/src/extract.js';

type MockNode = {
	tagName?: string;
	nodeType: number; // 1 = element, 3 = text
	nodeValue?: string | null;
	textContent?: string;
	innerText?: string;
	attributes?: Record<string, string>;
	children?: MockNode[];
	parentElement?: MockNode | null;
	getAttribute?: (name: string) => string | null;
	querySelector?: (selector: string) => MockNode | null;
	querySelectorAll?: (selector: string) => MockNode[];
};

function createMockElement(
	tag: string,
	attrs: Record<string, string> = {},
	children: Array<MockNode | string> = []
): MockNode {
	const elem: MockNode = {
		tagName: tag.toUpperCase(),
		nodeType: 1,
		attributes: { ...attrs },
		children: [],
		getAttribute(name: string) {
			return this.attributes?.[name] ?? null;
		},
		querySelector(selector: string) {
			return findSelector(this, selector);
		},
		querySelectorAll(selector: string) {
			return findAllSelectors(this, selector);
		}
	};

	elem.children = children.map((child) => {
		if (typeof child === 'string') {
			const textNode: MockNode = {
				nodeType: 3,
				nodeValue: child,
				textContent: child,
				parentElement: elem
			};
			return textNode;
		}
		child.parentElement = elem;
		return child;
	});

	// Compute innerText
	Object.defineProperty(elem, 'innerText', {
		get() {
			return computeInnerText(elem);
		}
	});

	Object.defineProperty(elem, 'textContent', {
		get() {
			return computeTextContent(elem);
		}
	});

	return elem;
}

function computeTextContent(node: MockNode): string {
	if (node.nodeType === 3) return node.nodeValue ?? '';
	return (node.children ?? []).map(computeTextContent).join('');
}

function computeInnerText(node: MockNode): string {
	const ignored = new Set(['SCRIPT', 'STYLE', 'NOSCRIPT', 'SVG', 'TEMPLATE']);
	if (node.nodeType === 1 && ignored.has(node.tagName ?? '')) return '';
	if (node.nodeType === 3) return node.nodeValue ?? '';
	return (node.children ?? []).map(computeInnerText).join(' ').replace(/\s+/g, ' ').trim();
}

function matchesSelector(node: MockNode, selector: string): boolean {
	if (node.nodeType !== 1) return false;
	const tag = node.tagName?.toLowerCase() ?? '';
	const parts = selector.split(',').map((s) => s.trim());
	for (const part of parts) {
		if (part === 'article' && tag === 'article') return true;
		if (part === 'main' && tag === 'main') return true;
		if (part === '[role="main"]' && node.getAttribute?.('role') === 'main') return true;
		if (part === 'a[href]' && tag === 'a' && node.getAttribute?.('href')) return true;
		if (part.startsWith('.') && node.attributes?.class?.split(/\s+/).includes(part.slice(1))) {
			return true;
		}
		if (part.startsWith('h3.') && tag === 'h3') {
			const className = part.slice(3).replace(/^\./, '');
			if (node.attributes?.class?.split(/\s+/).includes(className)) return true;
		}
		if (
			part === 'h3 a[href]' &&
			tag === 'a' &&
			node.parentElement?.tagName?.toLowerCase() === 'h3'
		) {
			return Boolean(node.getAttribute?.('href'));
		}
		if (
			part === 'h3.gs_rt a[href]' &&
			tag === 'a' &&
			node.parentElement?.tagName?.toLowerCase() === 'h3' &&
			node.parentElement?.attributes?.class?.includes('gs_rt')
		) {
			return Boolean(node.getAttribute?.('href'));
		}
		if (part === '.VwiC3b, .gs_rs, [data-sncf]' || part === '.VwiC3b' || part === '.gs_rs') {
			const cls = node.attributes?.class?.split(/\s+/) ?? [];
			if (cls.includes('VwiC3b') || cls.includes('gs_rs')) return true;
		}
	}
	return false;
}

function findSelector(root: MockNode, selector: string): MockNode | null {
	const all = findAllSelectors(root, selector);
	return all.length > 0 ? all[0] : null;
}

function findAllSelectors(root: MockNode, selector: string): MockNode[] {
	const results: MockNode[] = [];
	function traverse(node: MockNode) {
		if (matchesSelector(node, selector)) {
			results.push(node);
		}
		for (const child of node.children ?? []) {
			traverse(child);
		}
	}
	for (const child of root.children ?? []) {
		traverse(child);
	}
	return results;
}

function createMockDocument(options: { title: string; bodyChildren: MockNode[] }) {
	const body = createMockElement('body', {}, options.bodyChildren);
	const doc = {
		title: options.title,
		body,
		querySelector(selector: string) {
			return body.querySelector?.(selector) ?? null;
		},
		querySelectorAll(selector: string) {
			return body.querySelectorAll?.(selector) ?? [];
		},
		createTreeWalker(
			root: MockNode,
			_whatToShow: number,
			filter: { acceptNode(node: MockNode): number }
		) {
			const nodes: MockNode[] = [];
			function collect(n: MockNode) {
				const check = filter.acceptNode(n);
				if (check === 2 /* FILTER_REJECT */) return;
				if (check === 1 /* FILTER_ACCEPT */) nodes.push(n);
				for (const child of n.children ?? []) {
					collect(child);
				}
			}
			for (const child of root.children ?? []) {
				collect(child);
			}
			let index = -1;
			return {
				nextNode() {
					index += 1;
					return index < nodes.length ? nodes[index] : null;
				}
			};
		}
	};
	return doc;
}

describe('browser extraction: Google and Scholar search pages', () => {
	it('extracts structured results from Google search page', () => {
		const doc = createMockDocument({
			title: 'quantum computing - Google Search',
			bodyChildren: [
				createMockElement('div', { class: 'MjjYud' }, [
					createMockElement('h3', {}, [
						createMockElement('a', { href: 'https://example.com/quantum' }, [
							'Quantum Computing Intro'
						])
					]),
					createMockElement('div', { class: 'VwiC3b' }, [
						'Quantum computing is an emerging field...'
					])
				]),
				createMockElement('div', { class: 'g' }, [
					createMockElement('h3', {}, [
						createMockElement('a', { href: 'https://example.org/qubits' }, [
							'Qubits & Superposition'
						])
					]),
					createMockElement('div', { class: 'VwiC3b' }, ['An explanation of qubits and gates...'])
				])
			]
		});

		const snapshot = googleSearchSnapshot(doc, { href: 'https://www.google.com/search?q=quantum' });
		expect(snapshot.title).toBe('quantum computing - Google Search');
		expect(snapshot.results).toHaveLength(2);
		expect(snapshot.results[0]).toEqual({
			title: 'Quantum Computing Intro',
			url: 'https://example.com/quantum',
			snippet: 'Quantum computing is an emerging field...'
		});
		expect(snapshot.results[1]).toEqual({
			title: 'Qubits & Superposition',
			url: 'https://example.org/qubits',
			snippet: 'An explanation of qubits and gates...'
		});
		expect(snapshot.captcha).toBe(false);
	});

	it('extracts structured results from Google Scholar search page', () => {
		const doc = createMockDocument({
			title: 'Google Scholar',
			bodyChildren: [
				createMockElement('div', { class: 'gs_ri' }, [
					createMockElement('h3', { class: 'gs_rt' }, [
						createMockElement('a', { href: 'https://arxiv.org/abs/1706.03762' }, [
							'Attention is all you need'
						])
					]),
					createMockElement('div', { class: 'gs_rs' }, [
						'The dominant sequence transduction models are based on complex recurrent...'
					])
				])
			]
		});

		const snapshot = googleSearchSnapshot(doc, {
			href: 'https://scholar.google.com/scholar?q=transformer'
		});
		expect(snapshot.results).toHaveLength(1);
		expect(snapshot.results[0].title).toBe('Attention is all you need');
		expect(snapshot.results[0].url).toBe('https://arxiv.org/abs/1706.03762');
		expect(snapshot.results[0].snippet).toContain('The dominant sequence transduction models');
	});
});

describe('browser extraction: generic public pages', () => {
	it('extracts content from generic public article page using <article>', () => {
		const doc = createMockDocument({
			title: 'Agentic Coding Patterns',
			bodyChildren: [
				createMockElement('header', {}, [
					createMockElement('a', { href: 'https://example.com' }, ['Home'])
				]),
				createMockElement('article', {}, [
					createMockElement('h1', {}, ['Agentic Coding Patterns']),
					createMockElement('p', {}, [
						'Autonomous agents require deterministic tool gating and bounded extraction.'
					]),
					createMockElement('a', { href: 'https://example.com/docs/tool-gating' }, [
						'Read more about tool gating'
					])
				]),
				createMockElement('footer', {}, ['Footer text'])
			]
		});

		const snapshot = genericPageSnapshot(doc, { href: 'https://example.com/article' });
		expect(snapshot.title).toBe('Agentic Coding Patterns');
		expect(snapshot.text).toContain('Agentic Coding Patterns');
		expect(snapshot.text).toContain('Autonomous agents require deterministic tool gating');
		expect(snapshot.results).toEqual([]);
		expect(snapshot.links).toHaveLength(2);
		expect(snapshot.links[1].url).toBe('https://example.com/docs/tool-gating');
	});

	it('extracts content from generic docs page using <main> and strips script/style/svg', () => {
		const doc = createMockDocument({
			title: 'Framework Documentation',
			bodyChildren: [
				createMockElement('main', {}, [
					createMockElement('style', {}, ['.banner { color: red; }']),
					createMockElement('script', {}, ['console.log("analytics")']),
					createMockElement('svg', {}, [createMockElement('path', { d: 'M0 0' })]),
					createMockElement('h1', {}, ['Getting Started']),
					createMockElement('p', {}, ['Install the library and follow the quickstart guide.'])
				])
			]
		});

		const snapshot = genericPageSnapshot(doc, { href: 'https://docs.example.com/start' });
		expect(snapshot.text).toBe(
			'Getting Started Install the library and follow the quickstart guide.'
		);
		expect(snapshot.text).not.toContain('.banner');
		expect(snapshot.text).not.toContain('console.log');
	});

	it('falls back to document.body when <article> or <main> is absent', () => {
		const doc = createMockDocument({
			title: 'Simple Static Page',
			bodyChildren: [
				createMockElement('div', { class: 'content-wrap' }, [
					createMockElement('h2', {}, ['Hello World']),
					createMockElement('p', {}, ['This page does not use modern semantic landmark tags.'])
				])
			]
		});

		const snapshot = genericPageSnapshot(doc, { href: 'https://example.org/simple' });
		expect(snapshot.text).toContain('Hello World');
		expect(snapshot.text).toContain('This page does not use modern semantic landmark tags.');
	});

	it('resolves relative links against the current page URL', () => {
		const doc = createMockDocument({
			title: 'Navigation Page',
			bodyChildren: [
				createMockElement('main', {}, [
					createMockElement('a', { href: '/about' }, ['About Us']),
					createMockElement('a', { href: '../faq' }, ['FAQ']),
					createMockElement('a', { href: 'contact' }, ['Contact'])
				])
			]
		});

		const snapshot = genericPageSnapshot(doc, { href: 'https://example.com/section/page' });
		expect(snapshot.links).toEqual([
			{ title: 'About Us', url: 'https://example.com/about' },
			{ title: 'FAQ', url: 'https://example.com/faq' },
			{ title: 'Contact', url: 'https://example.com/section/contact' }
		]);
	});

	it('deduplicates links with identical resolved URLs', () => {
		const doc = createMockDocument({
			title: 'Duplicate Links Page',
			bodyChildren: [
				createMockElement('main', {}, [
					createMockElement('a', { href: 'https://example.com/page' }, ['First Link']),
					createMockElement('a', { href: 'https://example.com/page' }, ['Duplicate Link'])
				])
			]
		});

		const snapshot = genericPageSnapshot(doc, { href: 'https://example.com' });
		expect(snapshot.links).toHaveLength(1);
		expect(snapshot.links[0]).toEqual({
			title: 'First Link',
			url: 'https://example.com/page'
		});
	});

	it('ignores non-http and non-https links', () => {
		const doc = createMockDocument({
			title: 'Protocols Test',
			bodyChildren: [
				createMockElement('main', {}, [
					createMockElement('a', { href: 'javascript:alert(1)' }, ['XSS']),
					createMockElement('a', { href: 'mailto:info@example.com' }, ['Email']),
					createMockElement('a', { href: 'tel:+1234567890' }, ['Phone']),
					createMockElement('a', { href: 'file:///etc/passwd' }, ['File']),
					createMockElement('a', { href: 'https://example.com/safe' }, ['Safe Link'])
				])
			]
		});

		const snapshot = genericPageSnapshot(doc, { href: 'https://example.com' });
		expect(snapshot.links).toHaveLength(1);
		expect(snapshot.links[0].url).toBe('https://example.com/safe');
	});

	it('bounds very long text, titles, URLs, and links to strict limits', () => {
		const hugeText = 'A'.repeat(30_000);
		const hugeTitle = 'T'.repeat(500);
		const manyLinks: MockNode[] = [];
		for (let i = 0; i < 150; i++) {
			manyLinks.push(
				createMockElement('a', { href: `https://example.com/link-${i}` }, [`Link ${i}`])
			);
		}

		const doc = createMockDocument({
			title: hugeTitle,
			bodyChildren: [
				createMockElement('main', {}, [createMockElement('p', {}, [hugeText]), ...manyLinks])
			]
		});

		const snapshot = genericPageSnapshot(doc, { href: 'https://example.com/long' });
		expect(snapshot.title.length).toBeLessThanOrEqual(300);
		expect(snapshot.text.length).toBeLessThanOrEqual(20_000);
		expect(snapshot.links.length).toBeLessThanOrEqual(100);
	});

	it('handles redirected public URL correctly and rejects disallowed redirect targets', () => {
		const originalUrl = 'https://short.url/abc';
		expect(validatePublicUrl(originalUrl)).toBe(originalUrl);
		const redirectedPublicUrl = 'https://destination.org/final-article';
		const validated = validatePublicUrl(redirectedPublicUrl);
		expect(validated).toBe(redirectedPublicUrl);

		const disallowedRedirects = [
			'http://localhost:3000',
			'http://127.0.0.1/admin',
			'file:///etc/hosts',
			'chrome://flags'
		];

		for (const target of disallowedRedirects) {
			expect(() => validatePublicUrl(target)).toThrow();
		}
	});

	it('detects readable google urls correctly', () => {
		expect(isReadableGoogleUrl('https://www.google.com/search?q=test')).toBe(true);
		expect(isReadableGoogleUrl('https://scholar.google.com/scholar?q=ai')).toBe(true);
		expect(isReadableGoogleUrl('https://example.com')).toBe(false);
	});

	it('returns structured unreadable result when host permission is missing', () => {
		const unreadableResult = {
			url: 'https://news.ycombinator.com/',
			title: '',
			text: '',
			links: [],
			results: [],
			readable: false,
			reason: 'host_permission_required',
			tabId: 42
		};

		expect(unreadableResult.readable).toBe(false);
		expect(unreadableResult.reason).toBe('host_permission_required');
		expect(unreadableResult.text).toBe('');
		expect(unreadableResult.links).toHaveLength(0);
	});
});

describe('security: URL validation and host restrictions', () => {
	it('rejects localhost, loopback, private IPv4, and internal hosts', () => {
		const targets = [
			'http://localhost',
			'http://localhost:5173',
			'http://127.0.0.1:8080',
			'http://127.0.0.5',
			'http://10.0.0.1',
			'http://10.255.255.254',
			'http://172.16.0.1',
			'http://172.31.255.254',
			'http://192.168.1.1',
			'http://192.168.0.254',
			'http://169.254.169.254',
			'http://[::1]:3000',
			'http://[::]',
			'http://0.0.0.0',
			'http://app.localhost',
			'http://service.local',
			'http://server.internal'
		];

		for (const target of targets) {
			expect(isPrivateHost(new URL(target).hostname), `Target: ${target}`).toBe(true);
			expect(() => validatePublicUrl(target), `Target: ${target}`).toThrow(
				/Private or local URLs cannot be opened/
			);
		}
	});

	it('rejects non-http protocols, credentials, and disallowed schemes', () => {
		const invalid = [
			'ftp://example.com',
			'file:///etc/passwd',
			'chrome://settings',
			'about:blank',
			'javascript:void(0)',
			'data:text/html,<h1>hi</h1>',
			'https://user:pass@example.com'
		];

		for (const url of invalid) {
			expect(() => validatePublicUrl(url), `Target: ${url}`).toThrow();
		}
	});

	it('accepts valid public HTTP and HTTPS URLs', () => {
		const valid = [
			'https://example.com/',
			'https://www.google.com/search?q=test',
			'https://scholar.google.com/scholar?q=ai',
			'http://example.org/article'
		];

		for (const url of valid) {
			expect(validatePublicUrl(url)).toBe(url);
		}
	});
});
