<script lang="ts">
	import { LayoutTemplate } from '@lucide/svelte';
	import Topbar from '$lib/components/Topbar.svelte';
	import { Button } from '$lib/components/ui/button/index.js';
	import type { Conversation } from './chat-types';

	type Props = {
		conversation?: Conversation | null;
		canvasOpen?: boolean;
		hasCanvas?: boolean;
		canvasLoading?: boolean;
		ontogglecanvas?: () => void;
	};

	let {
		conversation = null,
		canvasOpen = false,
		hasCanvas = false,
		canvasLoading = false,
		ontogglecanvas
	}: Props = $props();
</script>

<Topbar
	breadcrumbs={[{ label: 'Chat' }, { label: conversation?.title ?? 'New session' }]}
	separator="chevron-right"
>
	{#snippet actions()}
		{#if ontogglecanvas}
			<Button
				variant="outline"
				size="sm"
				class="relative gap-1.5 px-[10px] text-[var(--text-muted)] {canvasOpen
					? 'border-[var(--border-strong)] bg-[var(--surface-3)] text-[var(--text-strong)]'
					: ''}"
				disabled={canvasLoading}
				title={canvasOpen ? 'Close Canvas' : hasCanvas ? 'Open Canvas' : 'Create Canvas'}
				aria-label="Toggle Canvas"
				onclick={ontogglecanvas}
			>
				<LayoutTemplate size={16} />
				<span class="canvas-btn-text">{canvasLoading ? 'Loading…' : 'Canvas'}</span>
				{#if hasCanvas}<span class="canvas-active-dot"></span>{/if}
			</Button>
		{/if}
	{/snippet}
</Topbar>

<style>
	.canvas-active-dot {
		width: 5px;
		height: 5px;
		border-radius: 50%;
		background: var(--status-ok-dot);
	}

	@media (max-width: 560px) {
		.canvas-btn-text {
			display: none;
		}
	}
</style>
