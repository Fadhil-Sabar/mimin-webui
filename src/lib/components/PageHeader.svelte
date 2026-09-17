<script lang="ts">
	import type { Snippet } from 'svelte';

	type Props = {
		title: string;
		subtitle?: string;
		eyebrow?: string;
		/** Leading icon, rendered inside the standard square. */
		icon?: Snippet;
		/** Trailing controls, aligned to the end of the band. */
		actions?: Snippet;
	};

	let { title, subtitle, eyebrow, icon, actions }: Props = $props();
</script>

<header class="page-header">
	<div class="page-header-main">
		{#if icon}<span class="page-header-icon">{@render icon()}</span>{/if}
		<div class="page-header-text">
			{#if eyebrow}<p class="page-header-eyebrow">{eyebrow}</p>{/if}
			<h1 class="md-headline-md">{title}</h1>
			{#if subtitle}<p class="page-header-subtitle">{subtitle}</p>{/if}
		</div>
	</div>
	{#if actions}
		<div class="page-header-actions">{@render actions()}</div>
	{/if}
</header>

<style>
	.page-header {
		display: flex;
		align-items: flex-end;
		justify-content: space-between;
		gap: var(--space-5);
		padding-bottom: var(--space-5);
		margin-bottom: var(--space-5);
		border-bottom: 1px solid var(--border);
	}
	.page-header-main {
		display: flex;
		align-items: center;
		gap: var(--space-4);
		min-width: 0;
	}
	.page-header-text {
		min-width: 0;
	}
	.page-header-icon {
		display: grid;
		place-items: center;
		width: 44px;
		height: 44px;
		flex: 0 0 44px;
		color: var(--text-muted);
		background: var(--surface-2);
		border: 1px solid var(--border);
		border-radius: var(--radius-xl);
	}
	h1 {
		margin: 0;
		color: var(--text-strong);
		font-family: var(--font-body);
	}
	.page-header-eyebrow {
		margin: 0 0 var(--space-1);
		color: var(--text-muted);
		font-family: var(--font-body);
		font-size: var(--text-body-sm);
		line-height: var(--text-body-sm--line-height);
		letter-spacing: var(--text-body-sm--letter-spacing);
		font-weight: 500;
		text-transform: uppercase;
	}
	.page-header-subtitle {
		margin: var(--space-1) 0 0;
		max-width: 62ch;
		color: var(--text-muted);
		font-family: var(--font-body);
		font-size: var(--text-body-md);
		line-height: var(--text-body-md--line-height);
		letter-spacing: var(--text-body-md--letter-spacing);
	}
	.page-header-actions {
		display: flex;
		align-items: center;
		gap: var(--space-2);
		flex: 0 0 auto;
	}
	@media (max-width: 760px) {
		.page-header {
			align-items: flex-start;
			flex-direction: column;
			gap: var(--space-4);
		}
		.page-header-actions {
			width: 100%;
		}
	}
</style>
