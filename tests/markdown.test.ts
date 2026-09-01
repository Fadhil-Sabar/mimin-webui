import { describe, it, expect } from 'vitest';
import { Marked } from 'marked';
import { highlightCode, escapeHtml } from '$lib/client/highlighter';

function createMarkdownParser() {
	return new Marked({
		gfm: true,
		breaks: true,
		renderer: {
			code({ text, lang }) {
				const { html: highlightedHtml, language } = highlightCode(text, lang);
				return `<div class="code-block" data-lang="${escapeHtml(language)}"><div class="code-header"><span class="code-lang">${escapeHtml(language)}</span><button class="copy-code-btn" type="button" aria-label="Copy code"><span class="copy-label">Copy</span></button></div><pre><code class="language-${escapeHtml(language)}">${highlightedHtml}</code></pre></div>`;
			},
			link({ href, title, text }) {
				const titleAttr = title ? ` title="${escapeHtml(title)}"` : '';
				const safeHref = href.startsWith('javascript:') ? '#' : href;
				return `<a href="${encodeURI(safeHref)}" target="_blank" rel="noopener noreferrer"${titleAttr}>${text}</a>`;
			}
		}
	});
}

describe('markdown parser and syntax highlighter', () => {
	const parser = createMarkdownParser();

	it('renders headings and bold text', () => {
		const html = parser.parse('# Title\n\n**bold** and *italic*') as string;
		expect(html).toContain('<h1>Title</h1>');
		expect(html).toContain('<strong>bold</strong>');
		expect(html).toContain('<em>italic</em>');
	});

	it('renders fenced code blocks with language header and highlighted tokens', () => {
		const code = '```typescript\nconst a: number = 42;\nconsole.log(a);\n```';
		const html = parser.parse(code) as string;
		expect(html).toContain('class="code-block"');
		expect(html).toContain('data-lang="typescript"');
		expect(html).toContain('<span class="code-lang">typescript</span>');
		expect(html).toContain('class="copy-code-btn"');
		expect(html).toContain('class="token keyword">const</span>');
		expect(html).toContain('class="token builtin">number</span>');
	});

	it('highlights python and json code', () => {
		const py = highlightCode('def add(x: int) -> int:\n    return x + 1', 'python');
		expect(py.html).toContain('class="token keyword">def</span>');
		expect(py.html).toContain('class="token function">add</span>');

		const json = highlightCode('{"name": "mimin", "count": 10}', 'json');
		expect(json.html).toContain('class="token property">"name"</span>');
		expect(json.html).toContain('class="token number">10</span>');
	});

	it('escapes HTML inside code blocks safely without double escaping', () => {
		const code = '```html\n<div class="test">Hello & World</div>\n```';
		const html = parser.parse(code) as string;
		expect(html).toContain('class="token tag"');
		expect(html).not.toContain('<div class="test">');
	});

	it('renders tables and lists', () => {
		const md = '| A | B |\n|---|---|\n| 1 | 2 |\n\n- item 1\n- item 2';
		const html = parser.parse(md) as string;
		expect(html).toContain('<table>');
		expect(html).toContain('<th>A</th>');
		expect(html).toContain('<td>1</td>');
		expect(html).toContain('<ul>');
		expect(html).toContain('<li>item 1</li>');
	});
});
