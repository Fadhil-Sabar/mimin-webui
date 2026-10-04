<script lang="ts">
	import type { Snippet } from 'svelte';

	let {
		open = false,
		summaryClass = '',
		summary,
		children
	}: { open?: boolean; summaryClass?: string; summary: Snippet; children: Snippet } = $props();
	let expanded = $derived(open);
	const contentId = $props.id();
</script>

<div class="disclosure" data-expanded={expanded}>
	<button
		type="button"
		class="disclosure-summary {summaryClass}"
		aria-expanded={expanded}
		aria-controls={contentId}
		onclick={() => (expanded = !expanded)}
	>
		{@render summary()}
	</button>
	<div class="disclosure-content" class:expanded id={contentId} inert={!expanded}>
		<div class="disclosure-inner">{@render children()}</div>
	</div>
</div>

<style>
	.disclosure-summary {
		width: 100%;
		border: 0;
		background: transparent;
		text-align: left;
	}
	.disclosure-content {
		display: grid;
		grid-template-rows: 0fr;
		opacity: 0;
		visibility: hidden;
		transition:
			grid-template-rows var(--duration-short4) var(--ease-standard),
			opacity var(--duration-short3) var(--ease-standard),
			visibility 0s var(--duration-short4);
	}
	.disclosure-content.expanded {
		grid-template-rows: 1fr;
		opacity: 1;
		visibility: visible;
		transition-duration: var(--duration-medium2), var(--duration-short4), 0s;
		transition-delay: 0s;
	}
	.disclosure-inner {
		min-height: 0;
		overflow: hidden;
	}
	@media (prefers-reduced-motion: reduce) {
		.disclosure-content {
			transition: none;
		}
	}
</style>
