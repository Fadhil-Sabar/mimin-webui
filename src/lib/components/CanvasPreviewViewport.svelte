<script lang="ts">
	import type { ViewportDevice } from '$lib/canvas';
	import { VIEWPORT_SPECS } from '$lib/canvas';
	import { getCanvasPreviewScale } from '$lib/client/canvas-preview-viewport';
	import CanvasPreview from './CanvasPreview.svelte';

	type Props = {
		html: string;
		css: string;
		js?: string;
		title?: string;
		viewport: ViewportDevice;
		fit?: boolean;
	};

	let { html, css, js, title, viewport, fit = true }: Props = $props();
	let stage: HTMLDivElement;
	let availableWidth = $state(0);
	let availableHeight = $state(0);
	const spec = $derived(VIEWPORT_SPECS[viewport]);
	const scale = $derived(getCanvasPreviewScale(viewport, availableWidth, availableHeight, fit));

	$effect(() => {
		if (!stage) return;
		const observer = new ResizeObserver(([entry]) => {
			availableWidth = entry.contentRect.width;
			availableHeight = entry.contentRect.height;
		});
		observer.observe(stage);
		return () => observer.disconnect();
	});
</script>

<div class="viewport-stage" class:native-size={!fit} bind:this={stage}>
	<div
		class="screen-reservation"
		style:width="{spec.width * scale}px"
		style:height="{spec.height * scale}px"
	>
		<div
			class="screen"
			style:width="{spec.width}px"
			style:height="{spec.height}px"
			style:transform="scale({scale})"
		>
			<CanvasPreview {html} {css} {js} {title} />
		</div>
	</div>
</div>

<style>
	.viewport-stage {
		width: 100%;
		height: 100%;
		min-width: 0;
		min-height: 0;
		overflow: auto;
		display: flex;
		align-items: center;
		justify-content: center;
		padding: 0;
	}

	.viewport-stage.native-size {
		align-items: flex-start;
		justify-content: flex-start;
	}

	.screen-reservation {
		position: relative;
		flex: 0 0 auto;
		min-width: 1px;
		min-height: 1px;
		background: white;
		box-shadow: 0 4px 20px var(--shadow-softer);
	}

	.screen {
		position: absolute;
		top: 0;
		left: 0;
		max-width: none;
		transform-origin: top left;
	}

	.screen :global(.sandbox-wrapper) {
		width: 100%;
		height: 100%;
		border-radius: 0;
	}
</style>
