<script lang="ts">
	import '@xyflow/svelte/dist/style.css';
	import type { CanvasDetail, CanvasScene, StyleGuideline, ViewportDevice } from '$lib/canvas';
	import {
		clearCanvasSceneDraft,
		getCanvasSceneDraft,
		setCanvasSceneDraft,
		type CanvasSceneDraft
	} from '$lib/client/canvas-drafts';
	import CanvasCodeEditor from './CanvasCodeEditor.svelte';
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
		if (canvas.activeSceneId) {
			selectedSceneId = canvas.activeSceneId;
		}
	});

	$effect(() => {
		const scene = activeScene;
		if (!scene) return;
		const sceneId = scene.id;
		const latest = draftFromScene(scene);
		const previousServer = serverDrafts[sceneId];
		let current = codeDrafts[sceneId];

		if (!current) {
			const restored = getCanvasSceneDraft(userId, canvas.id, sceneId);
			current = restored ?? latest;
			codeDrafts[sceneId] = current;
			saveStates[sceneId] = restored && !contentEqual(restored, latest) ? 'unsaved' : 'saved';
		} else if (
			previousServer &&
			!contentEqual(previousServer, latest) &&
			!contentEqual(current, previousServer) &&
			saveStates[sceneId] !== 'saving'
		) {
			conflicts[sceneId] = latest;
		} else if (
			previousServer &&
			!contentEqual(previousServer, latest) &&
			contentEqual(current, previousServer)
		) {
			current = latest;
			codeDrafts[sceneId] = current;
			saveStates[sceneId] = 'saved';
			clearCanvasSceneDraft(userId, canvas.id, sceneId);
		}

		serverDrafts[sceneId] = latest;
		if (sceneId !== codeDraftSceneId) {
			codeDraftSceneId = sceneId;
			codeDraft = current;
		}
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
		if (saveStates[sceneId] === 'saving') return;
		if (saveStates[sceneId] === 'error' && failedDrafts[sceneId]) {
			if (contentEqual(current, failedDrafts[sceneId]!)) return;
			delete failedDrafts[sceneId];
		}
		if (contentEqual(current, serverDrafts[sceneId])) {
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
		codeDrafts[sceneId] = latest;
		if (sceneId === codeDraftSceneId) codeDraft = latest;
		serverDrafts[sceneId] = latest;
		saveStates[sceneId] = 'saved';
		delete failedDrafts[sceneId];
		clearCanvasSceneDraft(userId, canvas.id, sceneId);
		delete conflicts[sceneId];
	}

	async function saveCodeDraft(sceneId: string, html: string, css: string, js: string) {
		const draft = codeDrafts[sceneId];
		if (draft) {
			draft.html = html;
			draft.css = css;
			draft.js = js;
		}
		saveStates[sceneId] = 'saving';
		try {
			await onupdatescene(sceneId, { html, css, js }, { throwOnError: true });
			saveStates[sceneId] = 'saved';
			delete failedDrafts[sceneId];
			clearCanvasSceneDraft(userId, canvas.id, sceneId);
		} catch (error) {
			saveStates[sceneId] = 'error';
			failedDrafts[sceneId] = draft
				? { tab: draft.tab, html: draft.html, css: draft.css, js: draft.js }
				: null;
			throw error;
		}
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
		{viewMode}
		{showGuideline}
		{arranging}
		{refreshing}
		onviewmodechange={(mode) => (viewMode = mode)}
		ontoggleguideline={() => (showGuideline = !showGuideline)}
		onarrange={() => graphRef?.autoArrange()}
		onzoomout={() => graphRef?.zoomOut()}
		onzoomin={() => graphRef?.zoomIn()}
		onfitview={() => graphRef?.fitView()}
		onaddscene={() => (showNewSceneModal = true)}
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
				<!-- Code View / Quick Edit -->
				<CanvasCodeEditor
					bind:draft={codeDraft}
					saveState={saveStates[activeScene.id] ?? 'saved'}
					conflict={Boolean(conflicts[activeScene.id])}
					onkeepdraft={() => keepDraft(activeScene.id)}
					onloadlatest={() => loadLatest(activeScene.id)}
					onsave={(html, css, js) => saveCodeDraft(activeScene.id, html, css, js)}
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
		.guideline-drawer {
			position: absolute;
			right: 0;
			z-index: 2;
			width: min(380px, 100%);
		}
	}
</style>
