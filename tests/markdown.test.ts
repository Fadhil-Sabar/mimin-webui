import { describe, it, expect } from 'vitest';
import { Marked } from 'marked';
import { highlightCode, escapeHtml } from '$lib/client/highlighter';
import {
	parseCitationsAndSources,
	extractDomain,
	extractCleanTitle,
	renderCitationPillHtml
} from '$lib/client/citations';

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

describe('citations parsing and fallback sources', () => {
	it('extracts domain correctly from urls', () => {
		expect(extractDomain('https://en.wikipedia.org/wiki/GPT-6_Astra')).toBe('en.wikipedia.org');
		expect(extractDomain('https://www.google.com/search?q=test')).toBe('google.com');
	});

	it('extracts clean title from url path if title missing or matching url', () => {
		expect(extractCleanTitle('https://en.wikipedia.org/wiki/GPT-6_Astra')).toBe('GPT 6 Astra');
		expect(
			extractCleanTitle(
				'https://en.wikipedia.org/wiki/GPT-6_Astra',
				'https://en.wikipedia.org/wiki/GPT-6_Astra'
			)
		).toBe('GPT 6 Astra');
		expect(extractCleanTitle('https://en.wikipedia.org/wiki/GPT-6_Astra', 'Explicit Title')).toBe(
			'Explicit Title'
		);
	});

	it('pre-populates fallback sources when no URLs are present in markdown', () => {
		const fallback = [
			{ title: 'GPT-6 Astra', url: 'https://en.wikipedia.org/wiki/GPT-6_Astra' },
			{ title: 'ChatGPT', url: 'https://en.wikipedia.org/wiki/ChatGPT' }
		];

		const text = 'GPT-6 Astra is a large language model [1]. Another tool is ChatGPT [2].';
		const { sources, sourcesMap } = parseCitationsAndSources(text, fallback);

		expect(sources).toHaveLength(2);
		expect(sourcesMap.get(1)).toMatchObject({
			index: 1,
			title: 'GPT-6 Astra',
			url: 'https://en.wikipedia.org/wiki/GPT-6_Astra',
			domain: 'en.wikipedia.org'
		});
		expect(sourcesMap.get(2)).toMatchObject({
			index: 2,
			title: 'ChatGPT',
			url: 'https://en.wikipedia.org/wiki/ChatGPT',
			domain: 'en.wikipedia.org'
		});
	});

	it('adds the PDF page fragment to project file citation links', () => {
		const { sources, sourcesMap } = parseCitationsAndSources('The answer is in [1].', [
			{
				title: 'requirements.pdf',
				url: '/api/projects/project-1/files/file-1',
				type: 'project_file',
				filename: 'requirements.pdf',
				page: 3,
				snippet: 'The retention period is seven years.'
			}
		]);

		expect(sources).toHaveLength(1);
		expect(sources[0].url).toBe('/api/projects/project-1/files/file-1#page=3');
		expect(sourcesMap.get(1)?.snippet).toBe('The retention period is seven years.');
	});

	it('renders citation pill with real url and hover card', () => {
		const html = renderCitationPillHtml(
			1,
			'https://en.wikipedia.org/wiki/GPT-6_Astra',
			'en.wikipedia.org',
			'GPT-6 Astra',
			'https://www.google.com/s2/favicons?domain=en.wikipedia.org&sz=32'
		);

		expect(html).toContain('href="https://en.wikipedia.org/wiki/GPT-6_Astra"');
		expect(html).toContain('en.wikipedia.org');
		expect(html).toContain('GPT-6 Astra');
		expect(html).toContain('class="citation-pill"');
		expect(html).toContain('class="citation-hover-card"');
	});

	it('updates fallback sources if markdown specifies explicit citations or sources section', () => {
		const fallback = [
			{ title: 'Fallback 1', url: 'https://fallback.com/1' },
			{ title: 'Fallback 2', url: 'https://fallback.com/2' }
		];

		const text = `Here is info [1].\n\n## Sources\n[1] [Updated Source](https://updated.com/1)`;
		const { sourcesMap } = parseCitationsAndSources(text, fallback);

		expect(sourcesMap.get(1)?.url).toBe('https://updated.com/1');
		expect(sourcesMap.get(1)?.title).toBe('Updated Source');
	});

	it('parses sources with emoji prefixes and preserves trailing conversational text', () => {
		const raw = `Here is information about Gemini.

## Overview
Gemini 3.8 Flash is fast.

## Sources
- 📄 [Model Card — Google DeepMind](https://deepmind.google/models/model-cards/gemini-3-8-flash/)
- 📄 [API Docs — Google AI for Developers](https://ai.google.dev/gemini-api/docs/models/gemini-3.8-flash)
- 📝 [Introducing Gemini 3.8 Flash & Flash Cyber](https://blog.google/innovation-and-ai/models-and-research/gemini-models/3-8-flash-and-3-8-flash-cyber/)
- 📰 [Release Analysis & Pricing](https://artificialanalysis.ai/models/releases/gemini-3-8-flash)
- 📰 [In Google Antigravity](https://antigravity.google/blog/gemini-3-8-flash-in-google-antigravity)

Want me to dig deeper into any specific aspect — pricing or benchmarks?`;

		const { cleanedMarkdown, sources } = parseCitationsAndSources(raw);

		expect(sources).toHaveLength(5);
		expect(sources[0].url).toBe('https://deepmind.google/models/model-cards/gemini-3-8-flash/');
		expect(sources[0].title).toBe('Model Card — Google DeepMind');
		expect(sources[1].url).toBe('https://ai.google.dev/gemini-api/docs/models/gemini-3.8-flash');
		expect(sources[1].title).toBe('API Docs — Google AI for Developers');

		// Trailing conversation prompt is preserved
		expect(cleanedMarkdown).toContain('Want me to dig deeper into any specific aspect');
		expect(cleanedMarkdown).not.toContain('## Sources');
	});

	it('collects inline markdown links into sources list', () => {
		const text =
			'Check out [DeepMind](https://deepmind.google) and [Google AI](https://ai.google.dev).';
		const { sources } = parseCitationsAndSources(text);

		expect(sources).toHaveLength(2);
		expect(sources.map((s) => s.url)).toEqual(['https://deepmind.google', 'https://ai.google.dev']);
	});
});

describe('unwrapMarkdownDocument and parseMarkdownSegments', () => {
	it('does not unwrap simple markdown code snippets', async () => {
		const { unwrapMarkdownDocument } = await import('$lib/client/markdown');
		const snippet = '```markdown\n*just italic*\n```';
		expect(unwrapMarkdownDocument(snippet)).toBe(snippet);
	});

	it('unwraps outer document markdown blocks with headings', async () => {
		const { unwrapMarkdownDocument } = await import('$lib/client/markdown');
		const doc = '```markdown\n# PRD Document\nSome details\n```';
		expect(unwrapMarkdownDocument(doc)).toBe('# PRD Document\nSome details');
	});

	it('unwraps outer markdown fences enclosing inner code blocks and mermaid diagrams', async () => {
		const { unwrapMarkdownDocument, parseMarkdownSegments } = await import('$lib/client/markdown');
		const input = [
			'Here is the architecture:',
			'```markdown',
			'# System Spec',
			'## Project Structure',
			'```',
			'src/',
			'```',
			'## System Architecture',
			'```mermaid',
			'flowchart TB',
			'  Client --> Server',
			'```',
			'## Conclusion',
			'```',
			'Hope this helps!'
		].join('\n');

		const unwrapped = unwrapMarkdownDocument(input);
		expect(unwrapped).not.toContain('```markdown');
		expect(unwrapped).toContain('```mermaid\nflowchart TB\n  Client --> Server\n```');
		expect(unwrapped).toContain('Hope this helps!');

		const parser = createMarkdownParser();
		const segments = parseMarkdownSegments(input, parser);
		expect(segments.some((s) => s.type === 'mermaid')).toBe(true);
		const mermaidSeg = segments.find((s) => s.type === 'mermaid');
		expect(mermaidSeg?.code).toContain('flowchart TB');
	});
});
