<script lang="ts">
	import {
		BookOpen,
		Code2,
		Download,
		Eye,
		LayoutGrid,
		LayoutTemplate,
		Maximize2,
		Plus,
		RefreshCw,
		ZoomIn,
		ZoomOut,
		X
	} from '@lucide/svelte';
	import type { CanvasDetail, CanvasScene } from '$lib/canvas';

	type ViewMode = 'preview' | 'code';
	type ExportFormat = 'scene-html' | 'scene-png' | 'all-png' | 'canvas-zip';

	type Props = {
		canvas: CanvasDetail;
		activeScene: CanvasScene | null;
		viewMode?: ViewMode;
		showGuideline?: boolean;
		arranging?: boolean;
		refreshing?: boolean;
		onviewmodechange: (mode: ViewMode) => void;
		ontoggleguideline: () => void;
		onarrange: () => void | Promise<unknown>;
		onzoomout: () => void | Promise<unknown>;
		onzoomin: () => void | Promise<unknown>;
		onfitview: () => void | Promise<unknown>;
		onaddscene: () => void;
		onrefresh?: () => void | Promise<void>;
	};

	let {
		canvas,
		activeScene,
		viewMode = 'preview',
		showGuideline = false,
		arranging = false,
		refreshing = false,
		onviewmodechange,
		ontoggleguideline,
		onarrange,
		onzoomout,
		onzoomin,
		onfitview,
		onaddscene,
		onrefresh
	}: Props = $props();

	let exportMenu: HTMLDetailsElement;
	let exporting = $state(false);
	let exportError = $state('');

	async function exportCanvas(format: ExportFormat) {
		if (exporting) return;
		if ((format === 'scene-html' || format === 'scene-png') && !activeScene) return;
		exportMenu.open = false;
		exportError = '';
		exporting = true;
		try {
			const sceneQuery =
				format === 'scene-html' || format === 'scene-png'
					? `&sceneId=${encodeURIComponent(activeScene!.id)}`
					: '';
			const response = await fetch(
				`/api/canvases/${encodeURIComponent(canvas.id)}/export?format=${format}${sceneQuery}`
			);
			if (!response.ok) {
				const result = await response.json().catch(() => null);
				throw new Error(result?.error?.message ?? `Export failed (${response.status}).`);
			}
			const disposition = response.headers.get('content-disposition') ?? '';
			const filename = disposition.match(/filename="([^"]+)"/)?.[1] ?? 'canvas-export';
			const url = URL.createObjectURL(await response.blob());
			const link = document.createElement('a');
			link.href = url;
			link.download = filename;
			link.click();
			setTimeout(() => URL.revokeObjectURL(url), 60_000);
		} catch (error) {
			exportError = error instanceof Error ? error.message : 'Export failed.';
		} finally {
			exporting = false;
		}
	}
</script>

<header class="canvas-topbar">
	<div class="canvas-meta">
		<LayoutTemplate size={16} class="canvas-meta-icon" />
		<h2 class="canvas-title" title={canvas.title}>{canvas.title}</h2>
		<span class="revision-tag" title="Revision {canvas.revision}">v{canvas.revision}</span>
	</div>

	<div class="toolbar-right">
		<div class="view-toggle">
			<button
				type="button"
				class="toggle-btn"
				class:active={viewMode === 'preview'}
				onclick={() => onviewmodechange('preview')}
				title="Visual Preview"
				aria-label="Visual Preview"
			>
				<Eye size={14} />
			</button>
			<button
				type="button"
				class="toggle-btn"
				class:active={viewMode === 'code'}
				onclick={() => onviewmodechange('code')}
				title="Source Code"
				aria-label="Source Code"
			>
				<Code2 size={14} />
			</button>
		</div>

		<details class="export-menu" bind:this={exportMenu}>
			<summary class="action-btn" aria-label="Export Canvas">
				<Download size={14} /> <span class="btn-text">{exporting ? 'Exporting…' : 'Export'}</span>
			</summary>
			<div class="export-options">
				<button
					type="button"
					disabled={!activeScene || exporting}
					onclick={() => exportCanvas('scene-html')}>Active scene · HTML</button
				>
				<button
					type="button"
					disabled={!activeScene || exporting}
					onclick={() => exportCanvas('scene-png')}>Active scene · PNG</button
				>
				<button
					type="button"
					disabled={canvas.scenes.length === 0 || exporting}
					onclick={() => exportCanvas('all-png')}>All scenes · PNG ZIP</button
				>
				<button type="button" disabled={exporting} onclick={() => exportCanvas('canvas-zip')}
					>Canvas · Complete ZIP</button
				>
			</div>
		</details>

		<button
			type="button"
			class="action-btn"
			class:active={showGuideline}
			onclick={ontoggleguideline}
			title="Style Guideline"
		>
			<BookOpen size={14} />
			<span class="btn-text">Guideline</span>
		</button>

		{#if onrefresh}
			<button
				type="button"
				class="icon-btn"
				onclick={onrefresh}
				disabled={refreshing}
				title="Reload Canvas"
				aria-label="Reload Canvas"
			>
				<RefreshCw size={13} class={refreshing ? 'spin' : ''} />
			</button>
		{/if}
	</div>
</header>

{#if exportError}
	<div class="export-error" role="alert">
		{exportError}
		<button type="button" onclick={() => (exportError = '')} aria-label="Dismiss export error"
			><X size={12} /></button
		>
	</div>
{/if}

<div class="scenes-bar">
	<div class="scenes-scroll">
		<span class="scene-count"
			>{canvas.scenes.length} scenes · Drag a frame to arrange · Connect handles for navigation</span
		>
	</div>
	<div class="canvas-controls">
		<button
			class="icon-btn"
			onclick={onarrange}
			disabled={arranging || canvas.scenes.length === 0}
			title="Auto arrange scenes"
			aria-label="Auto arrange scenes"
			><LayoutGrid size={14} class={arranging ? 'spin' : ''} /></button
		>
		<button class="icon-btn" onclick={onzoomout} title="Zoom out" aria-label="Zoom out"
			><ZoomOut size={14} /></button
		>
		<button class="icon-btn" onclick={onzoomin} title="Zoom in" aria-label="Zoom in"
			><ZoomIn size={14} /></button
		>
		<button class="icon-btn" onclick={onfitview} title="Fit all scenes" aria-label="Fit all scenes"
			><Maximize2 size={14} /></button
		>
		<button class="add-scene-btn" onclick={onaddscene}><Plus size={12} /> Add scene</button>
	</div>
</div>

<style>
	.canvas-topbar {
		display: flex;
		align-items: center;
		justify-content: space-between;
		padding: var(--space-2) var(--space-4);
		height: 48px;
		background: var(--bg);
		border-bottom: 1px solid var(--border);
		gap: var(--space-3);
		flex-shrink: 0;
	}

	.canvas-meta {
		display: flex;
		align-items: center;
		gap: var(--space-2);
		min-width: 0;
	}

	:global(.canvas-meta-icon) {
		color: var(--text-muted);
		flex-shrink: 0;
	}

	.canvas-title {
		margin: 0;
		font-size: var(--text-body-md);
		line-height: var(--text-body-md--line-height);
		letter-spacing: var(--text-body-md--letter-spacing);
		font-weight: 500;
		color: var(--text-strong);
		white-space: nowrap;
		overflow: hidden;
		text-overflow: ellipsis;
		max-width: 220px;
	}

	.revision-tag {
		font-size: var(--text-body-sm);
		line-height: var(--text-body-sm--line-height);
		letter-spacing: var(--text-body-sm--letter-spacing);
		color: var(--text-faint);
		background: var(--surface-2);
		border: 1px solid var(--border);
		padding: 1px 6px;
		border-radius: var(--radius-sm);
		font-variant-numeric: tabular-nums;
	}

	.toolbar-right {
		display: flex;
		align-items: center;
		gap: 6px;
	}

	.export-menu {
		position: relative;
	}

	.export-menu summary {
		list-style: none;
	}

	.export-menu summary::-webkit-details-marker {
		display: none;
	}

	.export-options {
		position: absolute;
		right: 0;
		top: calc(100% + 5px);
		z-index: 20;
		min-width: 205px;
		padding: 5px;
		border: 1px solid var(--border);
		border-radius: var(--radius-md);
		background: var(--surface);
		box-shadow: 0 8px 25px var(--shadow-softer);
	}

	.export-options button {
		display: block;
		width: 100%;
		padding: var(--space-2) 9px;
		border: 0;
		border-radius: var(--radius-sm);
		background: transparent;
		color: var(--text-strong);
		font-size: var(--text-body-sm);
		line-height: var(--text-body-sm--line-height);
		letter-spacing: var(--text-body-sm--letter-spacing);
		text-align: left;
		cursor: pointer;
	}

	.export-options button:hover:not(:disabled) {
		background: var(--surface-hover);
	}

	.export-options button:disabled {
		color: var(--text-faint);
		cursor: not-allowed;
	}

	.export-error {
		display: flex;
		align-items: center;
		justify-content: space-between;
		gap: var(--space-2);
		padding: 7px var(--space-4);
		background: var(--surface);
		color: var(--danger-text);
		font-size: var(--text-body-sm);
		line-height: var(--text-body-sm--line-height);
		letter-spacing: var(--text-body-sm--letter-spacing);
	}

	.export-error button {
		border: 0;
		background: transparent;
		color: inherit;
		cursor: pointer;
	}

	.view-toggle {
		display: inline-flex;
		background: var(--surface-2);
		border: 1px solid var(--border);
		border-radius: var(--radius-md);
		padding: 2px;
		gap: 2px;
	}

	.toggle-btn {
		border: none;
		background: transparent;
		padding: var(--space-1) 7px;
		border-radius: var(--radius-sm);
		color: var(--text-muted);
		cursor: pointer;
		display: grid;
		place-items: center;
		transition:
			color var(--duration-short3) var(--ease-standard),
			background var(--duration-short3) var(--ease-standard);
	}

	.toggle-btn:hover {
		color: var(--text-strong);
	}

	.toggle-btn.active {
		background: var(--surface);
		color: var(--text-strong);
		box-shadow: 0 1px 2px var(--shadow-softer);
	}

	.action-btn {
		display: inline-flex;
		align-items: center;
		gap: 5px;
		height: 28px;
		padding: 0 9px;
		border: 1px solid var(--border);
		background: var(--surface);
		border-radius: var(--radius-md);
		font-size: var(--text-body-sm);
		line-height: var(--text-body-sm--line-height);
		letter-spacing: var(--text-body-sm--letter-spacing);
		font-weight: 500;
		color: var(--text-muted);
		cursor: pointer;
		transition:
			color var(--duration-short3) var(--ease-standard),
			background var(--duration-short3) var(--ease-standard),
			border-color var(--duration-short3) var(--ease-standard);
	}

	.action-btn:hover {
		background: var(--surface-hover);
		color: var(--text-strong);
		border-color: var(--border-strong);
	}

	.action-btn.active {
		background: var(--surface-3);
		border-color: var(--border-strong);
		color: var(--text-strong);
		font-weight: 500;
	}

	.icon-btn {
		display: grid;
		place-items: center;
		width: 28px;
		height: 28px;
		background: transparent;
		border: 1px solid var(--border);
		border-radius: var(--radius-md);
		padding: 0;
		cursor: pointer;
		color: var(--text-muted);
		transition:
			color var(--duration-short3) var(--ease-standard),
			background var(--duration-short3) var(--ease-standard),
			border-color var(--duration-short3) var(--ease-standard);
	}

	.icon-btn:hover:not(:disabled) {
		background: var(--surface-hover);
		color: var(--text-strong);
		border-color: var(--border-strong);
	}

	.scenes-bar {
		display: flex;
		align-items: center;
		justify-content: space-between;
		padding: 5px 14px;
		background: var(--surface-subtle);
		border-bottom: 1px solid var(--border);
		gap: var(--space-2);
		flex-shrink: 0;
	}

	.scenes-scroll {
		display: flex;
		align-items: center;
		gap: 5px;
		overflow-x: auto;
		scrollbar-width: none;
	}

	.scene-count {
		font-size: var(--text-label-sm);
		line-height: var(--text-label-sm--line-height);
		letter-spacing: var(--text-label-sm--letter-spacing);
		color: var(--text-muted);
		white-space: nowrap;
	}

	.canvas-controls {
		display: flex;
		align-items: center;
		gap: 5px;
		flex-shrink: 0;
	}

	.add-scene-btn {
		display: flex;
		align-items: center;
		gap: var(--space-1);
		height: 28px;
		padding: 0 var(--space-2);
		border: 1px dashed var(--border-strong);
		background: transparent;
		border-radius: var(--radius-sm);
		font-size: var(--text-body-sm);
		line-height: var(--text-body-sm--line-height);
		letter-spacing: var(--text-body-sm--letter-spacing);
		color: var(--text-muted);
		cursor: pointer;
		white-space: nowrap;
		transition:
			color var(--duration-short3) var(--ease-standard),
			border-color var(--duration-short3) var(--ease-standard),
			background var(--duration-short3) var(--ease-standard);
	}

	.add-scene-btn:hover {
		color: var(--text-strong);
		border-color: var(--text-dim);
		background: var(--surface-hover);
	}

	:global(.spin) {
		animation: spin 1s linear infinite;
	}

	@container (max-width: 700px) {
		.canvas-topbar {
			flex-wrap: wrap;
			height: auto;
			padding: var(--space-2) var(--space-3);
		}
		.toolbar-right {
			margin-left: auto;
		}
	}
</style>
