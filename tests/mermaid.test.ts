import { describe, it, expect, beforeEach } from 'vitest';
import { Marked } from 'marked';
import {
	isMermaidLanguage,
	getMermaidCacheKey,
	getCachedMermaidSvg,
	setCachedMermaidSvg,
	clearMermaidCache
} from '$lib/client/mermaid';
import { parseMarkdownSegments } from '$lib/client/markdown';

describe('mermaid language detection', () => {
	it('identifies mermaid language case-insensitively with whitespace', () => {
		expect(isMermaidLanguage('mermaid')).toBe(true);
		expect(isMermaidLanguage('Mermaid')).toBe(true);
		expect(isMermaidLanguage('MERMAID')).toBe(true);
		expect(isMermaidLanguage('  mermaid  ')).toBe(true);
	});

	it('rejects other languages or invalid inputs', () => {
		expect(isMermaidLanguage('typescript')).toBe(false);
		expect(isMermaidLanguage('python')).toBe(false);
		expect(isMermaidLanguage('mermaid-js')).toBe(false);
		expect(isMermaidLanguage('')).toBe(false);
		expect(isMermaidLanguage(undefined)).toBe(false);
	});
});

describe('mermaid caching', () => {
	beforeEach(() => {
		clearMermaidCache();
	});

	it('generates theme-sensitive cache keys', () => {
		const keyDark = getMermaidCacheKey('graph TD\nA-->B', true);
		const keyLight = getMermaidCacheKey('graph TD\nA-->B', false);

		expect(keyDark).toBe('dark::graph TD\nA-->B');
		expect(keyLight).toBe('light::graph TD\nA-->B');
		expect(keyDark).not.toBe(keyLight);
	});

	it('stores and retrieves cached SVG correctly', () => {
		const code = 'graph TD\nA-->B';
		expect(getCachedMermaidSvg(code, true)).toBeUndefined();

		setCachedMermaidSvg(code, true, '<svg id="dark-svg"></svg>');
		expect(getCachedMermaidSvg(code, true)).toBe('<svg id="dark-svg"></svg>');
		expect(getCachedMermaidSvg(code, false)).toBeUndefined();

		clearMermaidCache();
		expect(getCachedMermaidSvg(code, true)).toBeUndefined();
	});

	it('bounds cached SVG entries', () => {
		for (let index = 0; index < 40; index += 1) {
			setCachedMermaidSvg(`graph TD\nA-->${index}`, true, `<svg>${index}</svg>`);
		}

		expect(getCachedMermaidSvg('graph TD\nA-->0', true)).toBeUndefined();
		expect(getCachedMermaidSvg('graph TD\nA-->39', true)).toBe('<svg>39</svg>');
	});
});

describe('markdown segment parsing for mermaid diagrams', () => {
	const marked = new Marked({ gfm: true, breaks: true });

	it('returns a single html segment for markdown without mermaid blocks', () => {
		const md = '# Hello World\n\nThis is a standard message with **bold** text and `code`.';
		const segments = parseMarkdownSegments(md, marked);

		expect(segments).toHaveLength(1);
		expect(segments[0].type).toBe('html');
		if (segments[0].type === 'html') {
			expect(segments[0].html).toContain('<h1>Hello World</h1>');
			expect(segments[0].html).toContain('<strong>bold</strong>');
		}
	});

	it('separates a single mermaid block from surrounding text', () => {
		const md = `Here is the architecture:

\`\`\`mermaid
graph TD
    A[Client] --> B[Server]
    B --> C[Database]
\`\`\`

Hope this clarifies the design!`;

		const segments = parseMarkdownSegments(md, marked);

		expect(segments).toHaveLength(3);
		expect(segments[0].type).toBe('html');
		if (segments[0].type === 'html') {
			expect(segments[0].html).toContain('Here is the architecture:');
		}

		expect(segments[1].type).toBe('mermaid');
		if (segments[1].type === 'mermaid') {
			expect(segments[1].code).toContain('graph TD');
			expect(segments[1].code).toContain('A[Client] --> B[Server]');
			expect(segments[1].id).toBe('mermaid-0');
		}

		expect(segments[2].type).toBe('html');
		if (segments[2].type === 'html') {
			expect(segments[2].html).toContain('Hope this clarifies the design!');
		}
	});

	it('handles diagrams with uppercase or mixed-case language specifiers', () => {
		const md = `\`\`\`MERMAID
sequenceDiagram
    Alice->>Bob: Hello
\`\`\``;

		const segments = parseMarkdownSegments(md, marked);

		expect(segments).toHaveLength(1);
		expect(segments[0].type).toBe('mermaid');
		if (segments[0].type === 'mermaid') {
			expect(segments[0].code).toContain('sequenceDiagram');
			expect(segments[0].code).toContain('Alice->>Bob: Hello');
		}
	});

	it('correctly segments multiple mermaid diagrams in one document', () => {
		const md = `First diagram:

\`\`\`mermaid
graph LR
    A --> B
\`\`\`

Second diagram:

\`\`\`mermaid
pie title Pets
    "Dogs" : 386
    "Cats" : 85
\`\`\`

Done!`;

		const segments = parseMarkdownSegments(md, marked);

		expect(segments).toHaveLength(5);
		expect(segments[0].type).toBe('html');
		expect(segments[1].type).toBe('mermaid');
		expect(segments[2].type).toBe('html');
		expect(segments[3].type).toBe('mermaid');
		expect(segments[4].type).toBe('html');

		if (segments[1].type === 'mermaid') {
			expect(segments[1].id).toBe('mermaid-0');
			expect(segments[1].code).toContain('graph LR');
		}
		if (segments[3].type === 'mermaid') {
			expect(segments[3].id).toBe('mermaid-1');
			expect(segments[3].code).toContain('pie title Pets');
		}
	});

	it('handles empty or blank markdown', () => {
		expect(parseMarkdownSegments('', marked)).toEqual([]);
	});
});
