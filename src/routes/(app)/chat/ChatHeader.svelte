<script lang="ts">
	import { LayoutTemplate } from '@lucide/svelte';
	import Topbar from '$lib/components/Topbar.svelte';
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
	separator="chevron-down"
>
	{#snippet actions()}
		{#if ontogglecanvas}
			<button
				class="canvas-toggle-btn"
				class:active={canvasOpen}
				disabled={canvasLoading}
				title={canvasOpen ? 'Close Canvas' : hasCanvas ? 'Open Canvas' : 'Create Canvas'}
				aria-label="Toggle Canvas"
				onclick={ontogglecanvas}
			>
				<LayoutTemplate size={16} />
				<span class="canvas-btn-text">{canvasLoading ? 'Loading…' : 'Canvas'}</span>
				{#if hasCanvas}<span class="canvas-active-dot"></span>{/if}
			</button>
		{/if}
	{/snippet}
</Topbar>

<style>
	.canvas-toggle-btn {
		display: inline-flex;
		align-items: center;
		gap: 6px;
		height: 32px;
		padding: 0 10px;
		border: 1px solid var(--border);
		background: var(--surface);
		border-radius: 6px;
		font-size: var(--text-body-sm);
		line-height: var(--text-body-sm--line-height);
		letter-spacing: var(--text-body-sm--letter-spacing);
		font-weight: 500;
		color: var(--text-muted);
		cursor: pointer;
		position: relative;
		transition:
			color 0.16s ease,
			background 0.16s ease,
			border-color 0.16s ease;
	}

	.canvas-toggle-btn:hover:not(:disabled) {
		background: var(--surface-hover);
		color: var(--text-strong);
		border-color: var(--border-strong);
	}

	.canvas-toggle-btn.active {
		background: var(--surface-3);
		border-color: var(--border-strong);
		color: var(--text-strong);
		font-weight: 500;
	}

	.canvas-toggle-btn:disabled {
		opacity: 0.6;
		cursor: wait;
	}

	.canvas-active-dot {
		width: 5px;
		height: 5px;
		border-radius: 50%;
		background: var(--status-ok-dot);
	}

	@media (max-width: 500px) {
		.canvas-btn-text {
			display: none;
		}
	}
</style>
