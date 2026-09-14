<script lang="ts">
	import { buildMockupSrcdoc } from '$lib/canvas';

	type Props = {
		html: string;
		css: string;
		js?: string;
		title?: string;
		scale?: number;
		interactive?: boolean;
		onheightchange?: (height: number) => void;
	};

	let {
		html,
		css,
		js = '',
		title = 'Mockup Preview',
		scale = 1,
		interactive = true,
		onheightchange
	}: Props = $props();

	let iframe: HTMLIFrameElement;
	let srcDoc = $derived(
		buildMockupSrcdoc({ html, css, js, title, reportHeight: !!onheightchange })
	);

	function handleMessage(event: MessageEvent) {
		if (!onheightchange || event.source !== iframe?.contentWindow) return;
		if (event.data?.type !== 'mimin-canvas-preview-height') return;
		const height = event.data.height;
		if (typeof height === 'number' && Number.isFinite(height) && height > 0) {
			onheightchange(Math.min(height, 20_000));
		}
	}
</script>

<svelte:window onmessage={handleMessage} />

<div class="sandbox-wrapper" class:non-interactive={!interactive}>
	<iframe
		bind:this={iframe}
		{title}
		srcdoc={srcDoc}
		sandbox="allow-scripts"
		class="preview-iframe"
		style:transform={scale !== 1 ? `scale(${scale})` : undefined}
		style:transform-origin="top center"
	></iframe>
</div>

<style>
	.sandbox-wrapper {
		width: 100%;
		height: 100%;
		position: relative;
		overflow: hidden;
		background: #ffffff;
		border-radius: 8px;
		display: flex;
		justify-content: center;
	}

	.sandbox-wrapper.non-interactive {
		pointer-events: none;
	}

	.preview-iframe {
		width: 100%;
		height: 100%;
		border: none;
		display: block;
		background: #ffffff;
	}
</style>
