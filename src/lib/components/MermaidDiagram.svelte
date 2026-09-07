<script lang="ts">
	import { browser } from '$app/environment';
	import {
		Workflow,
		Eye,
		Code,
		Copy,
		Check,
		Download,
		Maximize2,
		ZoomIn,
		ZoomOut,
		RotateCcw,
		X,
		CircleAlert
	} from '@lucide/svelte';
	import { highlightCode } from '$lib/client/highlighter';
	import { themeState } from '$lib/client/theme.svelte';
	import { renderMermaid, getCachedMermaidSvg, downloadSvg } from '$lib/client/mermaid';

	interface Props {
		code: string;
		class?: string;
	}

	let { code = '', class: className = '' }: Props = $props();

	let activeTab = $state<'diagram' | 'code'>('diagram');
	let svgHtml = $state('');
	let isLoading = $state(true);
	let error = $state<string | null>(null);
	let copied = $state(false);

	// Fullscreen & Pan/Zoom modal state
	let isZoomed = $state(false);
	let zoomScale = $state(1);
	let panX = $state(0);
	let panY = $state(0);
	let isPanning = $state(false);
	let startPointerX = 0;
	let startPointerY = 0;
	let startPanX = 0;
	let startPanY = 0;

	// Highlighted code for Code tab
	let highlightedCode = $derived.by(() => {
		return highlightCode(code, 'mermaid').html;
	});

	$effect(() => {
		const currentCode = code;
		const isDark = themeState.isDark;

		if (!browser) {
			isLoading = false;
			return;
		}

		const trimmed = currentCode.trim();
		if (!trimmed) {
			svgHtml = '';
			isLoading = false;
			error = null;
			return;
		}

		// Instant load from cache if available
		const cached = getCachedMermaidSvg(trimmed, isDark);
		if (cached) {
			svgHtml = cached;
			isLoading = false;
			error = null;
			return;
		}

		// Debounce rendering (especially while streaming)
		isLoading = true;
		let cancelled = false;

		const timer = setTimeout(async () => {
			try {
				const rendered = await renderMermaid(trimmed, isDark);
				if (!cancelled) {
					svgHtml = rendered;
					error = null;
					isLoading = false;
				}
			} catch (err: unknown) {
				if (!cancelled) {
					const msg = err instanceof Error ? err.message : String(err);
					error = msg;
					isLoading = false;
				}
			}
		}, 150);

		return () => {
			cancelled = true;
			clearTimeout(timer);
		};
	});

	async function copyCode() {
		try {
			await navigator.clipboard.writeText(code);
			copied = true;
			setTimeout(() => {
				copied = false;
			}, 2000);
		} catch {
			/* fallback */
		}
	}

	function handleDownload() {
		if (svgHtml) {
			downloadSvg(svgHtml, 'mermaid-diagram.svg');
		}
	}

	function openModal() {
		isZoomed = true;
		zoomScale = 1;
		panX = 0;
		panY = 0;
	}

	function closeModal() {
		isZoomed = false;
	}

	function zoomIn() {
		zoomScale = Math.min(Number((zoomScale + 0.25).toFixed(2)), 4);
	}

	function zoomOut() {
		zoomScale = Math.max(Number((zoomScale - 0.25).toFixed(2)), 0.25);
	}

	function resetZoom() {
		zoomScale = 1;
		panX = 0;
		panY = 0;
	}

	function handleWheel(event: WheelEvent) {
		event.preventDefault();
		const delta = event.deltaY < 0 ? 0.15 : -0.15;
		zoomScale = Math.min(Math.max(Number((zoomScale + delta).toFixed(2)), 0.25), 4);
	}

	function handlePointerDown(event: PointerEvent) {
		if (event.button !== 0) return;
		isPanning = true;
		startPointerX = event.clientX;
		startPointerY = event.clientY;
		startPanX = panX;
		startPanY = panY;
		(event.currentTarget as HTMLElement)?.setPointerCapture(event.pointerId);
	}

	function handlePointerMove(event: PointerEvent) {
		if (!isPanning) return;
		panX = startPanX + (event.clientX - startPointerX);
		panY = startPanY + (event.clientY - startPointerY);
	}

	function handlePointerUp(event: PointerEvent) {
		if (!isPanning) return;
		isPanning = false;
		try {
			(event.currentTarget as HTMLElement)?.releasePointerCapture(event.pointerId);
		} catch {
			/* no-op */
		}
	}

	function handleKeydown(event: KeyboardEvent) {
		if (isZoomed && event.key === 'Escape') {
			closeModal();
		}
	}
</script>

<svelte:window onkeydown={handleKeydown} />

<div class="mermaid-diagram-card {className}">
	<div class="mermaid-header">
		<div class="mermaid-header-left">
			<div class="mermaid-badge">
				<Workflow size={13} class="badge-icon" />
				<span class="badge-title">Mermaid</span>
			</div>
			<div class="mermaid-tabs" role="tablist">
				<button
					type="button"
					role="tab"
					aria-selected={activeTab === 'diagram'}
					class="mermaid-tab"
					class:active={activeTab === 'diagram'}
					onclick={() => (activeTab = 'diagram')}
				>
					<Eye size={12} />
					<span>Diagram</span>
				</button>
				<button
					type="button"
					role="tab"
					aria-selected={activeTab === 'code'}
					class="mermaid-tab"
					class:active={activeTab === 'code'}
					onclick={() => (activeTab = 'code')}
				>
					<Code size={12} />
					<span>Code</span>
				</button>
			</div>
		</div>

		<div class="mermaid-header-actions">
			{#if activeTab === 'diagram' && svgHtml}
				<button
					type="button"
					class="action-btn"
					onclick={handleDownload}
					title="Download SVG"
					aria-label="Download SVG"
				>
					<Download size={13} />
					<span class="btn-label">SVG</span>
				</button>
				<button
					type="button"
					class="action-btn"
					onclick={openModal}
					title="Expand diagram"
					aria-label="Expand diagram"
				>
					<Maximize2 size={13} />
					<span class="btn-label">Expand</span>
				</button>
			{/if}

			<button
				type="button"
				class="action-btn copy-btn"
				class:copied
				onclick={copyCode}
				title="Copy Mermaid code"
				aria-label="Copy Mermaid code"
			>
				{#if copied}
					<Check size={13} />
					<span class="btn-label">Copied!</span>
				{:else}
					<Copy size={13} />
					<span class="btn-label">Copy</span>
				{/if}
			</button>
		</div>
	</div>

	{#if activeTab === 'diagram'}
		<div class="mermaid-viewport">
			{#if isLoading && !svgHtml}
				<div class="mermaid-loading-state">
					<div class="spinner"></div>
					<span>Rendering diagram...</span>
				</div>
			{:else if error && !svgHtml}
				<div class="mermaid-error-state">
					<div class="error-header">
						<CircleAlert size={16} class="error-icon" />
						<span class="error-title">Diagram syntax error</span>
					</div>
					<p class="error-desc">The diagram contains syntax that could not be parsed by Mermaid.</p>
					<button type="button" class="view-code-btn" onclick={() => (activeTab = 'code')}>
						<Code size={13} />
						<span>View Mermaid Code</span>
					</button>
				</div>
			{:else if svgHtml}
				<div class="mermaid-svg-container">
					<!-- eslint-disable-next-line svelte/no-at-html-tags -->
					{@html svgHtml}
				</div>
			{/if}
		</div>
	{:else}
		<div class="mermaid-code-view">
			<!-- eslint-disable-next-line svelte/no-at-html-tags -->
			<pre><code class="language-mermaid">{@html highlightedCode}</code></pre>
		</div>
	{/if}
</div>

{#if isZoomed}
	<div
		class="mermaid-modal-backdrop"
		role="dialog"
		aria-modal="true"
		aria-label="Mermaid Diagram Fullscreen View"
	>
		<div class="mermaid-modal-container">
			<div class="mermaid-modal-header">
				<div class="modal-title-area">
					<Workflow size={15} />
					<span class="modal-title">Mermaid Diagram</span>
					<span class="zoom-badge">{Math.round(zoomScale * 100)}%</span>
				</div>

				<div class="modal-actions">
					<div class="zoom-controls">
						<button
							type="button"
							class="modal-btn"
							onclick={zoomOut}
							title="Zoom out"
							aria-label="Zoom out"
						>
							<ZoomOut size={14} />
						</button>
						<button
							type="button"
							class="modal-btn"
							onclick={resetZoom}
							title="Reset zoom (100%)"
							aria-label="Reset zoom"
						>
							<RotateCcw size={13} />
						</button>
						<button
							type="button"
							class="modal-btn"
							onclick={zoomIn}
							title="Zoom in"
							aria-label="Zoom in"
						>
							<ZoomIn size={14} />
						</button>
					</div>

					<button
						type="button"
						class="modal-btn"
						onclick={handleDownload}
						title="Download SVG"
						aria-label="Download SVG"
					>
						<Download size={14} />
					</button>

					<button
						type="button"
						class="modal-btn close-btn"
						onclick={closeModal}
						title="Close modal (Esc)"
						aria-label="Close modal"
					>
						<X size={15} />
					</button>
				</div>
			</div>

			<div
				class="mermaid-modal-canvas"
				class:panning={isPanning}
				onwheel={handleWheel}
				onpointerdown={handlePointerDown}
				onpointermove={handlePointerMove}
				onpointerup={handlePointerUp}
				role="region"
				aria-label="Pan and zoom canvas"
			>
				<div
					class="mermaid-transform-target"
					style="transform: translate({panX}px, {panY}px) scale({zoomScale}); transform-origin: center center;"
				>
					<!-- eslint-disable-next-line svelte/no-at-html-tags -->
					{@html svgHtml}
				</div>
			</div>

			<div class="modal-footer-hint">
				<span>Drag to pan &bull; Scroll to zoom &bull; Esc to close</span>
			</div>
		</div>
	</div>
{/if}

<style>
	.mermaid-diagram-card {
		margin: 16px 0;
		border: 1px solid var(--border-strong);
		border-radius: 8px;
		background: var(--surface-2);
		overflow: hidden;
		box-shadow: 0 2px 8px var(--shadow-softer);
		transition: border-color 0.15s ease;
	}

	.mermaid-header {
		display: flex;
		align-items: center;
		justify-content: space-between;
		padding: 6px 10px;
		background: var(--surface-3);
		border-bottom: 1px solid var(--border);
		gap: 8px;
		flex-wrap: wrap;
	}

	.mermaid-header-left {
		display: flex;
		align-items: center;
		gap: 8px;
	}

	.mermaid-badge {
		display: inline-flex;
		align-items: center;
		gap: 5px;
		font-size: var(--text-xs);
		font-weight: 600;
		color: var(--text-dim);
		text-transform: uppercase;
		letter-spacing: 0.04em;
		user-select: none;
	}

	:global(.badge-icon) {
		color: var(--text-muted);
	}

	.mermaid-tabs {
		display: inline-flex;
		align-items: center;
		background: var(--surface);
		padding: 2px;
		border-radius: 6px;
		border: 1px solid var(--border);
		gap: 2px;
	}

	.mermaid-tab {
		display: inline-flex;
		align-items: center;
		gap: 4px;
		padding: 2px 8px;
		border-radius: 4px;
		border: none;
		background: transparent;
		font-size: 0.75rem;
		font-weight: 500;
		color: var(--text-muted);
		cursor: pointer;
		transition: all 0.14s ease;
	}

	.mermaid-tab:hover {
		color: var(--text-strong);
	}

	.mermaid-tab.active {
		background: var(--surface-hover);
		color: var(--text-strong);
		font-weight: 600;
		box-shadow: 0 1px 2px var(--shadow-softer);
	}

	.mermaid-header-actions {
		display: flex;
		align-items: center;
		gap: 6px;
	}

	.action-btn {
		display: inline-flex;
		align-items: center;
		gap: 4px;
		background: transparent;
		border: 1px solid var(--border);
		border-radius: 4px;
		padding: 3px 8px;
		font-size: var(--text-xs);
		color: var(--text-muted);
		cursor: pointer;
		transition: all 0.14s ease;
	}

	.action-btn:hover {
		background: var(--surface-hover);
		color: var(--text-strong);
		border-color: var(--border-strong);
	}

	.copy-btn.copied {
		background: var(--status-ok-dot);
		color: #ffffff;
		border-color: var(--status-ok-dot);
	}

	.btn-label {
		font-size: 0.75rem;
	}

	.mermaid-viewport {
		min-height: 120px;
		display: flex;
		align-items: center;
		justify-content: center;
		padding: 16px;
		overflow-x: auto;
		background: var(--surface);
	}

	.mermaid-svg-container {
		width: 100%;
		display: flex;
		justify-content: center;
		align-items: center;
		overflow-x: auto;
		scrollbar-width: thin;
	}

	:global(.mermaid-svg-container svg),
	:global(.mermaid-transform-target svg) {
		max-width: 100%;
		height: auto;
		display: block;
		margin: 0 auto;
	}

	.mermaid-loading-state {
		display: flex;
		align-items: center;
		gap: 10px;
		color: var(--text-muted);
		font-size: var(--text-sm);
		padding: 24px;
	}

	.spinner {
		width: 16px;
		height: 16px;
		border: 2px solid var(--border-strong);
		border-top-color: var(--text-strong);
		border-radius: 50%;
		animation: spin 0.8s linear infinite;
	}

	@keyframes spin {
		to {
			transform: rotate(360deg);
		}
	}

	.mermaid-error-state {
		display: flex;
		flex-direction: column;
		align-items: center;
		text-align: center;
		gap: 8px;
		padding: 24px;
		color: var(--danger-text);
		max-width: 440px;
	}

	.error-header {
		display: flex;
		align-items: center;
		gap: 6px;
		font-weight: 600;
		font-size: var(--text-sm);
	}

	.error-desc {
		font-size: var(--text-xs);
		color: var(--text-muted);
		margin: 0;
	}

	.view-code-btn {
		display: inline-flex;
		align-items: center;
		gap: 6px;
		margin-top: 4px;
		padding: 4px 10px;
		border-radius: 5px;
		border: 1px solid var(--border-strong);
		background: var(--surface-2);
		color: var(--text-strong);
		font-size: var(--text-xs);
		cursor: pointer;
		transition: background 0.15s ease;
	}

	.view-code-btn:hover {
		background: var(--surface-hover);
	}

	.mermaid-code-view pre {
		margin: 0;
		padding: 12px 14px;
		overflow-x: auto;
		scrollbar-width: thin;
		scrollbar-color: var(--scrollbar-thumb) transparent;
		background: var(--surface-2);
	}

	.mermaid-code-view code {
		font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace;
		font-size: 0.875em;
		line-height: 1.55;
		color: var(--text-strong);
		white-space: pre;
		background: transparent;
		border: 0;
		padding: 0;
	}

	/* ---------- Fullscreen / Zoom Modal ---------- */
	.mermaid-modal-backdrop {
		position: fixed;
		inset: 0;
		z-index: 100;
		background: var(--overlay);
		backdrop-filter: blur(4px);
		display: flex;
		align-items: center;
		justify-content: center;
		padding: 24px;
	}

	.mermaid-modal-container {
		width: 95vw;
		height: 90vh;
		background: var(--surface);
		border: 1px solid var(--border-strong);
		border-radius: 12px;
		box-shadow: 0 20px 45px var(--shadow);
		display: flex;
		flex-direction: column;
		overflow: hidden;
	}

	.mermaid-modal-header {
		display: flex;
		align-items: center;
		justify-content: space-between;
		padding: 10px 16px;
		background: var(--surface-2);
		border-bottom: 1px solid var(--border);
	}

	.modal-title-area {
		display: flex;
		align-items: center;
		gap: 8px;
		font-size: var(--text-sm);
		font-weight: 600;
		color: var(--text-strong);
	}

	.zoom-badge {
		font-size: var(--text-xs);
		font-weight: 500;
		color: var(--text-muted);
		background: var(--surface-3);
		padding: 2px 6px;
		border-radius: 4px;
		border: 1px solid var(--border);
	}

	.modal-actions {
		display: flex;
		align-items: center;
		gap: 8px;
	}

	.zoom-controls {
		display: flex;
		align-items: center;
		background: var(--surface);
		border: 1px solid var(--border);
		border-radius: 6px;
		padding: 2px;
		gap: 2px;
	}

	.modal-btn {
		display: inline-flex;
		align-items: center;
		justify-content: center;
		width: 28px;
		height: 28px;
		border-radius: 4px;
		border: none;
		background: transparent;
		color: var(--text-muted);
		cursor: pointer;
		transition: all 0.14s ease;
	}

	.modal-btn:hover {
		background: var(--surface-hover);
		color: var(--text-strong);
	}

	.modal-btn.close-btn:hover {
		background: var(--danger-bg);
		color: #ffffff;
	}

	.mermaid-modal-canvas {
		flex: 1;
		width: 100%;
		height: 100%;
		overflow: hidden;
		cursor: grab;
		display: flex;
		align-items: center;
		justify-content: center;
		position: relative;
		user-select: none;
		touch-action: none;
		background: radial-gradient(var(--border) 1px, transparent 1px);
		background-size: 20px 20px;
	}

	.mermaid-modal-canvas.panning {
		cursor: grabbing;
	}

	.mermaid-transform-target {
		transition: transform 0.05s ease-out;
		will-change: transform;
		display: flex;
		align-items: center;
		justify-content: center;
		max-width: 90%;
		max-height: 90%;
	}

	.modal-footer-hint {
		padding: 6px 16px;
		text-align: center;
		font-size: var(--text-xs);
		color: var(--text-dim);
		background: var(--surface-2);
		border-top: 1px solid var(--border);
	}
</style>
