<script lang="ts">
	import type { Snippet } from 'svelte';

	type Props = {
		/** `wide` suits dense tables; `default` suits standard pages. */
		width?: 'default' | 'wide';
		children: Snippet;
	};

	let { width = 'default', children }: Props = $props();
</script>

<div class="page" class:wide={width === 'wide'}>
	{@render children()}
</div>

<style>
	.page {
		width: 100%;
		max-width: var(--content-max);
		margin: 0 auto;
		padding: clamp(var(--space-6), 5vh, var(--space-7)) var(--space-6) 80px;
	}
	.page.wide {
		max-width: var(--content-max-wide);
	}
	@media (max-width: 760px) {
		.page {
			padding: var(--space-5) var(--space-4) 60px;
		}
	}
</style>
