<script lang="ts">
	import { Handle, Position, type NodeProps } from '@xyflow/svelte';
	import { Monitor, Smartphone, Tablet } from '@lucide/svelte';
	import { VIEWPORT_SPECS, type CanvasScene } from '$lib/canvas';
	import CanvasPreview from './CanvasPreview.svelte';

	let { data, selected }: NodeProps = $props();
	let scene = $derived(data.scene as CanvasScene);
	let viewport = $derived(VIEWPORT_SPECS[scene.viewport]);
	let scale = $derived(300 / viewport.width);
	let measuredHeight = $state(0);
	let previewHeight = $derived(Math.max(viewport.height, measuredHeight));

	$effect(() => {
		if (scene.id && scene.viewport) measuredHeight = 0;
	});
</script>

<div class="scene-frame" class:selected>
	<Handle type="target" position={Position.Left} />
	<div class="frame-heading">
		<div class="frame-title">
			{#if scene.viewport === 'mobile'}<Smartphone
					size={15}
				/>{:else if scene.viewport === 'tablet'}<Tablet size={15} />{:else}<Monitor
					size={15}
				/>{/if}
			<strong>{scene.name}</strong>
		</div>
		<span>{scene.viewport}</span>
	</div>
	<div class="frame-preview" style:height="{previewHeight * scale}px">
		<div
			class="preview-size"
			style:width="{viewport.width}px"
			style:height="{previewHeight}px"
			style:transform="scale({scale})"
		>
			<CanvasPreview
				html={scene.html}
				css={scene.css}
				js={scene.js}
				title={scene.name}
				interactive={false}
				onheightchange={(height) => (measuredHeight = height)}
			/>
		</div>
	</div>
	<div class="frame-foot">Click to open preview <span>Drag to arrange</span></div>
	<Handle type="source" position={Position.Right} />
</div>

<style>
	.scene-frame {
		width: 324px;
		background: var(--surface);
		border: 1px solid var(--border-strong);
		border-radius: 12px;
		overflow: visible;
		box-shadow: 0 8px 28px var(--shadow-softer);
		color: var(--text-strong);
	}
	.scene-frame.selected {
		outline: 2px solid var(--focus);
		outline-offset: 2px;
	}
	.frame-heading {
		height: 42px;
		padding: 0 12px;
		display: flex;
		align-items: center;
		justify-content: space-between;
		border-bottom: 1px solid var(--border);
		gap: 8px;
	}
	.frame-title {
		display: flex;
		align-items: center;
		gap: 8px;
		min-width: 0;
		font-size: var(--text-body-sm);
		line-height: var(--text-body-sm--line-height);
		letter-spacing: var(--text-body-sm--letter-spacing);
	}
	.frame-title strong {
		overflow: hidden;
		white-space: nowrap;
		text-overflow: ellipsis;
	}
	.frame-heading span {
		color: var(--text-muted);
		font-size: var(--text-label-sm);
		line-height: var(--text-label-sm--line-height);
		letter-spacing: var(--text-label-sm--letter-spacing);
		text-transform: capitalize;
	}
	.frame-preview {
		width: 300px;
		margin: 11px;
		overflow: hidden;
		background: white;
		pointer-events: none;
	}
	.preview-size {
		transform-origin: top left;
		pointer-events: none;
	}
	.frame-foot {
		display: flex;
		justify-content: space-between;
		padding: 0 12px 11px;
		color: var(--text-muted);
		font-size: var(--text-label-sm);
		line-height: var(--text-label-sm--line-height);
		letter-spacing: var(--text-label-sm--letter-spacing);
	}
	:global(.scene-frame .svelte-flow__handle) {
		width: 12px;
		height: 12px;
		background: var(--text-strong);
		border: 2px solid var(--surface);
	}
</style>
