<script lang="ts">
	import { Marked } from 'marked';
	import { slide } from 'svelte/transition';
	import { ChevronDown, ExternalLink, Globe } from '@lucide/svelte';
	import { escapeHtml, highlightCode } from '$lib/client/highlighter';
	import {
		parseCitationsAndSources,
		renderCitationPillHtml,
		type SourceItem
	} from '$lib/client/citations';

	interface Props {
		content: string;
		class?: string;
	}

	let { content = '', class: className = '' }: Props = $props();
	let showSources = $state(false);

	let processed = $derived.by(() => {
		if (!content || typeof content !== 'string') {
			return { html: '', sources: [] as SourceItem[] };
		}

		const { cleanedMarkdown, sources, sourcesMap } = parseCitationsAndSources(content);

		const marked = new Marked({
			gfm: true,
			breaks: true,
			extensions: [
				{
					name: 'citation',
					level: 'inline',
					start(src: string) {
						const match = src.match(/\[\^?\d+\]/);
						return match ? match.index : undefined;
					},
					tokenizer(src: string) {
						const match = /^\[\^?(\d+)\]/.exec(src);
						if (match) {
							const index = parseInt(match[1], 10);
							return {
								type: 'citation',
								raw: match[0],
								index
							};
						}
					},
					renderer(token: any) {
						const source = sourcesMap.get(token.index);
						const url = source ? source.url : '#';
						const domain = source ? source.domain : '';
						const title = source ? source.title : `Source [${token.index}]`;
						const favicon = source ? source.faviconUrl : '';

						return renderCitationPillHtml(token.index, url, domain, title, favicon);
					}
				}
			],
			renderer: {
				code({ text, lang }) {
					const { html: highlightedHtml, language } = highlightCode(text, lang);
					return `<div class="code-block" data-lang="${escapeHtml(language)}"><div class="code-header"><span class="code-lang">${escapeHtml(language)}</span><button class="copy-code-btn" type="button" aria-label="Copy code"><svg class="copy-icon" xmlns="http://www.w3.org/2000/svg" width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect width="14" height="14" x="8" y="8" rx="2" ry="2"/><path d="M4 16c-1.1 0-2-.9-2-2V4c0-1.1.9-2 2-2h10c1.1 0 2 .9 2 2"/></svg><span class="copy-label">Copy</span></button></div><pre><code class="language-${escapeHtml(language)}">${highlightedHtml}</code></pre></div>`;
				},
				link({ href, title, text }) {
					const safeHref = href.startsWith('javascript:') ? '#' : href;
					const numMatch = text.match(/^\[?\^?(\d+)\]?$/);
					if (numMatch) {
						const index = parseInt(numMatch[1], 10);
						const source = sourcesMap.get(index);
						const domain = source?.domain || '';
						const srcTitle = title || source?.title || '';
						const favicon = source?.faviconUrl || '';
						return renderCitationPillHtml(index, safeHref, domain, srcTitle, favicon);
					}
					const titleAttr = title ? ` title="${escapeHtml(title)}"` : '';
					return `<a href="${encodeURI(safeHref)}" target="_blank" rel="noopener noreferrer"${titleAttr}>${text}</a>`;
				}
			}
		});

		try {
			const html = marked.parse(cleanedMarkdown) as string;
			return { html, sources };
		} catch {
			return { html: `<p>${escapeHtml(cleanedMarkdown)}</p>`, sources };
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

<div class="markdown-container {className}">
	<!-- svelte-ignore a11y_no_static_element_interactions -->
	<div class="markdown-body" role="presentation" onclick={handleClick}>
		<!-- eslint-disable-next-line svelte/no-at-html-tags -->
		{@html processed.html}
	</div>

	{#if processed.sources.length > 0}
		<div class="message-sources-wrapper">
			<button
				type="button"
				class="sources-toggle-btn"
				class:active={showSources}
				onclick={() => (showSources = !showSources)}
				aria-expanded={showSources}
			>
				<Globe size={14} class="sources-icon" />
				<span class="sources-label">Sources</span>
				<span class="sources-count">{processed.sources.length}</span>
				<span class="sources-chevron" class:rotate={showSources}>
					<ChevronDown size={13} />
				</span>
			</button>

			{#if showSources}
				<div class="sources-list" transition:slide={{ duration: 180 }}>
					{#each processed.sources as source (source.index + source.url)}
						<a
							href={source.url}
							target="_blank"
							rel="noopener noreferrer"
							class="source-card-item"
						>
							<span class="source-item-badge">{source.index}</span>
							{#if source.faviconUrl}
								<img
									src={source.faviconUrl}
									alt=""
									class="source-item-favicon"
									loading="lazy"
									onerror={(e) => ((e.currentTarget as HTMLElement).style.display = 'none')}
								/>
							{/if}
							<div class="source-item-info">
								<div class="source-item-title">{source.title || source.domain}</div>
								<div class="source-item-domain">{source.domain}</div>
							</div>
							<ExternalLink size={13} class="source-item-external" />
						</a>
					{/each}
				</div>
			{/if}
		</div>
	{/if}
</div>

<style>
	.markdown-container {
		width: 100%;
		position: relative;
	}

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
	:global(.markdown-body a:not(.citation-pill)) {
		color: var(--text-strong);
		background: color-mix(in srgb, var(--accent-bg) 8%, transparent);
		padding: 1px 5px;
		border-radius: 4px;
		text-decoration: underline;
		text-underline-offset: 2px;
		font-weight: 500;
		transition: background 0.15s ease;
	}
	:global(.markdown-body a:not(.citation-pill):hover) {
		background: color-mix(in srgb, var(--accent-bg) 16%, transparent);
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

	/* ---------- Citation Pill & Hover Card ---------- */
	:global(.markdown-body .citation-pill-wrapper) {
		position: relative;
		display: inline-flex;
		align-items: baseline;
		vertical-align: baseline;
		margin: 0 2px 0 1px;
	}
	:global(.markdown-body .citation-pill) {
		display: inline-flex;
		align-items: center;
		justify-content: center;
		width: 19px;
		height: 19px;
		padding: 2px;
		border-radius: 5px;
		background: var(--surface-3);
		border: 1px solid var(--border-strong);
		vertical-align: middle;
		margin: 0 2px;
		position: relative;
		top: -1px;
		text-decoration: none;
		transition: transform 0.15s ease, background 0.15s ease, border-color 0.15s ease, box-shadow 0.15s ease;
		box-shadow: 0 1px 3px var(--shadow-softer);
		cursor: pointer;
	}
	:global(.markdown-body .citation-pill:hover) {
		transform: translateY(-1px) scale(1.1);
		background: var(--surface-hover);
		border-color: var(--text-dim);
		box-shadow: 0 2px 7px var(--shadow-soft);
	}
	:global(.markdown-body .pill-favicon) {
		width: 13px;
		height: 13px;
		border-radius: 2px;
		object-fit: contain;
		display: block;
	}
	:global(.markdown-body .pill-fallback-icon) {
		display: inline-flex;
		align-items: center;
		justify-content: center;
		width: 13px;
		height: 13px;
		color: var(--text-muted);
	}
	:global(.markdown-body .citation-hover-card) {
		position: absolute;
		bottom: calc(100% + 8px);
		left: 50%;
		transform: translateX(-50%) translateY(4px);
		width: 250px;
		padding: 10px 12px;
		background: var(--surface);
		border: 1px solid var(--border-strong);
		border-radius: 9px;
		box-shadow: 0 12px 30px var(--shadow), 0 2px 8px var(--shadow-soft);
		z-index: 70;
		opacity: 0;
		pointer-events: none;
		visibility: hidden;
		transition: opacity 0.16s ease, transform 0.16s ease, visibility 0.16s ease;
		display: flex;
		flex-direction: column;
		gap: 4px;
		text-align: left;
	}
	:global(.markdown-body .citation-hover-card::after) {
		content: '';
		position: absolute;
		top: 100%;
		left: 50%;
		transform: translateX(-50%);
		border-width: 5px;
		border-style: solid;
		border-color: var(--surface) transparent transparent transparent;
	}
	:global(.markdown-body .citation-hover-card::before) {
		content: '';
		position: absolute;
		top: 100%;
		left: 50%;
		transform: translateX(-50%);
		border-width: 6px;
		border-style: solid;
		border-color: var(--border-strong) transparent transparent transparent;
	}
	:global(.markdown-body .citation-pill-wrapper:hover .citation-hover-card),
	:global(.markdown-body .citation-pill-wrapper:focus-within .citation-hover-card) {
		opacity: 1;
		pointer-events: auto;
		visibility: visible;
		transform: translateX(-50%) translateY(0);
	}
	:global(.markdown-body .hover-card-header) {
		display: flex;
		align-items: center;
		gap: 6px;
		font-size: var(--text-xs);
		color: var(--text-dim);
	}
	:global(.markdown-body .hover-card-favicon) {
		width: 14px;
		height: 14px;
		border-radius: 3px;
		object-fit: contain;
		flex-shrink: 0;
	}
	:global(.markdown-body .hover-card-domain) {
		font-weight: 600;
		color: var(--text-strong);
		font-size: 0.75rem;
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
		flex: 1;
	}
	:global(.markdown-body .hover-card-external) {
		color: var(--text-faint);
		flex-shrink: 0;
	}
	:global(.markdown-body .hover-card-title) {
		font-size: 0.8125rem;
		font-weight: 550;
		color: var(--text-body);
		line-height: 1.35;
		display: -webkit-box;
		-webkit-line-clamp: 2;
		line-clamp: 2;
		-webkit-box-orient: vertical;
		overflow: hidden;
		text-overflow: ellipsis;
		margin-top: 1px;
	}
	:global(.markdown-body .hover-card-url) {
		font-size: 0.65rem;
		color: var(--text-faint);
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
		font-family: ui-monospace, SFMono-Regular, monospace;
		opacity: 0.85;
	}

	/* ---------- Bottom Sources Toggle & List ---------- */
	.message-sources-wrapper {
		margin-top: 14px;
		padding-top: 10px;
		border-top: 1px dashed var(--border);
		display: flex;
		flex-direction: column;
		gap: 8px;
	}
	.sources-toggle-btn {
		display: inline-flex;
		align-items: center;
		gap: 6px;
		width: fit-content;
		padding: 5px 10px;
		border-radius: 6px;
		border: 1px solid var(--border);
		background: var(--surface-subtle);
		color: var(--text-muted);
		font-size: var(--text-xs);
		font-weight: 500;
		transition: all 0.16s ease;
		cursor: pointer;
		user-select: none;
	}
	.sources-toggle-btn:hover {
		background: var(--surface-hover);
		color: var(--text-strong);
		border-color: var(--border-strong);
	}
	.sources-toggle-btn.active {
		background: var(--surface-3);
		color: var(--text-strong);
		border-color: var(--border-strong);
	}
	.sources-count {
		display: inline-grid;
		place-items: center;
		min-width: 18px;
		height: 18px;
		padding: 0 5px;
		border-radius: 9px;
		background: color-mix(in srgb, var(--accent-bg) 12%, transparent);
		color: var(--text-strong);
		font-size: 0.6875rem;
		font-weight: 600;
	}
	:global(.sources-chevron) {
		transition: transform 0.2s ease;
		margin-left: 2px;
	}
	:global(.sources-chevron.rotate) {
		transform: rotate(180deg);
	}
	.sources-list {
		display: grid;
		grid-template-columns: repeat(auto-fill, minmax(220px, 1fr));
		gap: 8px;
		margin-top: 4px;
	}
	.source-card-item {
		display: flex;
		align-items: center;
		gap: 8px;
		padding: 8px 10px;
		border-radius: 8px;
		background: var(--surface);
		border: 1px solid var(--border);
		text-decoration: none;
		color: inherit;
		transition: all 0.16s ease;
		box-shadow: 0 1px 3px var(--shadow-softer);
	}
	.source-card-item:hover {
		border-color: var(--border-strong);
		background: var(--surface-hover);
		transform: translateY(-1px);
		box-shadow: 0 3px 8px var(--shadow-soft);
	}
	.source-item-badge {
		display: grid;
		place-items: center;
		width: 19px;
		height: 19px;
		border-radius: 50%;
		background: var(--accent-bg);
		color: var(--accent-fg);
		font-size: 0.65rem;
		font-weight: 650;
		flex-shrink: 0;
	}
	.source-item-favicon {
		width: 15px;
		height: 15px;
		border-radius: 3px;
		object-fit: contain;
		flex-shrink: 0;
	}
	.source-item-info {
		flex: 1;
		min-width: 0;
		display: flex;
		flex-direction: column;
		gap: 1px;
	}
	.source-item-title {
		font-size: var(--text-xs);
		font-weight: 550;
		color: var(--text-strong);
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
		line-height: 1.3;
	}
	.source-item-domain {
		font-size: 0.6875rem;
		color: var(--text-dim);
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
	}
	:global(.source-item-external) {
		color: var(--text-faint);
		flex-shrink: 0;
		margin-left: 2px;
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
