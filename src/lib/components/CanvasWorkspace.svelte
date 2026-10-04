<script lang="ts">
	import '@xyflow/svelte/dist/style.css';
	import { untrack } from 'svelte';
	import type { CanvasDetail, CanvasScene, StyleGuideline, ViewportDevice } from '$lib/canvas';
	import {
		clearCanvasSceneDraft,
		getCanvasSceneDraft,
		setCanvasSceneDraft,
		type CanvasSceneDraft
	} from '$lib/client/canvas-drafts';
	import CanvasCodeEditor from './CanvasCodeEditor.svelte';
	import CanvasEditorPreview from './CanvasEditorPreview.svelte';
	import CanvasPreviewDialog from './CanvasPreviewDialog.svelte';
	import NewSceneModal from './NewSceneModal.svelte';
	import StyleGuidelineEditor from './StyleGuidelineEditor.svelte';
	import CanvasGraph from './CanvasGraph.svelte';
	import CanvasToolbar from './CanvasToolbar.svelte';
	import { Plus } from '@lucide/svelte';
	import { Button } from '$lib/components/ui/button/index.js';

	type Props = {
		canvas: CanvasDetail;
		userId?: string | null;
		onupdatescene: (
			sceneId: string,
			updates: Partial<CanvasScene>,
			options?: { throwOnError?: boolean }
		) => Promise<void>;
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
		userId = null,
		onupdatescene,
		oncreatescene,
		ondeletescene,
		onupdateguideline,
		onrefresh,
		oncreateconnection,
		ondeleteconnection
	}: Props = $props();
	let previewOpen = $state(false);

	let selectionScope = $state('');
	let selectedSceneId = $state('');
	let activeSceneId = $derived(
		selectedSceneId || canvas.activeSceneId || canvas.scenes[0]?.id || ''
	);
	let activeScene = $derived(
		canvas.scenes.find((s) => s.id === activeSceneId) ?? canvas.scenes[0] ?? null
	);

	let showGuideline = $state(false);
	let viewMode = $state<'preview' | 'code'>('preview');
	let showLivePreview = $state(true);
	let refreshing = $state(false);
	let showNewSceneModal = $state(false);
	let arranging = $state(false);
	type GraphActions = {
		autoArrange: () => Promise<void>;
		zoomOut: () => Promise<unknown>;
		zoomIn: () => Promise<unknown>;
		fitView: () => Promise<unknown>;
	};
	let graphRef = $state<GraphActions | null>(null);

	type CodeDraft = { tab: 'html' | 'css' | 'js'; html: string; css: string; js: string };
	type SaveState = 'saved' | 'unsaved' | 'saving' | 'error';

	// Keep one draft per scene. Canvas refreshes replace the scene objects with
	// server copies, so a single draft object would otherwise be reset while the
	// user is still editing code.
	let codeDrafts = $state<Record<string, CodeDraft>>({});
	let serverDrafts = $state<Record<string, CodeDraft>>({});
	let saveStates = $state<Record<string, SaveState>>({});
	let failedDrafts = $state<Record<string, CodeDraft | null>>({});
	let conflicts = $state<Record<string, CodeDraft | null>>({});
	let codeDraftSceneId = $state('');
	let codeDraft = $state<CodeDraft>({ tab: 'html', html: '', css: '', js: '' });

	function draftFromScene(scene: CanvasScene): CodeDraft {
		return { tab: 'html', html: scene.html, css: scene.css, js: scene.js ?? '' };
	}

	function contentEqual(a: CodeDraft, b: CodeDraft) {
		return a.html === b.html && a.css === b.css && a.js === b.js;
	}

	function draftForStorage(draft: CodeDraft): CanvasSceneDraft {
		return { tab: draft.tab, html: draft.html, css: draft.css, js: draft.js };
	}

	$effect(() => {
		const scope = `${canvas.id}:${userId ?? ''}`;
		if (scope !== selectionScope) {
			selectionScope = scope;
			codeDrafts = {};
			serverDrafts = {};
			saveStates = {};
			failedDrafts = {};
			conflicts = {};
			codeDraftSceneId = '';
			previewOpen = false;
			selectedSceneId = canvas.activeSceneId ?? canvas.scenes[0]?.id ?? '';
		}
		if (selectedSceneId && !canvas.scenes.some((scene) => scene.id === selectedSceneId)) {
			selectedSceneId = canvas.activeSceneId ?? canvas.scenes[0]?.id ?? '';
		}
	});

	$effect(() => {
		const scene = activeScene;
		const latest = scene ? draftFromScene(scene) : null;
		// Server snapshots drive reconciliation, not the state it updates.
		// Tracking serverDrafts here would reschedule this effect on every copy.
		const draftUserId = userId;
		const canvasId = canvas.id;
		untrack(() => {
			if (!scene || !latest) {
				codeDraftSceneId = '';
				codeDraft = { tab: 'html', html: '', css: '', js: '' };
				return;
			}
			const sceneId = scene.id;
			const previousServer = serverDrafts[sceneId];
			let current = codeDrafts[sceneId];

			if (!current) {
				const restored = getCanvasSceneDraft(draftUserId, canvasId, sceneId);
				codeDrafts[sceneId] = { ...(restored ?? latest) };
				current = codeDrafts[sceneId];
				saveStates[sceneId] = restored && !contentEqual(restored, latest) ? 'unsaved' : 'saved';
			} else if (
				previousServer &&
				!contentEqual(previousServer, latest) &&
				!contentEqual(current, previousServer) &&
				!contentEqual(current, latest) &&
				saveStates[sceneId] !== 'saving'
			) {
				conflicts[sceneId] = latest;
			} else if (
				previousServer &&
				!contentEqual(previousServer, latest) &&
				contentEqual(current, previousServer)
			) {
				codeDrafts[sceneId] = { ...latest, tab: current.tab };
				current = codeDrafts[sceneId];
				saveStates[sceneId] = 'saved';
				clearCanvasSceneDraft(userId, canvas.id, sceneId);
			}

			if (contentEqual(current, latest)) delete conflicts[sceneId];
			serverDrafts[sceneId] = latest;
			if (
				sceneId !== codeDraftSceneId ||
				!contentEqual(codeDraft, current) ||
				codeDraft.tab !== current.tab
			) {
				codeDraftSceneId = sceneId;
				codeDraft = current;
			}
		});
	});

	$effect(() => {
		const sceneId = codeDraftSceneId;
		if (!sceneId || !serverDrafts[sceneId]) return;
		const current: CodeDraft = {
			tab: codeDraft.tab,
			html: codeDraft.html,
			css: codeDraft.css,
			js: codeDraft.js
		};
		if (saveStates[sceneId] === 'saving') {
			setCanvasSceneDraft(userId, canvas.id, sceneId, draftForStorage(current));
			return;
		}
		if (saveStates[sceneId] === 'error' && failedDrafts[sceneId]) {
			if (contentEqual(current, failedDrafts[sceneId]!)) return;
			delete failedDrafts[sceneId];
		}
		if (contentEqual(current, serverDrafts[sceneId])) {
			delete conflicts[sceneId];
			saveStates[sceneId] = 'saved';
			clearCanvasSceneDraft(userId, canvas.id, sceneId);
		} else {
			saveStates[sceneId] = 'unsaved';
			setCanvasSceneDraft(userId, canvas.id, sceneId, draftForStorage(current));
		}
	});

	function keepDraft(sceneId: string) {
		delete conflicts[sceneId];
	}

	function loadLatest(sceneId: string) {
		const latest = conflicts[sceneId];
		if (!latest) return;
		// Never share the editable proxy with the immutable server baseline.
		codeDrafts[sceneId] = { ...latest, tab: codeDrafts[sceneId]?.tab ?? latest.tab };
		if (sceneId === codeDraftSceneId) codeDraft = codeDrafts[sceneId];
		serverDrafts[sceneId] = { ...latest };
		saveStates[sceneId] = 'saved';
		delete failedDrafts[sceneId];
		clearCanvasSceneDraft(userId, canvas.id, sceneId);
		delete conflicts[sceneId];
	}

	async function saveCodeDraft(sceneId: string, html: string, css: string, js: string) {
		if (saveStates[sceneId] === 'saving' || conflicts[sceneId]) return;
		const scope = selectionScope;
		const canvasId = canvas.id;
		const draftUserId = userId;
		const submitted: CodeDraft = {
			tab: codeDrafts[sceneId]?.tab ?? (sceneId === codeDraftSceneId ? codeDraft.tab : 'html'),
			html,
			css,
			js
		};
		saveStates[sceneId] = 'saving';
		setCanvasSceneDraft(draftUserId, canvasId, sceneId, draftForStorage(submitted));
		try {
			await onupdatescene(sceneId, { html, css, js }, { throwOnError: true });
			if (selectionScope !== scope) return;
			serverDrafts[sceneId] = submitted;
			delete conflicts[sceneId];
			const current = codeDrafts[sceneId] ?? submitted;
			if (contentEqual(current, submitted)) {
				saveStates[sceneId] = 'saved';
				delete failedDrafts[sceneId];
				clearCanvasSceneDraft(userId, canvas.id, sceneId);
			} else {
				saveStates[sceneId] = 'unsaved';
				delete failedDrafts[sceneId];
				setCanvasSceneDraft(userId, canvas.id, sceneId, draftForStorage(current));
			}
		} catch (error) {
			if (selectionScope !== scope) throw error;
			saveStates[sceneId] = 'error';
			failedDrafts[sceneId] = { ...(codeDrafts[sceneId] ?? submitted) };
			setCanvasSceneDraft(
				userId,
				canvas.id,
				sceneId,
				draftForStorage(codeDrafts[sceneId] ?? submitted)
			);
			throw error;
		}
	}

	async function createScene(scene: Parameters<typeof oncreatescene>[0]) {
		const scope = selectionScope;
		await oncreatescene(scene);
		if (selectionScope !== scope) return;
		// This was an explicit user action, unlike a background agent refresh.
		selectedSceneId = canvas.activeSceneId ?? selectedSceneId;
	}

	async function deleteScene(sceneId: string) {
		const scope = selectionScope;
		const canvasId = canvas.id;
		const draftUserId = userId;
		await ondeletescene(sceneId);
		clearCanvasSceneDraft(draftUserId, canvasId, sceneId);
		if (selectionScope !== scope) return;
		delete codeDrafts[sceneId];
		delete serverDrafts[sceneId];
		delete saveStates[sceneId];
		delete failedDrafts[sceneId];
		delete conflicts[sceneId];
	}

	async function handleRefresh() {
		if (!onrefresh || refreshing) return;
		refreshing = true;
		try {
			await onrefresh();
		} finally {
			refreshing = false;
		}
	}
</script>

<div class="canvas-workspace">
	<CanvasToolbar
		{canvas}
		{activeScene}
		{selectedSceneId}
		{showLivePreview}
		{viewMode}
		{showGuideline}
		{arranging}
		{refreshing}
		hasUnsavedDraft={Object.values(saveStates).some((state) => state !== 'saved')}
		onviewmodechange={(mode) => (viewMode = mode)}
		ontoggleguideline={() => (showGuideline = !showGuideline)}
		onarrange={() => graphRef?.autoArrange()}
		onzoomout={() => graphRef?.zoomOut()}
		onzoomin={() => graphRef?.zoomIn()}
		onfitview={() => graphRef?.fitView()}
		onaddscene={() => (showNewSceneModal = true)}
		onselectscene={(sceneId) => (selectedSceneId = sceneId)}
		ontogglelivepreview={() => (showLivePreview = !showLivePreview)}
		onrefresh={onrefresh ? handleRefresh : undefined}
	/>

	<!-- Main Workspace Area -->
	<div class="workspace-content">
		<!-- Main Preview or Code Panel -->
		<div class="canvas-main-area" class:with-side={showGuideline}>
			{#if viewMode === 'preview'}
				<CanvasGraph
					bind:this={graphRef}
					{canvas}
					{selectedSceneId}
					bind:arranging
					onselectscene={(sceneId) => {
						selectedSceneId = sceneId;
						previewOpen = true;
					}}
					{onupdatescene}
					{oncreateconnection}
					{ondeleteconnection}
					onaddscene={() => (showNewSceneModal = true)}
				/>
			{:else if activeScene}
				<div class="code-preview-layout" class:preview-hidden={!showLivePreview}>
					<div class="code-editor-panel">
						{#key `${selectionScope}:${activeScene.id}`}
							<CanvasCodeEditor
								bind:draft={codeDraft}
								saveState={saveStates[activeScene.id] ?? 'saved'}
								conflict={Boolean(conflicts[activeScene.id])}
								onkeepdraft={() => keepDraft(activeScene.id)}
								onloadlatest={() => loadLatest(activeScene.id)}
								onsave={(html, css, js) => saveCodeDraft(activeScene.id, html, css, js)}
							/>
						{/key}
					</div>
					{#if showLivePreview}
						<div class="code-preview-panel">
							{#key `${selectionScope}:${activeScene.id}`}
								<CanvasEditorPreview
									draft={codeDraft}
									sceneName={activeScene.name}
									viewport={activeScene.viewport}
								/>
							{/key}
						</div>
					{/if}
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
		<CanvasPreviewDialog
			bind:open={previewOpen}
			scene={activeScene}
			sceneCount={canvas.scenes.length}
			ondeletescene={deleteScene}
			oneditcode={() => (viewMode = 'code')}
		/>
	{/if}

	<!-- Modal for New Scene -->
	<NewSceneModal
		bind:open={showNewSceneModal}
		scenes={canvas.scenes}
		activeSceneCss={activeScene?.css || ''}
		oncreatescene={createScene}
	/>
</div>

<style>
	.canvas-workspace {
		display: flex;
		flex-direction: column;
		height: 100%;
		background: var(--bg);
		overflow: hidden;
		min-width: 0;
		container-type: inline-size;
	}
	/* Main Workspace Area */
	.workspace-content {
		display: flex;
		flex: 1;
		min-height: 0;
		overflow: hidden;
		position: relative;
	}

	.canvas-main-area {
		flex: 1;
		height: 100%;
		min-width: 0;
		min-height: 0;
		overflow: hidden;
		display: flex;
		flex-direction: column;
	}

	.code-preview-layout {
		display: flex;
		flex: 1;
		min-width: 0;
		min-height: 0;
		overflow: hidden;
	}

	.code-editor-panel,
	.code-preview-panel {
		flex: 1 1 0;
		min-width: 0;
		min-height: 0;
		overflow: hidden;
	}

	.code-editor-panel {
		border-right: 1px solid var(--border);
	}

	.code-preview-layout.preview-hidden .code-editor-panel {
		border-right: 0;
	}

	@container (max-width: 700px) {
		.code-preview-layout:not(.preview-hidden) {
			flex-direction: column;
		}

		.code-editor-panel,
		.code-preview-panel {
			flex-basis: 50%;
			width: 100%;
		}

		.code-editor-panel {
			border-right: 0;
			border-bottom: 1px solid var(--border);
		}
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
		.guideline-drawer {
			position: absolute;
			right: 0;
			z-index: 2;
			width: min(380px, 100%);
		}
	}
</style>
