<script lang="ts">
	import {
		BookOpen,
		Code2,
		Copy,
		Download,
		Eye,
		LayoutGrid,
		LayoutTemplate,
		Monitor,
		Smartphone,
		Tablet,
		Plus,
		Trash2,
		RefreshCw,
		Check,
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
	import {
		findFreeScenePosition,
		planSceneLayout,
		VIEWPORT_SPECS,
		type ScenePlacement
	} from '$lib/canvas';
	import CanvasPreview from './CanvasPreview.svelte';
	import StyleGuidelineEditor from './StyleGuidelineEditor.svelte';
	import SceneFrameNode from './SceneFrameNode.svelte';
	import { Button } from '$lib/components/ui/button/index.js';
	import * as Dialog from '$lib/components/ui/dialog/index.js';

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
	let codeTab = $state<'html' | 'css' | 'js'>('html');
	let refreshing = $state(false);
	let showNewSceneModal = $state(false);
	let newSceneName = $state('');
	let newSceneViewport = $state<ViewportDevice>('desktop');
	let creating = $state(false);
	let copiedCode = $state(false);
	let viewportSaving = $state(false);
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

	// Code editor state
	let editedHtml = $state('');
	let editedCss = $state('');
	let editedJs = $state('');
	let codeSaving = $state(false);

	$effect(() => {
		if (activeScene) {
			editedHtml = activeScene.html;
			editedCss = activeScene.css;
			editedJs = activeScene.js ?? '';
		}
	});

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

	async function switchViewport(viewport: ViewportDevice) {
		if (!activeScene || viewportSaving || viewport === activeScene.viewport) return;
		viewportSaving = true;
		try {
			await onupdatescene(activeScene.id, { viewport });
		} finally {
			viewportSaving = false;
		}
	}

	async function saveCodeChanges() {
		if (!activeScene) return;
		codeSaving = true;
		try {
			await onupdatescene(activeScene.id, {
				html: editedHtml,
				css: editedCss,
				js: editedJs
			});
		} finally {
			codeSaving = false;
		}
	}

	/** Current frame boxes; measured node heights keep the layout accurate for tall content. */
	function currentPlacements(): ScenePlacement[] {
		const measured = new Map(flow.getNodes().map((node) => [node.id, node.measured?.height]));
		return canvas.scenes.map((scene) => ({
			viewport: scene.viewport,
			positionX: scene.positionX,
			positionY: scene.positionY,
			frameHeight: measured.get(scene.id)
		}));
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

	async function submitNewScene() {
		if (!newSceneName.trim() || creating) return;
		creating = true;
		try {
			const position = findFreeScenePosition(currentPlacements(), newSceneViewport);
			await oncreatescene({
				name: newSceneName.trim(),
				viewport: newSceneViewport,
				positionX: position.x,
				positionY: position.y,
				html: `<div class="container">\n  <h2>${newSceneName.trim()}</h2>\n  <p>New scene content...</p>\n</div>`,
				css: activeScene?.css || ''
			});
			showNewSceneModal = false;
			newSceneName = '';
		} finally {
			creating = false;
		}
	}

	async function handleDeleteActiveScene() {
		if (!activeScene || canvas.scenes.length <= 1) return;
		if (confirm(`Delete scene "${activeScene.name}"?`)) {
			await ondeletescene(activeScene.id);
		}
	}

	function copyCurrentCode() {
		if (!activeScene) return;
		const code = codeTab === 'html' ? editedHtml : codeTab === 'css' ? editedCss : editedJs;
		navigator.clipboard.writeText(code);
		copiedCode = true;
		setTimeout(() => (copiedCode = false), 1400);
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
				<div class="code-editor-area">
					<div class="code-header">
						<div class="code-tabs">
							<button
								class="code-tab"
								class:active={codeTab === 'html'}
								onclick={() => (codeTab = 'html')}>HTML</button
							>
							<button
								class="code-tab"
								class:active={codeTab === 'css'}
								onclick={() => (codeTab = 'css')}>CSS</button
							>
							<button
								class="code-tab"
								class:active={codeTab === 'js'}
								onclick={() => (codeTab = 'js')}>JS</button
							>
						</div>
						<div class="code-actions">
							<button class="icon-btn" onclick={copyCurrentCode} title="Copy Code">
								{#if copiedCode}<Check size={13} />{:else}<Copy size={13} />{/if}
							</button>
							<Button variant="default" size="sm" onclick={saveCodeChanges} disabled={codeSaving}>
								{codeSaving ? 'Saving...' : 'Apply Code'}
							</Button>
						</div>
					</div>

					<div class="code-body">
						{#if codeTab === 'html'}
							<textarea
								class="code-editor-input"
								bind:value={editedHtml}
								placeholder="Semantic HTML markup..."
								spellcheck="false"></textarea>
						{:else if codeTab === 'css'}
							<textarea
								class="code-editor-input"
								bind:value={editedCss}
								placeholder="CSS rules and token styles..."
								spellcheck="false"></textarea>
						{:else}
							<textarea
								class="code-editor-input"
								bind:value={editedJs}
								placeholder="Lightweight behavior JavaScript..."
								spellcheck="false"></textarea>
						{/if}
					</div>
				</div>
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
		<Dialog.Root bind:open={previewOpen}>
			<Dialog.Content
				showCloseButton={false}
				aria-label="Interactive preview of {activeScene.name}"
				class="flex! max-h-[96vh] w-fit! max-w-[min(96vw,1300px)]! min-w-[min(320px,96vw)] flex-col gap-0 overflow-hidden rounded-xl bg-[var(--surface)] p-0 leading-[normal] shadow-[0_24px_70px_var(--shadow)] ring-0"
			>
				<div class="preview-dialog-bar">
					<strong>{activeScene.name}</strong><span
						>{VIEWPORT_SPECS[activeScene.viewport].width} × {VIEWPORT_SPECS[activeScene.viewport]
							.height}</span
					>
					<div class="preview-device-switcher" role="group" aria-label="Ubah ukuran scene">
						<button
							type="button"
							class:active={activeScene.viewport === 'mobile'}
							aria-label="Mobile"
							aria-pressed={activeScene.viewport === 'mobile'}
							title="Mobile"
							disabled={viewportSaving}
							onclick={() => switchViewport('mobile')}><Smartphone size={16} /></button
						>
						<button
							type="button"
							class:active={activeScene.viewport === 'tablet'}
							aria-label="Tablet"
							aria-pressed={activeScene.viewport === 'tablet'}
							title="Tablet"
							disabled={viewportSaving}
							onclick={() => switchViewport('tablet')}><Tablet size={16} /></button
						>
						<button
							type="button"
							class:active={activeScene.viewport === 'desktop'}
							aria-label="Desktop"
							aria-pressed={activeScene.viewport === 'desktop'}
							title="Desktop"
							disabled={viewportSaving}
							onclick={() => switchViewport('desktop')}><Monitor size={16} /></button
						>
					</div>
					<button class="icon-btn" onclick={() => (previewOpen = false)} aria-label="Close preview"
						><X size={16} /></button
					>
				</div>
				<div class="preview-scroll">
					<div
						class="interactive-screen"
						style:width="{VIEWPORT_SPECS[activeScene.viewport].width}px"
						style:height="{VIEWPORT_SPECS[activeScene.viewport].height}px"
					>
						{#key `${activeScene.id}:${activeScene.viewport}`}
							<CanvasPreview
								html={activeScene.html}
								css={activeScene.css}
								js={activeScene.js}
								title={activeScene.name}
							/>
						{/key}
					</div>
				</div>
				<div class="preview-dialog-actions">
					<Button
						variant="outline"
						onclick={handleDeleteActiveScene}
						disabled={canvas.scenes.length <= 1}><Trash2 size={13} /> Delete scene</Button
					><Button
						variant="outline"
						onclick={() => {
							previewOpen = false;
							viewMode = 'code';
						}}><Code2 size={13} /> Edit code</Button
					>
				</div>
			</Dialog.Content>
		</Dialog.Root>
	{/if}

	<!-- Modal for New Scene -->
	<Dialog.Root bind:open={showNewSceneModal}>
		<Dialog.Content
			showCloseButton={false}
			class="w-[min(440px,90%)] max-w-none! gap-0 rounded-[10px] border border-[var(--border)] bg-[var(--surface)] p-0 leading-[normal] shadow-[0_20px_25px_-5px_rgba(0,0,0,0.2)] ring-0"
		>
			<div class="modal-header">
				<Dialog.Title level={3} class="text-headline-sm text-[var(--text-strong)]"
					>Create Scene Mockup</Dialog.Title
				>
				<button
					class="icon-btn"
					onclick={() => (showNewSceneModal = false)}
					aria-label="Close dialog"><Plus style="transform: rotate(45deg)" size={14} /></button
				>
			</div>
			<div class="modal-body">
				<div class="form-group">
					<label for="scene-name" class="label">Scene Name</label>
					<input
						id="scene-name"
						type="text"
						class="text-input"
						bind:value={newSceneName}
						placeholder="e.g. Mobile Signup, Desktop Dashboard..."
					/>
				</div>
				<div class="form-group">
					<span class="label">Initial Viewport</span>
					<div class="viewport-radios">
						<label class="radio-label">
							<input type="radio" bind:group={newSceneViewport} value="mobile" />
							<span>Mobile (375px)</span>
						</label>
						<label class="radio-label">
							<input type="radio" bind:group={newSceneViewport} value="tablet" />
							<span>Tablet (768px)</span>
						</label>
						<label class="radio-label">
							<input type="radio" bind:group={newSceneViewport} value="desktop" />
							<span>Desktop (1200px)</span>
						</label>
					</div>
				</div>
			</div>
			<div class="modal-footer">
				<Button variant="outline" onclick={() => (showNewSceneModal = false)}>Cancel</Button>
				<Button
					variant="default"
					onclick={submitNewScene}
					disabled={creating || !newSceneName.trim()}
				>
					{creating ? 'Creating...' : 'Create Scene'}
				</Button>
			</div>
		</Dialog.Content>
	</Dialog.Root>
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
		border-radius: 7px;
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
	.preview-dialog-bar {
		display: flex;
		align-items: center;
		gap: 12px;
		padding: 10px 14px;
		border-bottom: 1px solid var(--border);
		font-size: var(--text-body-md);
		line-height: var(--text-body-md--line-height);
		letter-spacing: var(--text-body-md--letter-spacing);
	}
	.preview-dialog-bar span {
		color: var(--text-muted);
		font-size: var(--text-label-sm);
		line-height: var(--text-label-sm--line-height);
		letter-spacing: var(--text-label-sm--letter-spacing);
	}
	.preview-dialog-bar > button {
		margin-left: auto;
	}
	.preview-device-switcher {
		display: flex;
		gap: 2px;
		margin-left: auto;
		padding: 2px;
		border: 1px solid var(--border);
		border-radius: 7px;
		background: var(--surface-2);
	}
	.preview-device-switcher button {
		display: grid;
		place-items: center;
		width: 29px;
		height: 27px;
		padding: 0;
		border: 0;
		border-radius: 5px;
		background: transparent;
		color: var(--text-muted);
		cursor: pointer;
	}
	.preview-device-switcher button:hover,
	.preview-device-switcher button.active {
		background: var(--surface);
		color: var(--text-strong);
	}
	.preview-device-switcher button:focus-visible {
		outline: 2px solid var(--focus);
		outline-offset: 2px;
	}
	.preview-scroll {
		overflow: auto;
		background: var(--bg);
		padding: 16px;
	}
	.interactive-screen {
		max-width: none;
		background: white;
		margin: 0 auto;
		box-shadow: 0 4px 20px var(--shadow-softer);
	}
	.preview-dialog-actions {
		display: flex;
		gap: 8px;
		justify-content: flex-end;
		border-top: 1px solid var(--border);
		padding: 10px 14px;
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
		padding: 8px 16px;
		height: 48px;
		background: var(--bg);
		border-bottom: 1px solid var(--border);
		gap: 12px;
		flex-shrink: 0;
	}

	.canvas-meta {
		display: flex;
		align-items: center;
		gap: 8px;
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
		border-radius: 4px;
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
		border-radius: 7px;
		background: var(--surface);
		box-shadow: 0 8px 25px var(--shadow-softer);
	}
	.export-options button {
		display: block;
		width: 100%;
		padding: 8px 9px;
		border: 0;
		border-radius: 4px;
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
		gap: 8px;
		padding: 7px 16px;
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
		border-radius: 6px;
		padding: 2px;
		gap: 2px;
	}

	.toggle-btn {
		border: none;
		background: transparent;
		padding: 4px 7px;
		border-radius: 4px;
		color: var(--text-muted);
		cursor: pointer;
		display: grid;
		place-items: center;
		transition:
			color 0.14s ease,
			background 0.14s ease;
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
		border-radius: 6px;
		font-size: var(--text-body-sm);
		line-height: var(--text-body-sm--line-height);
		letter-spacing: var(--text-body-sm--letter-spacing);
		font-weight: 500;
		color: var(--text-muted);
		cursor: pointer;
		transition:
			color 0.14s ease,
			background 0.14s ease,
			border-color 0.14s ease;
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
		border-radius: 6px;
		padding: 0;
		cursor: pointer;
		color: var(--text-muted);
		transition:
			color 0.14s ease,
			background 0.14s ease,
			border-color 0.14s ease;
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
		gap: 8px;
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
		gap: 4px;
		height: 28px;
		padding: 0 8px;
		border: 1px dashed var(--border-strong);
		background: transparent;
		border-radius: 5px;
		font-size: var(--text-body-sm);
		line-height: var(--text-body-sm--line-height);
		letter-spacing: var(--text-body-sm--letter-spacing);
		color: var(--text-muted);
		cursor: pointer;
		white-space: nowrap;
		transition:
			color 0.14s ease,
			border-color 0.14s ease,
			background 0.14s ease;
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

	/* Code Editor Area */
	.code-editor-area {
		display: flex;
		flex-direction: column;
		height: 100%;
		background: var(--surface);
	}

	.code-header {
		display: flex;
		align-items: center;
		justify-content: space-between;
		padding: 8px 16px;
		border-bottom: 1px solid var(--border);
		background: var(--surface-2);
	}

	.code-tabs {
		display: flex;
		gap: 3px;
	}

	.code-tab {
		padding: 4px 10px;
		border: none;
		background: transparent;
		font-size: var(--text-body-sm);
		line-height: var(--text-body-sm--line-height);
		letter-spacing: var(--text-body-sm--letter-spacing);
		font-weight: 500;
		color: var(--text-muted);
		border-radius: 4px;
		cursor: pointer;
		transition:
			color 0.14s ease,
			background 0.14s ease;
	}

	.code-tab:hover {
		color: var(--text-strong);
	}

	.code-tab.active {
		background: var(--surface);
		color: var(--text-strong);
		font-weight: 500;
		box-shadow: 0 1px 2px var(--shadow-softer);
	}

	.code-actions {
		display: flex;
		align-items: center;
		gap: 6px;
	}

	.code-body {
		flex: 1;
		padding: 12px;
		overflow: hidden;
	}

	.code-editor-input {
		width: 100%;
		height: 100%;
		border: 1px solid var(--border);
		border-radius: 6px;
		padding: 12px;
		font-family: var(--font-mono);
		font-size: var(--text-body-sm);
		line-height: var(--text-body-sm--line-height);
		letter-spacing: var(--text-body-sm--letter-spacing);
		background: var(--surface-subtle);
		color: var(--text);
		resize: none;
		outline: none;
	}

	.code-editor-input:focus {
		border-color: var(--border-strong);
		outline: 2px solid var(--focus);
		outline-offset: 1px;
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
		gap: 12px;
		text-align: center;
		color: var(--text-muted);
	}

	:global(.spin) {
		animation: spin 1s linear infinite;
	}

	@keyframes spin {
		from {
			transform: rotate(0deg);
		}
		to {
			transform: rotate(360deg);
		}
	}

	/* Modal Styles */
	.modal-header {
		display: flex;
		align-items: center;
		justify-content: space-between;
		padding: 14px 18px;
		border-bottom: 1px solid var(--border);
	}

	.modal-body {
		padding: 18px;
		display: flex;
		flex-direction: column;
		gap: 16px;
	}

	.form-group {
		display: flex;
		flex-direction: column;
		gap: 6px;
	}

	.label {
		font-size: var(--text-body-sm);
		line-height: var(--text-body-sm--line-height);
		letter-spacing: var(--text-body-sm--letter-spacing);
		font-weight: 500;
		color: var(--text-strong);
	}

	.text-input {
		border: 1px solid var(--input-border);
		border-radius: 6px;
		padding: 8px 10px;
		font-size: var(--text-body-md);
		line-height: var(--text-body-md--line-height);
		letter-spacing: var(--text-body-md--letter-spacing);
		background: var(--surface);
		color: var(--text);
	}

	.text-input:focus {
		border-color: var(--border-strong);
		outline: 2px solid var(--focus);
		outline-offset: 1px;
	}

	.viewport-radios {
		display: flex;
		flex-direction: column;
		gap: 8px;
	}

	.radio-label {
		display: flex;
		align-items: center;
		gap: 8px;
		font-size: var(--text-body-md);
		line-height: var(--text-body-md--line-height);
		letter-spacing: var(--text-body-md--letter-spacing);
		color: var(--text-body);
		cursor: pointer;
	}

	.modal-footer {
		display: flex;
		justify-content: flex-end;
		gap: 8px;
		padding: 12px 18px;
		border-top: 1px solid var(--border);
		background: var(--surface-subtle);
	}

	@container (max-width: 700px) {
		.canvas-topbar {
			flex-wrap: wrap;
			height: auto;
			padding: 8px 12px;
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
	@media (max-width: 520px) {
		.preview-dialog-bar {
			flex-wrap: wrap;
		}
		.preview-device-switcher {
			margin-left: 0;
		}
	}
</style>
