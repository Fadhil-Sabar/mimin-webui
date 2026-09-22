<script lang="ts">
	import {
		BookOpen,
		Code2,
		Download,
		Eye,
		LayoutGrid,
		LayoutTemplate,
		Plus,
		Trash2,
		RefreshCw,
		Maximize2,
		ZoomIn,
		ZoomOut,
		X
	} from '@lucide/svelte';
	import {
		SvelteFlow,
		Background,
		BackgroundVariant,
		MarkerType,
		useSvelteFlow,
		type Node,
		type Edge,
		type Connection
	} from '@xyflow/svelte';
	import '@xyflow/svelte/dist/style.css';
	import { tick } from 'svelte';
	import type { CanvasDetail, CanvasScene, StyleGuideline, ViewportDevice } from '$lib/canvas';
	import { planSceneLayout } from '$lib/canvas';
	import CanvasCodeEditor from './CanvasCodeEditor.svelte';
	import CanvasPreviewDialog from './CanvasPreviewDialog.svelte';
	import NewSceneModal from './NewSceneModal.svelte';
	import StyleGuidelineEditor from './StyleGuidelineEditor.svelte';
	import SceneFrameNode from './SceneFrameNode.svelte';
	import { Button } from '$lib/components/ui/button/index.js';

	type Props = {
		canvas: CanvasDetail;
		onupdatescene: (sceneId: string, updates: Partial<CanvasScene>) => Promise<void>;
		oncreatescene: (scene: {
			name: string;
			viewport: ViewportDevice;
			positionX?: number;
			positionY?: number;
			html?: string;
			css?: string;
		}) => Promise<void>;
		ondeletescene: (sceneId: string) => Promise<void>;
		onupdateguideline: (guideline: StyleGuideline) => Promise<void>;
		onrefresh?: () => Promise<void>;
		oncreateconnection: (sourceSceneId: string, targetSceneId: string) => Promise<void>;
		ondeleteconnection: (connectionId: string) => Promise<void>;
	};

	let {
		canvas,
		onupdatescene,
		oncreatescene,
		ondeletescene,
		onupdateguideline,
		onrefresh,
		oncreateconnection,
		ondeleteconnection
	}: Props = $props();
	const nodeTypes = { scene: SceneFrameNode };
	const flow = useSvelteFlow();
	let nodes = $state.raw<Node[]>([]);
	let edges = $state.raw<Edge[]>([]);
	let previewOpen = $state(false);
	let canvasError = $state('');
	let selectedEdgeId = $state('');
	$effect(() => {
		nodes = canvas.scenes.map((scene) => ({
			id: scene.id,
			type: 'scene',
			deletable: false,
			position: { x: scene.positionX ?? scene.order * 380, y: scene.positionY ?? 80 },
			data: { scene },
			selected: scene.id === selectedSceneId
		}));
		edges = (canvas.connections ?? []).map((connection) => ({
			id: connection.id,
			source: connection.sourceSceneId,
			target: connection.targetSceneId,
			type: 'smoothstep',
			deletable: false,
			markerEnd: { type: MarkerType.ArrowClosed },
			style: 'stroke-width: 2px'
		}));
	});
	function validConnection(connection: { source: string; target: string }) {
		return (
			connection.source !== connection.target &&
			!edges.some((edge) => edge.source === connection.source && edge.target === connection.target)
		);
	}
	async function connectScenes(connection: Connection) {
		if (!validConnection(connection)) {
			canvasError = 'That navigation connection already exists or points to the same scene.';
			return;
		}
		canvasError = '';
		await oncreateconnection(connection.source, connection.target);
	}
	async function deleteSelectedConnection() {
		if (!selectedEdgeId) return;
		await ondeleteconnection(selectedEdgeId);
		selectedEdgeId = '';
	}

	let selectedSceneId = $state('');
	let activeSceneId = $derived(
		selectedSceneId || canvas.activeSceneId || canvas.scenes[0]?.id || ''
	);
	let activeScene = $derived(
		canvas.scenes.find((s) => s.id === activeSceneId) ?? canvas.scenes[0] ?? null
	);

	let showGuideline = $state(false);
	let viewMode = $state<'preview' | 'code'>('preview');
	let refreshing = $state(false);
	let showNewSceneModal = $state(false);
	let exporting = $state(false);
	let exportError = $state('');
	let exportMenu: HTMLDetailsElement;

	async function exportCanvas(format: 'scene-html' | 'scene-png' | 'all-png' | 'canvas-zip') {
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
	let arranging = $state(false);

	// Code editor draft survives switching between preview and code views.
	let codeDraft = $state({ tab: 'html' as 'html' | 'css' | 'js', html: '', css: '', js: '' });

	$effect(() => {
		if (canvas.activeSceneId) {
			selectedSceneId = canvas.activeSceneId;
		}
	});

	async function handleRefresh() {
		if (!onrefresh || refreshing) return;
		refreshing = true;
		try {
			await onrefresh();
		} finally {
			refreshing = false;
		}
	}

	async function autoArrange() {
		if (arranging || canvas.scenes.length === 0) return;
		arranging = true;
		canvasError = '';
		try {
			const measured = new Map(flow.getNodes().map((node) => [node.id, node.measured?.height]));
			const positions = planSceneLayout(
				canvas.scenes.map((scene) => ({
					id: scene.id,
					viewport: scene.viewport,
					frameHeight: measured.get(scene.id)
				}))
			);
			for (const scene of canvas.scenes) {
				const position = positions.get(scene.id);
				if (!position) continue;
				if (scene.positionX === position.x && scene.positionY === position.y) continue;
				await onupdatescene(scene.id, { positionX: position.x, positionY: position.y });
			}
			await tick();
			await flow.fitView({ padding: 0.15 });
		} catch (error) {
			canvasError = error instanceof Error ? error.message : 'Could not arrange the scenes.';
		} finally {
			arranging = false;
		}
	}
</script>

<div class="canvas-workspace">
	<!-- Canvas Toolbar -->
	<header class="canvas-topbar">
		<div class="canvas-meta">
			<LayoutTemplate size={16} class="canvas-meta-icon" />
			<h2 class="canvas-title" title={canvas.title}>{canvas.title}</h2>
			<span class="revision-tag" title="Revision {canvas.revision}">v{canvas.revision}</span>
		</div>

		<div class="toolbar-right">
			<!-- Mode Switcher (Preview / Code) -->
			<div class="view-toggle">
				<button
					type="button"
					class="toggle-btn"
					class:active={viewMode === 'preview'}
					onclick={() => (viewMode = 'preview')}
					title="Visual Preview"
					aria-label="Visual Preview"
				>
					<Eye size={14} />
				</button>
				<button
					type="button"
					class="toggle-btn"
					class:active={viewMode === 'code'}
					onclick={() => (viewMode = 'code')}
					title="Source Code"
					aria-label="Source Code"
				>
					<Code2 size={14} />
				</button>
			</div>

			<!-- Export menu -->
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

			<!-- Style Guideline button -->
			<button
				type="button"
				class="action-btn"
				class:active={showGuideline}
				onclick={() => (showGuideline = !showGuideline)}
				title="Style Guideline"
			>
				<BookOpen size={14} />
				<span class="btn-text">Guideline</span>
			</button>

			{#if onrefresh}
				<button
					type="button"
					class="icon-btn"
					onclick={handleRefresh}
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
				onclick={autoArrange}
				disabled={arranging || canvas.scenes.length === 0}
				title="Auto arrange scenes"
				aria-label="Auto arrange scenes"
				><LayoutGrid size={14} class={arranging ? 'spin' : ''} /></button
			>
			<button class="icon-btn" onclick={() => flow.zoomOut()} title="Zoom out" aria-label="Zoom out"
				><ZoomOut size={14} /></button
			>
			<button class="icon-btn" onclick={() => flow.zoomIn()} title="Zoom in" aria-label="Zoom in"
				><ZoomIn size={14} /></button
			>
			<button
				class="icon-btn"
				onclick={() => flow.fitView({ padding: 0.15 })}
				title="Fit all scenes"
				aria-label="Fit all scenes"><Maximize2 size={14} /></button
			>
			<button class="add-scene-btn" onclick={() => (showNewSceneModal = true)}
				><Plus size={12} /> Add scene</button
			>
		</div>
	</div>

	<!-- Main Workspace Area -->
	<div class="workspace-content">
		<!-- Main Preview or Code Panel -->
		<div class="canvas-main-area" class:with-side={showGuideline}>
			{#if viewMode === 'preview'}
				<div class="scene-map">
					<SvelteFlow
						bind:nodes
						bind:edges
						{nodeTypes}
						fitView
						minZoom={0.15}
						maxZoom={2}
						deleteKey={null}
						isValidConnection={validConnection}
						onconnect={connectScenes}
						onnodeclick={({ node }) => {
							selectedSceneId = node.id;
							previewOpen = true;
						}}
						onnodedragstop={({ targetNode }) => {
							if (targetNode)
								void onupdatescene(targetNode.id, {
									positionX: targetNode.position.x,
									positionY: targetNode.position.y
								});
						}}
						onedgeclick={({ edge }) => (selectedEdgeId = edge.id)}
						onpaneclick={() => (selectedEdgeId = '')}
					>
						<Background variant={BackgroundVariant.Dots} gap={20} size={1} />
					</SvelteFlow>
					{#if canvas.scenes.length === 0}
						<div class="empty-canvas">
							<Button variant="default" onclick={() => (showNewSceneModal = true)}
								><Plus size={14} /> Add first scene</Button
							>
						</div>
					{/if}
					{#if selectedEdgeId}<button class="edge-delete" onclick={deleteSelectedConnection}
							><Trash2 size={13} /> Delete connection</button
						>{/if}
					{#if canvasError}<div class="canvas-error" role="alert">
							{canvasError}<button onclick={() => (canvasError = '')} aria-label="Dismiss error"
								><X size={12} /></button
							>
						</div>{/if}
				</div>
			{:else if activeScene}
				<!-- Code View / Quick Edit -->
				<CanvasCodeEditor
					scene={activeScene}
					bind:draft={codeDraft}
					onsave={(html, css, js) => onupdatescene(activeScene.id, { html, css, js })}
				/>
			{:else}
				<div class="empty-canvas">
					<Button variant="default" onclick={() => (showNewSceneModal = true)}
						><Plus size={14} /> Add first scene</Button
					>
				</div>
			{/if}
		</div>

		<!-- Style Guideline Drawer/Sidebar -->
		{#if showGuideline}
			<div class="guideline-drawer">
				<StyleGuidelineEditor
					guideline={canvas.styleGuideline}
					onupdate={onupdateguideline}
					onclose={() => (showGuideline = false)}
				/>
			</div>
		{/if}
	</div>

	{#if activeScene}
		<CanvasPreviewDialog
			bind:open={previewOpen}
			scene={activeScene}
			sceneCount={canvas.scenes.length}
			{onupdatescene}
			{ondeletescene}
			oneditcode={() => (viewMode = 'code')}
		/>
	{/if}

	<!-- Modal for New Scene -->
	<NewSceneModal
		bind:open={showNewSceneModal}
		scenes={canvas.scenes}
		activeSceneCss={activeScene?.css || ''}
		{oncreatescene}
	/>
</div>

<style>
	.scene-map {
		position: relative;
		width: 100%;
		height: 100%;
		min-height: 0;
		background: var(--bg);
	}
	:global(.scene-map .svelte-flow) {
		width: 100%;
		height: 100%;
	}
	:global(.scene-map .svelte-flow__node) {
		width: 324px;
	}
	.canvas-controls {
		display: flex;
		align-items: center;
		gap: 5px;
		flex-shrink: 0;
	}
	.scene-count {
		font-size: var(--text-label-sm);
		line-height: var(--text-label-sm--line-height);
		letter-spacing: var(--text-label-sm--letter-spacing);
		color: var(--text-muted);
		white-space: nowrap;
	}
	.edge-delete,
	.canvas-error {
		position: absolute;
		z-index: 3;
		left: 14px;
		bottom: 14px;
		display: flex;
		align-items: center;
		gap: 6px;
		border: 1px solid var(--border);
		border-radius: var(--radius-md);
		padding: 7px 10px;
		background: var(--surface);
		color: var(--text-strong);
		box-shadow: 0 4px 16px var(--shadow-softer);
		font-size: var(--text-body-sm);
		line-height: var(--text-body-sm--line-height);
		letter-spacing: var(--text-body-sm--letter-spacing);
		cursor: pointer;
	}
	.canvas-error {
		bottom: 54px;
		color: var(--danger-text);
		cursor: default;
	}
	.canvas-error button {
		border: 0;
		background: transparent;
		color: inherit;
		cursor: pointer;
	}
	.canvas-workspace {
		display: flex;
		flex-direction: column;
		height: 100%;
		background: var(--bg);
		overflow: hidden;
		min-width: 0;
		container-type: inline-size;
	}

	/* Topbar */
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

	/* Toolbar Right */
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

	/* Scenes Bar */
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

	/* Main Workspace Area */
	.workspace-content {
		display: flex;
		flex: 1;
		overflow: hidden;
		position: relative;
	}

	.canvas-main-area {
		flex: 1;
		height: 100%;
		overflow: hidden;
		display: flex;
		flex-direction: column;
	}

	.guideline-drawer {
		width: min(380px, 50%);
		border-left: 1px solid var(--border);
		background: var(--surface);
		height: 100%;
		flex-shrink: 0;
	}

	.empty-canvas {
		display: grid;
		place-content: center;
		height: 100%;
		gap: var(--space-3);
		text-align: center;
		color: var(--text-muted);
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
		.guideline-drawer {
			position: absolute;
			right: 0;
			z-index: 2;
			width: min(380px, 100%);
		}
	}
</style>
