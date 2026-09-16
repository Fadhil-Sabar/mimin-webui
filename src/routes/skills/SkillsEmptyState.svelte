<script lang="ts">
	import { Button } from '$lib/components/ui/button/index.js';

	let {
		loading,
		error,
		query,
		skillCount,
		visibleCount,
		onretry
	}: {
		loading: boolean;
		error: string;
		query: string;
		skillCount: number;
		visibleCount: number;
		onretry: () => void;
	} = $props();
</script>

{#if loading}
	<div class="empty-state" role="status">Loading skills...</div>
{:else if error}
	<div class="empty-state error-state" role="alert">
		<strong>Couldn’t load skills</strong><span>{error}</span><Button
			variant="outline"
			class="mt-[15px]"
			onclick={onretry}>Try again</Button
		>
	</div>
{:else if skillCount === 0}
	<div class="empty-state">
		No skills yet. Create your first skill to give your assistant reusable workflows.
	</div>
{:else if visibleCount === 0}
	<div class="empty-state">No skills match{query.trim() ? ` “${query}”` : ' this filter'}.</div>
{/if}

<style>
	.empty-state {
		text-align: center;
		color: var(--text-dim);
		font-size: var(--text-sm);
		padding: 40px 0;
		line-height: 1.5;
	}
	.error-state strong,
	.error-state span {
		display: block;
		margin: 0 auto;
	}
	.error-state strong {
		color: var(--text-strong);
		font-weight: 600;
	}
	.error-state span {
		margin-top: 5px;
	}
</style>
