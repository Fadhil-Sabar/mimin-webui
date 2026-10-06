<script lang="ts">
	import { SvelteFlowProvider } from '@xyflow/svelte';
	import type { ComponentProps } from 'svelte';
	import CanvasWorkspace from './CanvasWorkspace.svelte';

	// The chat page imports this host lazily, so `@xyflow/svelte` and its context
	// provider stay out of the initial chat bundle until the canvas pane opens.
	let props: ComponentProps<typeof CanvasWorkspace> = $props();
</script>

<SvelteFlowProvider>
	<CanvasWorkspace {...props} />
</SvelteFlowProvider>
