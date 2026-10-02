<script lang="ts">
	import { untrack } from 'svelte';
	import { streamingHtml } from '$lib/client/streaming-html';

	let { html, streaming }: { html: string; streaming: boolean } = $props();
	// Keep SSR content. Subsequent updates are reconciled by the action, retaining
	// the existing paragraph, selection, links, and completed reveal animations.
	const initialHtml = untrack(() => html);
</script>

<div class="markdown-segment" use:streamingHtml={{ html, streaming }}>
	<!-- eslint-disable-next-line svelte/no-at-html-tags -->
	{@html initialHtml}
</div>

<style>
	.markdown-segment {
		display: contents;
	}
</style>
