<script lang="ts">
	import { Plus, Trash2, X } from '@lucide/svelte';
	import {
		Background,
		BackgroundVariant,
		MarkerType,
		SvelteFlow,
		type Connection,
		type Edge,
		type Node,
		useSvelteFlow
	} from '@xyflow/svelte';
	import { tick } from 'svelte';
	import type { CanvasDetail, CanvasScene } from '$lib/canvas';
	import { planSceneLayout } from '$lib/canvas';
	import SceneFrameNode from './SceneFrameNode.svelte';
	import { Button } from '$lib/components/ui/button/index.js';

	type Props = {
		canvas: CanvasDetail;
		selectedSceneId?: string;
		arranging?: boolean;
		onselectscene: (sceneId: string) => void;
		onupdatescene: (
			sceneId: string,
			updates: Partial<CanvasScene>,
			options?: { throwOnError?: boolean }
		) => Promise<void>;
		oncreateconnection: (sourceSceneId: string, targetSceneId: string) => Promise<void>;
		ondeleteconnection: (connectionId: string) => Promise<void>;
		onaddscene: () => void;
	};

	let {
		canvas,
		selectedSceneId = '',
		arranging = $bindable(false),
		onselectscene,
		onupdatescene,
		oncreateconnection,
		ondeleteconnection,
		onaddscene
	}: Props = $props();

	const nodeTypes = { scene: SceneFrameNode };
	const flow = useSvelteFlow();
	let nodes = $state.raw<Node[]>([]);
	let edges = $state.raw<Edge[]>([]);
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

	export async function autoArrange() {
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

	export function zoomOut() {
		return flow.zoomOut();
	}

	export function zoomIn() {
		return flow.zoomIn();
	}

	export function fitView() {
		return flow.fitView({ padding: 0.15 });
	}
</script>

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
		onnodeclick={({ node }) => onselectscene(node.id)}
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
			<Button variant="default" onclick={onaddscene}><Plus size={14} /> Add first scene</Button>
		</div>
	{/if}
	{#if selectedEdgeId}
		<button class="edge-delete" onclick={deleteSelectedConnection}
			><Trash2 size={13} /> Delete connection</button
		>
	{/if}
	{#if canvasError}
		<div class="canvas-error" role="alert">
			{canvasError}<button onclick={() => (canvasError = '')} aria-label="Dismiss error"
				><X size={12} /></button
			>
		</div>
	{/if}
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

	.empty-canvas {
		display: grid;
		place-content: center;
		height: 100%;
		gap: var(--space-3);
		text-align: center;
		color: var(--text-muted);
	}
</style>
