<script lang="ts">
	import { Monitor, RotateCw, Smartphone, Tablet } from '@lucide/svelte';
	import type { ViewportDevice } from '$lib/canvas';
	import { VIEWPORT_SPECS } from '$lib/canvas';
	import CanvasPreviewViewport from './CanvasPreviewViewport.svelte';

	type Draft = { html: string; css: string; js: string };
	type Props = {
		draft: Draft;
		sceneName: string;
		viewport: ViewportDevice;
	};

	let { draft, sceneName, viewport: initialViewport }: Props = $props();
	let selectedViewport = $state<ViewportDevice>('desktop');
	let previewDraft = $state<Draft>({ html: '', css: '', js: '' });
	let initialized = false;
	$effect(() => {
		if (!initialized) {
			selectedViewport = initialViewport;
			previewDraft = { html: draft.html, css: draft.css, js: draft.js };
			initialized = true;
		}
	});
	let timer: ReturnType<typeof setTimeout> | undefined;
	let frameKey = $state(0);

	$effect(() => {
		const pending = { html: draft.html, css: draft.css, js: draft.js };
		clearTimeout(timer);
		timer = setTimeout(() => (previewDraft = pending), 300);
		return () => clearTimeout(timer);
	});

	function restartPreview() {
		clearTimeout(timer);
		previewDraft = { html: draft.html, css: draft.css, js: draft.js };
		frameKey += 1;
	}
</script>

<section class="editor-preview" aria-label="Live preview">
	<header class="preview-toolbar">
		<div class="viewport-controls" role="group" aria-label="Preview device">
			<button
				type="button"
				class:active={selectedViewport === 'mobile'}
				aria-label="Preview mobile"
				aria-pressed={selectedViewport === 'mobile'}
				onclick={() => (selectedViewport = 'mobile')}><Smartphone size={14} /></button
			>
			<button
				type="button"
				class:active={selectedViewport === 'tablet'}
				aria-label="Preview tablet"
				aria-pressed={selectedViewport === 'tablet'}
				onclick={() => (selectedViewport = 'tablet')}><Tablet size={14} /></button
			>
			<button
				type="button"
				class:active={selectedViewport === 'desktop'}
				aria-label="Preview desktop"
				aria-pressed={selectedViewport === 'desktop'}
				onclick={() => (selectedViewport = 'desktop')}><Monitor size={14} /></button
			>
			<button
				type="button"
				class="restart-button"
				aria-label="Restart preview"
				title="Restart preview"
				onclick={restartPreview}><RotateCw size={13} /> <span>Restart</span></button
			>
		</div>
		<span class="dimensions"
			>{VIEWPORT_SPECS[selectedViewport].width} × {VIEWPORT_SPECS[selectedViewport].height}</span
		>
	</header>
	<div class="preview-stage">
		{#key frameKey}
			<CanvasPreviewViewport
				html={previewDraft.html}
				css={previewDraft.css}
				js={previewDraft.js}
				title={sceneName}
				viewport={selectedViewport}
			/>
		{/key}
	</div>
</section>

<style>
	.editor-preview {
		display: flex;
		flex: 1 1 0;
		height: 100%;
		flex-direction: column;
		min-width: 0;
		min-height: 0;
		background: var(--bg);
	}

	.preview-toolbar {
		display: flex;
		align-items: center;
		justify-content: space-between;
		flex-wrap: wrap;
		flex-shrink: 0;
		gap: var(--space-2);
		min-height: 40px;
		padding: 5px var(--space-3);
		border-bottom: 1px solid var(--border);
		background: var(--surface-2);
	}

	.viewport-controls {
		display: flex;
		align-items: center;
		gap: 3px;
	}

	.viewport-controls button {
		display: inline-flex;
		align-items: center;
		justify-content: center;
		gap: 5px;
		min-width: 28px;
		height: 27px;
		padding: 0 6px;
		border: 1px solid transparent;
		border-radius: var(--radius-sm);
		background: transparent;
		color: var(--text-muted);
		cursor: pointer;
	}

	.viewport-controls button:hover,
	.viewport-controls button.active {
		border-color: var(--border);
		background: var(--surface);
		color: var(--text-strong);
	}

	.viewport-controls button:focus-visible {
		outline: 2px solid var(--focus);
		outline-offset: 2px;
	}

	.restart-button span {
		font-size: var(--text-label-sm);
	}

	.dimensions {
		color: var(--text-muted);
		font-size: var(--text-label-sm);
		font-variant-numeric: tabular-nums;
		white-space: nowrap;
	}

	.preview-stage {
		flex: 1;
		min-width: 0;
		min-height: 0;
		overflow: hidden;
		padding: var(--space-3);
	}

	.preview-stage :global(.viewport-stage) {
		border: 1px solid var(--border);
		border-radius: var(--radius-md);
		background: var(--surface-subtle);
	}
</style>
