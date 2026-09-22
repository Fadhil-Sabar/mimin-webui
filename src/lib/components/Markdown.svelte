<script lang="ts">
	import { Marked, type MarkedExtension, type Tokens } from 'marked';
	import 'katex/dist/katex.min.css';
	import { slide } from 'svelte/transition';
	import { ChevronDown, ExternalLink, Globe } from '@lucide/svelte';
	import { escapeHtml, highlightCode } from '$lib/client/highlighter';
	import {
		parseCitationsAndSources,
		renderCitationPillHtml,
		type SourceItem
	} from '$lib/client/citations';
	import MermaidDiagram from '$lib/components/MermaidDiagram.svelte';
	import {
		invalidateSegmentCache,
		parseMarkdownSegments,
		type MarkdownSegment
	} from '$lib/client/markdown';

	interface Props {
		content: string;
		class?: string;
		/** Live stream state: renderers defer expensive work (e.g. mermaid) until it ends. */
		streaming?: boolean;
		sources?: Array<
			| {
					title?: string;
					url: string;
					snippet?: string;
					page?: number | null;
					type?: string;
					filename?: string;
			  }
			| SourceItem
		>;
	}

	let {
		content = '',
		class: className = '',
		streaming = false,
		sources: externalSources = []
	}: Props = $props();
	let showSources = $state(false);

	/**
	 * Content signature of `externalSources`, used as the segment-cache key and by
	 * `processed` to detect a no-op re-render. The citation/link renderers read
	 * `activeSourcesMap` at parse time, so cached HTML may only be reused when the
	 * sources it was built from are the same.
	 */
	const sourcesKey = $derived(
		externalSources
			.map(
				(s) =>
					`${s.url}|${s.title ?? ''}|${s.snippet ?? ''}|${s.page ?? ''}|${s.type ?? ''}|${s.filename ?? ''}|${'domain' in s ? s.domain : ''}|${'faviconUrl' in s ? s.faviconUrl : ''}`
			)
			.join('\n')
	);

	/** Plain (non-reactive) memo of the last `processed` run; see the derived below. */
	let lastProcessed: {
		content: string;
		sourcesKey: string;
		mathReady: boolean;
		result: { segments: MarkdownSegment[]; sources: SourceItem[] };
	} | null = null;

	/**
	 * Read by the citation/link renderers at parse time. It is reassigned inside the
	 * derived below immediately before parsing, and parsing is synchronous, so the
	 * renderers always see the sources of the content currently being parsed — which
	 * lets the Marked instance be built once instead of on every streamed frame.
	 */
	let activeSourcesMap: Record<number, SourceItem> = {};

	const COPY_BUTTON_HTML = `<button class="copy-code-btn" type="button" aria-label="Copy code"><svg class="copy-icon" xmlns="http://www.w3.org/2000/svg" width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect width="14" height="14" x="8" y="8" rx="2" ry="2"/><path d="M4 16c-1.1 0-2-.9-2-2V4c0-1.1.9-2 2-2h10c1.1 0 2 .9 2 2"/></svg><span class="copy-label">Copy</span></button>`;
	const RICH_COPY_BUTTON_HTML = `<button class="copy-code-btn copy-rich-btn" type="button" aria-label="Copy rich"><svg class="copy-icon" xmlns="http://www.w3.org/2000/svg" width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect width="14" height="14" x="8" y="8" rx="2" ry="2"/><path d="M4 16c-1.1 0-2-.9-2-2V4c0-1.1.9-2 2-2h10c1.1 0 2 .9 2 2"/></svg><span class="copy-label">Copy rich</span></button>`;

	/**
	 * KaTeX is ~270 KiB of JavaScript. Building the extensions is deferred to a dynamic
	 * import (see `enableMathSupport`) so conversations without math never pay for it.
	 */
	async function buildMathExtension(): Promise<MarkedExtension> {
		const { default: markedKatex } = await import('marked-katex-extension');
		const katexExtension = markedKatex({ throwOnError: false });
		const katexExtensions = katexExtension.extensions!.map((ext) => {
			if ((ext.name !== 'blockKatex' && ext.name !== 'inlineKatex') || !('renderer' in ext))
				return ext;
			const renderMath = ext.renderer as ((token: Tokens.Generic) => string) | undefined;
			if (!renderMath) return ext;
			const isBlockToken = ext.name === 'blockKatex';
			return {
				...ext,
				renderer(token: Tokens.Generic) {
					const html = renderMath(token);
					const displayMode = isBlockToken || token.displayMode === true;
					if (!displayMode) return html;
					const latex = String(token.text ?? '');
					return `<div class="code-block math-block" data-lang="latex"><div class="code-header"><span class="code-lang">LaTeX</span><div class="math-actions">${RICH_COPY_BUTTON_HTML}${COPY_BUTTON_HTML}</div></div><div class="math-body">${html}</div><pre hidden><code>${escapeHtml(latex)}</code></pre></div>\n`;
				}
			};
		});
		return { extensions: katexExtensions };
	}

	const marked = new Marked({
		gfm: true,
		breaks: true,
		extensions: [
			{
				name: 'citation',
				level: 'inline',
				start(src: string) {
					return src.match(/\[\^?\d+(?:[\s,;]+\^?\d+)*\](?!\()/)?.index;
				},
				tokenizer(src: string) {
					const rule = /^\[\^?(\d+(?:[\s,;]+\^?\d+)*)\](?!\()/;
					const match = rule.exec(src);
					if (match) {
						const raw = match[0];
						const indices = Array.from(
							new Set(
								match[1]
									.split(/[\s,;]+/)
									.map((s) => parseInt(s.replace(/^\^/, ''), 10))
									.filter((n) => !isNaN(n))
							)
						);
						return {
							type: 'citation',
							raw,
							indices
						};
					}
				},
				renderer(token: Tokens.Generic) {
					const indices: number[] = Array.isArray(token.indices)
						? token.indices
						: [Number(token.index || 1)];

					return indices
						.map((index) => {
							const source = activeSourcesMap[index];
							const url = source ? source.url : '#';
							const domain = source ? source.domain : '';
							const title = source ? source.title : `Source [${index}]`;
							const favicon = source ? source.faviconUrl : '';

							return renderCitationPillHtml(index, url, domain, title, favicon);
						})
						.join('');
				}
			}
		],
		renderer: {
			code({ text, lang }) {
				const { html: highlightedHtml, language } = highlightCode(text, lang);
				return `<div class="code-block" data-lang="${escapeHtml(language)}"><div class="code-header"><span class="code-lang">${escapeHtml(language)}</span>${COPY_BUTTON_HTML}</div><pre><code class="language-${escapeHtml(language)}">${highlightedHtml}</code></pre></div>`;
			},
			link({ href, title, text }) {
				const safeHref = href.startsWith('javascript:') ? '#' : href;
				const numMatch = text.match(/^\[?\^?(\d+)\]?$/);
				if (numMatch) {
					const index = parseInt(numMatch[1], 10);
					const source = activeSourcesMap[index];
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

	/**
	 * Loaded on demand: the first rendered content that looks like it contains math
	 * triggers the dynamic import, then the derived below re-parses with math enabled.
	 */
	const MATH_HINT = /\$[^\s$\n][^$\n]*?\$|\$\$/;
	let mathExtensionRequested = false;
	let mathReady = $state(false);

	async function enableMathSupport() {
		if (mathExtensionRequested) return;
		mathExtensionRequested = true;
		marked.use(await buildMathExtension());
		// Rendered HTML cached before this point has no math in it.
		invalidateSegmentCache(marked);
		mathReady = true;
	}

	$effect(() => {
		if (mathReady || typeof content !== 'string' || !content) return;
		if (MATH_HINT.test(content)) void enableMathSupport();
	});

	let processed = $derived.by(() => {
		// Read so the parse re-runs once the lazy KaTeX extension has landed.
		void mathReady;
		if (!content || typeof content !== 'string') {
			return { segments: [] as MarkdownSegment[], sources: [] as SourceItem[] };
		}
		/**
		 * Prop identity can churn every streamed frame without the data changing, so
		 * equality is judged on content: same text + same sources = same result, no
		 * re-parse. `mathReady` is part of the key because a result parsed before the
		 * lazy KaTeX extension landed renders math as plain text. This is what keeps
		 * idle messages still while a reply streams.
		 */
		if (
			lastProcessed &&
			lastProcessed.content === content &&
			lastProcessed.sourcesKey === sourcesKey &&
			lastProcessed.mathReady === mathReady
		) {
			return lastProcessed.result;
		}

		const { cleanedMarkdown, sources } = parseCitationsAndSources(content, externalSources);
		const sourcesMap: Record<number, SourceItem> = {};
		for (const src of sources) {
			sourcesMap[src.index] = src;
		}
		activeSourcesMap = sourcesMap;

		let result: { segments: MarkdownSegment[]; sources: SourceItem[] };
		try {
			result = {
				segments: parseMarkdownSegments(cleanedMarkdown, marked, { cacheKey: sourcesKey }),
				sources
			};
		} catch {
			result = {
				segments: [
					{
						type: 'html' as const,
						html: `<p>${escapeHtml(cleanedMarkdown)}</p>`,
						id: 'fallback'
					}
				],
				sources
			};
		}
		lastProcessed = { content, sourcesKey, mathReady, result };
		return result;
	});

	async function handleClick(event: MouseEvent) {
		const target = (event.target as HTMLElement)?.closest(
			'.copy-code-btn'
		) as HTMLButtonElement | null;
		if (!target) return;
		const codeBlock = target.closest('.code-block');
		if (!codeBlock) return;
		const isRich = target.classList.contains('copy-rich-btn');
		const codeEl = codeBlock.querySelector('pre code');
		const mathBody = codeBlock.querySelector('.math-body');
		if (isRich ? !mathBody : !codeEl) return;
		const label = target.querySelector('.copy-label');
		const originalLabel = label?.textContent ?? 'Copy';
		try {
			if (isRich) {
				const { copyMathBlock } = await import('$lib/client/math-clipboard');
				await copyMathBlock(mathBody as HTMLElement);
			} else {
				await navigator.clipboard.writeText(codeEl?.textContent || '');
			}
			target.classList.add('copied');
			if (label) label.textContent = 'Copied!';
			setTimeout(() => {
				target.classList.remove('copied');
				if (label) label.textContent = originalLabel;
			}, 2000);
		} catch {
			/* fallback */
		}
	}
</script>

<div class="markdown-container {className}">
	<!-- One wrapper for every segment: `.markdown-body > *:first/last-child` spacing
	     must see the whole message as one flow, and it carries the streaming caret
	     (see the ::after rule) so the caret never enters the markdown source. -->
	<div
		class="markdown-body"
		class:streaming-caret={streaming}
		role="presentation"
		onclick={handleClick}
	>
		{#each processed.segments as segment (segment.id)}
			{#if segment.type === 'html'}
				<!-- eslint-disable-next-line svelte/no-at-html-tags -->
				{@html segment.html}
			{:else if segment.type === 'mermaid'}
				<MermaidDiagram code={segment.code} {streaming} />
			{/if}
		{/each}
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
						<!-- eslint-disable-next-line svelte/no-navigation-without-resolve -->
						<a href={source.url} target="_blank" rel="noopener noreferrer" class="source-card-item">
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
								<div class="source-item-domain">
									{source.type === 'project_file'
										? source.page
											? `Page ${source.page}`
											: 'Project file'
										: source.domain}
								</div>
								{#if source.snippet}
									<div class="source-item-snippet">{source.snippet}</div>
								{/if}
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

	/* The streaming caret rides the trailing block's own ::after, so it lands inline
	 * at the end of the text (p/li/heading) or after the block (code, mermaid)
	 * without ever being appended to the markdown source — a caret inside the source
	 * flips fence pairing and tokenization while blocks are still open. `caret-fade`
	 * (layout.css) breathes it smoothly instead of a hard on/off blink. */
	:global(.markdown-body.streaming-caret > *:last-child::after) {
		content: '▍';
		color: var(--accent-bg);
		margin-left: 1px;
		animation: caret-fade 1.1s ease-in-out infinite;
	}

	:global(.markdown-body) {
		font-family: var(--font-body);
		font-size: var(--text-body-lg);
		line-height: var(--text-body-lg--line-height);
		letter-spacing: var(--text-body-lg--letter-spacing);
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
		margin: 0 0 var(--space-3);
	}
	/* Keep prose easy to scan while allowing code, tables, and diagrams to use the full width. */
	:global(.markdown-body p),
	:global(.markdown-body ul),
	:global(.markdown-body ol),
	:global(.markdown-body blockquote) {
		max-width: 68ch;
	}
	:global(.markdown-body h1),
	:global(.markdown-body h2),
	:global(.markdown-body h3),
	:global(.markdown-body h4) {
		color: var(--text-strong);
		font-family: var(--font-body);
		margin: 20px 0 var(--space-2);
	}
	:global(.markdown-body h1) {
		font-size: var(--text-headline-sm);
		line-height: var(--text-headline-sm--line-height);
		letter-spacing: var(--text-headline-sm--letter-spacing);
		font-weight: var(--text-headline-sm--font-weight);
	}
	:global(.markdown-body h2) {
		font-size: var(--text-title-lg);
		line-height: var(--text-title-lg--line-height);
		letter-spacing: var(--text-title-lg--letter-spacing);
		font-weight: var(--text-title-lg--font-weight);
	}
	:global(.markdown-body h3) {
		font-size: var(--text-title-md);
		line-height: var(--text-title-md--line-height);
		letter-spacing: var(--text-title-md--letter-spacing);
		font-weight: var(--text-title-md--font-weight);
	}
	:global(.markdown-body h4) {
		font-size: var(--text-title-sm);
		line-height: var(--text-title-sm--line-height);
		letter-spacing: var(--text-title-sm--letter-spacing);
		font-weight: var(--text-title-sm--font-weight);
		text-transform: uppercase;
	}
	:global(.markdown-body ul),
	:global(.markdown-body ol) {
		list-style: revert;
		list-style-position: outside;
		margin: 0 0 var(--space-3);
		padding-left: var(--space-5);
	}
	:global(.markdown-body li) {
		margin-bottom: var(--space-1);
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
		border-radius: 0 var(--radius-sm) var(--radius-sm) 0;
	}
	:global(.markdown-body blockquote p) {
		margin: 0;
	}
	:global(.markdown-body a:not(.citation-pill)) {
		color: var(--text-strong);
		background: color-mix(in srgb, var(--accent-bg) 8%, transparent);
		padding: 1px 5px;
		border-radius: var(--radius-sm);
		text-decoration: underline;
		text-underline-offset: 2px;
		font-weight: 500;
		transition: background var(--duration-short3) var(--ease-standard);
	}
	:global(.markdown-body a:not(.citation-pill):hover) {
		background: color-mix(in srgb, var(--accent-bg) 16%, transparent);
	}
	:global(.markdown-body strong) {
		color: var(--text-strong);
		font-weight: 500;
	}
	:global(.markdown-body code:not(pre code)) {
		font-family: var(--font-mono);
		font-size: 0.875em;
		background: var(--surface-3);
		color: var(--text-strong);
		padding: 2px 5px;
		border-radius: var(--radius-sm);
		border: 1px solid var(--border);
	}
	:global(.markdown-body .code-block) {
		margin: 14px 0;
		border: 1px solid var(--border-strong);
		border-radius: var(--radius-lg);
		background: var(--surface-2);
		overflow: hidden;
		box-shadow: 0 2px 8px var(--shadow-softer);
	}
	:global(.markdown-body .code-header) {
		display: flex;
		align-items: center;
		justify-content: space-between;
		padding: 6px var(--space-3);
		background: var(--surface-3);
		border-bottom: 1px solid var(--border);
		font-size: var(--text-body-sm);
		line-height: var(--text-body-sm--line-height);
		letter-spacing: var(--text-body-sm--letter-spacing);
		color: var(--text-muted);
		user-select: none;
	}
	:global(.markdown-body .code-lang) {
		font-family: var(--font-mono);
		font-weight: 500;
		text-transform: uppercase;
		color: var(--text-dim);
	}
	:global(.markdown-body .copy-code-btn) {
		display: inline-flex;
		align-items: center;
		gap: 5px;
		background: transparent;
		border: 1px solid var(--border);
		border-radius: var(--radius-sm);
		padding: 3px 7px;
		font-size: var(--text-body-sm);
		line-height: var(--text-body-sm--line-height);
		letter-spacing: var(--text-body-sm--letter-spacing);
		color: var(--text-muted);
		transition:
			color var(--duration-short3) var(--ease-standard),
			background var(--duration-short3) var(--ease-standard),
			border-color var(--duration-short3) var(--ease-standard);
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
	:global(.markdown-body .math-actions) {
		display: flex;
		align-items: center;
		gap: 6px;
	}
	:global(.markdown-body .math-block .math-body) {
		padding: var(--space-3) 14px;
		overflow-x: auto;
		scrollbar-width: thin;
		text-align: center;
	}
	:global(.markdown-body .math-block .katex-display) {
		margin: 0.35em 0;
	}
	:global(.markdown-body pre) {
		margin: 0;
		padding: var(--space-3) 14px;
		overflow-x: auto;
		scrollbar-width: thin;
		scrollbar-color: var(--scrollbar-thumb) transparent;
	}
	:global(.markdown-body pre code) {
		font-family: var(--font-mono);
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
		font-size: var(--text-body-md);
		line-height: var(--text-body-md--line-height);
		letter-spacing: var(--text-body-md--letter-spacing);
	}
	:global(.markdown-body th),
	:global(.markdown-body td) {
		border: 1px solid var(--border);
		padding: var(--space-2) var(--space-3);
		text-align: left;
	}
	:global(.markdown-body th) {
		background: var(--surface-3);
		color: var(--text-strong);
		font-weight: 500;
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
		border-radius: var(--radius-sm);
		background: var(--surface-3);
		border: 1px solid var(--border-strong);
		vertical-align: middle;
		margin: 0 2px;
		position: relative;
		top: -1px;
		text-decoration: none;
		transition:
			transform var(--duration-short3) var(--ease-standard),
			background var(--duration-short3) var(--ease-standard),
			border-color var(--duration-short3) var(--ease-standard),
			box-shadow var(--duration-short3) var(--ease-standard);
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
		border-radius: var(--radius-sm);
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
		padding: 10px var(--space-3);
		background: var(--surface);
		border: 1px solid var(--border-strong);
		border-radius: var(--radius-lg);
		box-shadow:
			0 12px 30px var(--shadow),
			0 2px 8px var(--shadow-soft);
		z-index: 70;
		opacity: 0;
		pointer-events: none;
		visibility: hidden;
		transition:
			opacity var(--duration-short3) var(--ease-standard),
			transform var(--duration-short3) var(--ease-standard),
			visibility var(--duration-short3) var(--ease-standard);
		display: flex;
		flex-direction: column;
		gap: var(--space-1);
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
		font-size: var(--text-body-sm);
		line-height: var(--text-body-sm--line-height);
		letter-spacing: var(--text-body-sm--letter-spacing);
		color: var(--text-dim);
	}
	:global(.markdown-body .hover-card-favicon) {
		width: 14px;
		height: 14px;
		border-radius: var(--radius-sm);
		object-fit: contain;
		flex-shrink: 0;
	}
	:global(.markdown-body .hover-card-domain) {
		line-height: var(--text-body-sm--line-height);
		letter-spacing: var(--text-body-sm--letter-spacing);
		font-weight: 500;
		color: var(--text-strong);
		font-size: var(--text-body-sm);
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
		font-size: var(--text-body-md);
		line-height: var(--text-body-md--line-height);
		letter-spacing: var(--text-body-md--letter-spacing);
		font-weight: 500;
		color: var(--text-body);
		display: -webkit-box;
		-webkit-line-clamp: 2;
		line-clamp: 2;
		-webkit-box-orient: vertical;
		overflow: hidden;
		text-overflow: ellipsis;
		margin-top: 1px;
	}
	:global(.markdown-body .hover-card-url) {
		font-size: var(--text-label-sm);
		line-height: var(--text-label-sm--line-height);
		letter-spacing: var(--text-label-sm--letter-spacing);
		color: var(--text-faint);
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
		font-family: var(--font-mono);
		opacity: 0.85;
	}

	/* ---------- Bottom Sources Toggle & List ---------- */
	.message-sources-wrapper {
		margin-top: 14px;
		padding-top: 10px;
		border-top: 1px dashed var(--border);
		display: flex;
		flex-direction: column;
		gap: var(--space-2);
	}
	.sources-toggle-btn {
		display: inline-flex;
		align-items: center;
		gap: 6px;
		width: fit-content;
		padding: 5px 10px;
		border-radius: var(--radius-md);
		border: 1px solid var(--border);
		background: var(--surface-subtle);
		color: var(--text-muted);
		font-size: var(--text-body-sm);
		line-height: var(--text-body-sm--line-height);
		letter-spacing: var(--text-body-sm--letter-spacing);
		font-weight: 500;
		transition:
			color var(--duration-short3) var(--ease-standard),
			background-color var(--duration-short3) var(--ease-standard),
			border-color var(--duration-short3) var(--ease-standard);
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
		border-radius: var(--radius-lg);
		background: color-mix(in srgb, var(--accent-bg) 12%, transparent);
		color: var(--text-strong);
		font-size: var(--text-label-sm);
		line-height: var(--text-label-sm--line-height);
		letter-spacing: var(--text-label-sm--letter-spacing);
		font-weight: 500;
	}
	:global(.sources-chevron) {
		transition: transform var(--duration-short4) var(--ease-standard);
		margin-left: 2px;
	}
	:global(.sources-chevron.rotate) {
		transform: rotate(180deg);
	}
	.sources-list {
		display: grid;
		grid-template-columns: repeat(auto-fill, minmax(220px, 1fr));
		gap: var(--space-2);
		margin-top: var(--space-1);
	}
	.source-card-item {
		display: flex;
		align-items: center;
		gap: var(--space-2);
		padding: var(--space-2) 10px;
		border-radius: var(--radius-lg);
		background: var(--surface);
		border: 1px solid var(--border);
		text-decoration: none;
		color: inherit;
		transition:
			background-color var(--duration-short3) var(--ease-standard),
			border-color var(--duration-short3) var(--ease-standard),
			box-shadow var(--duration-short3) var(--ease-standard),
			transform var(--duration-short3) var(--ease-standard);
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
		font-size: var(--text-label-sm);
		line-height: var(--text-label-sm--line-height);
		letter-spacing: var(--text-label-sm--letter-spacing);
		font-weight: 500;
		flex-shrink: 0;
	}
	.source-item-favicon {
		width: 15px;
		height: 15px;
		border-radius: var(--radius-sm);
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
		font-size: var(--text-body-md);
		line-height: var(--text-body-md--line-height);
		letter-spacing: var(--text-body-md--letter-spacing);
		font-weight: 500;
		color: var(--text-strong);
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
	}
	.source-item-domain {
		font-size: var(--text-label-sm);
		line-height: var(--text-label-sm--line-height);
		letter-spacing: var(--text-label-sm--letter-spacing);
		color: var(--text-dim);
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
	}
	.source-item-snippet {
		margin-top: var(--space-1);
		font-size: var(--text-body-md);
		line-height: var(--text-body-md--line-height);
		letter-spacing: var(--text-body-md--letter-spacing);
		color: var(--text-body);
		display: -webkit-box;
		-webkit-box-orient: vertical;
		-webkit-line-clamp: 3;
		line-clamp: 3;
		overflow: hidden;
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
		color: #686862;
		font-style: italic;
	}
	:global(.markdown-body .token.punctuation),
	:global(.markdown-body .token.delimiter) {
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
		font-weight: 500;
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
		color: #95959d;
		font-style: italic;
	}
	:global(:root[data-theme='dark'] .markdown-body .token.punctuation),
	:global(:root[data-theme='dark'] .markdown-body .token.delimiter) {
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
		font-weight: 500;
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
