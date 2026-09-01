<script lang="ts">
	import { Marked } from 'marked';
	import { escapeHtml, highlightCode } from '$lib/client/highlighter';

	interface Props {
		content: string;
		class?: string;
	}

	let { content = '', class: className = '' }: Props = $props();

	const marked = new Marked({
		gfm: true,
		breaks: true,
		renderer: {
			code({ text, lang }) {
				const { html: highlightedHtml, language } = highlightCode(text, lang);
				return `<div class="code-block" data-lang="${escapeHtml(language)}"><div class="code-header"><span class="code-lang">${escapeHtml(language)}</span><button class="copy-code-btn" type="button" aria-label="Copy code"><svg class="copy-icon" xmlns="http://www.w3.org/2000/svg" width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect width="14" height="14" x="8" y="8" rx="2" ry="2"/><path d="M4 16c-1.1 0-2-.9-2-2V4c0-1.1.9-2 2-2h10c1.1 0 2 .9 2 2"/></svg><span class="copy-label">Copy</span></button></div><pre><code class="language-${escapeHtml(language)}">${highlightedHtml}</code></pre></div>`;
			},
			link({ href, title, text }) {
				const titleAttr = title ? ` title="${escapeHtml(title)}"` : '';
				const safeHref = href.startsWith('javascript:') ? '#' : href;
				return `<a href="${encodeURI(safeHref)}" target="_blank" rel="noopener noreferrer"${titleAttr}>${text}</a>`;
			}
		}
	});

	let parsedHtml = $derived.by(() => {
		if (!content || typeof content !== 'string') return '';
		try {
			return marked.parse(content) as string;
		} catch {
			return `<p>${escapeHtml(content)}</p>`;
		}
	});

	async function handleClick(event: MouseEvent) {
		const target = (event.target as HTMLElement)?.closest('.copy-code-btn') as HTMLButtonElement | null;
		if (!target) return;
		const codeBlock = target.closest('.code-block');
		const codeEl = codeBlock?.querySelector('pre code');
		if (!codeEl) return;
		const text = codeEl.textContent || '';
		try {
			await navigator.clipboard.writeText(text);
			target.classList.add('copied');
			const label = target.querySelector('.copy-label');
			if (label) label.textContent = 'Copied!';
			setTimeout(() => {
				target.classList.remove('copied');
				if (label) label.textContent = 'Copy';
			}, 2000);
		} catch {
			/* fallback */
		}
	}
</script>

<!-- svelte-ignore a11y_no_static_element_interactions -->
<div class="markdown-body {className}" role="presentation" onclick={handleClick}>
	<!-- eslint-disable-next-line svelte/no-at-html-tags -->
	{@html parsedHtml}
</div>

<style>
	:global(.markdown-body) {
		font-family: var(--font-body);
		font-size: var(--text-base);
		line-height: 1.65;
		color: var(--text-body);
		word-wrap: break-word;
	}
	:global(.markdown-body > *:first-child) {
		margin-top: 0;
	}
	:global(.markdown-body > *:last-child) {
		margin-bottom: 0;
	}
	:global(.markdown-body p) {
		margin: 0 0 12px;
		line-height: 1.65;
	}
	:global(.markdown-body h1),
	:global(.markdown-body h2),
	:global(.markdown-body h3),
	:global(.markdown-body h4) {
		color: var(--text-strong);
		font-family: var(--font-body);
		font-weight: 600;
		line-height: 1.25;
		margin: 20px 0 8px;
	}
	:global(.markdown-body h1) {
		font-size: var(--text-xl);
	}
	:global(.markdown-body h2) {
		font-size: var(--text-lg);
	}
	:global(.markdown-body h3) {
		font-size: var(--text-base);
		font-weight: 650;
	}
	:global(.markdown-body h4) {
		font-size: var(--text-sm);
		font-weight: 650;
		text-transform: uppercase;
		letter-spacing: 0.04em;
	}
	:global(.markdown-body ul),
	:global(.markdown-body ol) {
		margin: 0 0 12px;
		padding-left: 20px;
	}
	:global(.markdown-body li) {
		margin-bottom: 4px;
		line-height: 1.6;
	}
	:global(.markdown-body hr) {
		height: 1px;
		border: 0;
		background: var(--border);
		margin: 20px 0;
	}
	:global(.markdown-body blockquote) {
		margin: 14px 0;
		padding: 6px 14px;
		border-left: 3px solid var(--border-strong);
		color: var(--text-muted);
		background: var(--surface-subtle);
		border-radius: 0 5px 5px 0;
	}
	:global(.markdown-body blockquote p) {
		margin: 0;
	}
	:global(.markdown-body a) {
		color: var(--accent-fg);
		background: color-mix(in srgb, var(--accent-bg) 15%, transparent);
		padding: 1px 4px;
		border-radius: 3px;
		text-decoration: underline;
		text-underline-offset: 2px;
	}
	:global(.markdown-body a:hover) {
		background: color-mix(in srgb, var(--accent-bg) 25%, transparent);
	}
	:global(.markdown-body strong) {
		color: var(--text-strong);
		font-weight: 600;
	}
	:global(.markdown-body code:not(pre code)) {
		font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace;
		font-size: 0.875em;
		background: var(--surface-3);
		color: var(--text-strong);
		padding: 2px 5px;
		border-radius: 4px;
		border: 1px solid var(--border);
	}
	:global(.markdown-body .code-block) {
		margin: 14px 0;
		border: 1px solid var(--border-strong);
		border-radius: 8px;
		background: var(--surface-2);
		overflow: hidden;
		box-shadow: 0 2px 8px var(--shadow-softer);
	}
	:global(.markdown-body .code-header) {
		display: flex;
		align-items: center;
		justify-content: space-between;
		padding: 6px 12px;
		background: var(--surface-3);
		border-bottom: 1px solid var(--border);
		font-size: var(--text-xs);
		color: var(--text-muted);
		user-select: none;
	}
	:global(.markdown-body .code-lang) {
		font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace;
		font-weight: 600;
		text-transform: uppercase;
		letter-spacing: 0.05em;
		color: var(--text-dim);
	}
	:global(.markdown-body .copy-code-btn) {
		display: inline-flex;
		align-items: center;
		gap: 5px;
		background: transparent;
		border: 1px solid var(--border);
		border-radius: 4px;
		padding: 3px 7px;
		font-size: var(--text-xs);
		color: var(--text-muted);
		transition: 0.15s ease;
	}
	:global(.markdown-body .copy-code-btn:hover) {
		background: var(--surface-hover);
		color: var(--text-strong);
		border-color: var(--border-strong);
	}
	:global(.markdown-body .copy-code-btn.copied) {
		background: var(--status-ok-dot);
		color: #ffffff;
		border-color: var(--status-ok-dot);
	}
	:global(.markdown-body pre) {
		margin: 0;
		padding: 12px 14px;
		overflow-x: auto;
		scrollbar-width: thin;
		scrollbar-color: var(--scrollbar-thumb) transparent;
	}
	:global(.markdown-body pre code) {
		font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace;
		font-size: 0.875em;
		line-height: 1.55;
		color: var(--text-strong);
		white-space: pre;
		background: transparent;
		border: 0;
		padding: 0;
	}
	:global(.markdown-body table) {
		width: 100%;
		border-collapse: collapse;
		margin: 14px 0;
		font-size: var(--text-sm);
	}
	:global(.markdown-body th),
	:global(.markdown-body td) {
		border: 1px solid var(--border);
		padding: 8px 12px;
		text-align: left;
	}
	:global(.markdown-body th) {
		background: var(--surface-3);
		color: var(--text-strong);
		font-weight: 600;
	}
	:global(.markdown-body tr:nth-child(even)) {
		background: var(--surface-subtle);
	}

	/* Light theme syntax tokens */
	:global(.markdown-body .token.comment),
	:global(.markdown-body .token.prolog),
	:global(.markdown-body .token.doctype),
	:global(.markdown-body .token.cdata) {
		color: #787872;
		font-style: italic;
	}
	:global(.markdown-body .token.punctuation) {
		color: #64645e;
	}
	:global(.markdown-body .token.property),
	:global(.markdown-body .token.tag),
	:global(.markdown-body .token.constant),
	:global(.markdown-body .token.symbol),
	:global(.markdown-body .token.deleted) {
		color: #a84239;
	}
	:global(.markdown-body .token.boolean),
	:global(.markdown-body .token.number) {
		color: #9c581e;
	}
	:global(.markdown-body .token.selector),
	:global(.markdown-body .token.attr-name),
	:global(.markdown-body .token.string),
	:global(.markdown-body .token.char),
	:global(.markdown-body .token.builtin),
	:global(.markdown-body .token.inserted) {
		color: #386b43;
	}
	:global(.markdown-body .token.operator),
	:global(.markdown-body .token.entity),
	:global(.markdown-body .token.url),
	:global(.language-css .token.string),
	:global(.style .token.string) {
		color: #7a5e2c;
	}
	:global(.markdown-body .token.atrule),
	:global(.markdown-body .token.attr-value),
	:global(.markdown-body .token.keyword) {
		color: #8c3b33;
		font-weight: 550;
	}
	:global(.markdown-body .token.function),
	:global(.markdown-body .token.class-name) {
		color: #1f6498;
	}
	:global(.markdown-body .token.regex),
	:global(.markdown-body .token.important),
	:global(.markdown-body .token.variable) {
		color: #a35d21;
	}

	/* Dark theme syntax tokens */
	:global(:root[data-theme='dark'] .markdown-body .token.comment),
	:global(:root[data-theme='dark'] .markdown-body .token.prolog),
	:global(:root[data-theme='dark'] .markdown-body .token.doctype),
	:global(:root[data-theme='dark'] .markdown-body .token.cdata) {
		color: #72727a;
		font-style: italic;
	}
	:global(:root[data-theme='dark'] .markdown-body .token.punctuation) {
		color: #8f8f98;
	}
	:global(:root[data-theme='dark'] .markdown-body .token.property),
	:global(:root[data-theme='dark'] .markdown-body .token.tag),
	:global(:root[data-theme='dark'] .markdown-body .token.constant),
	:global(:root[data-theme='dark'] .markdown-body .token.symbol),
	:global(:root[data-theme='dark'] .markdown-body .token.deleted) {
		color: #e58277;
	}
	:global(:root[data-theme='dark'] .markdown-body .token.boolean),
	:global(:root[data-theme='dark'] .markdown-body .token.number) {
		color: #e8b06c;
	}
	:global(:root[data-theme='dark'] .markdown-body .token.selector),
	:global(:root[data-theme='dark'] .markdown-body .token.attr-name),
	:global(:root[data-theme='dark'] .markdown-body .token.string),
	:global(:root[data-theme='dark'] .markdown-body .token.char),
	:global(:root[data-theme='dark'] .markdown-body .token.builtin),
	:global(:root[data-theme='dark'] .markdown-body .token.inserted) {
		color: #8dc297;
	}
	:global(:root[data-theme='dark'] .markdown-body .token.operator),
	:global(:root[data-theme='dark'] .markdown-body .token.entity),
	:global(:root[data-theme='dark'] .markdown-body .token.url),
	:global(:root[data-theme='dark'] .language-css .token.string),
	:global(:root[data-theme='dark'] .style .token.string) {
		color: #c9a66b;
	}
	:global(:root[data-theme='dark'] .markdown-body .token.atrule),
	:global(:root[data-theme='dark'] .markdown-body .token.attr-value),
	:global(:root[data-theme='dark'] .markdown-body .token.keyword) {
		color: #e58277;
		font-weight: 550;
	}
	:global(:root[data-theme='dark'] .markdown-body .token.function),
	:global(:root[data-theme='dark'] .markdown-body .token.class-name) {
		color: #82bdf2;
	}
	:global(:root[data-theme='dark'] .markdown-body .token.regex),
	:global(:root[data-theme='dark'] .markdown-body .token.important),
	:global(:root[data-theme='dark'] .markdown-body .token.variable) {
		color: #e8b06c;
	}
</style>
