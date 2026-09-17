<script lang="ts">
	import { Button } from '$lib/components/ui/button/index.js';
	import Skeleton from '$lib/components/Skeleton.svelte';

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
	<div class="skeleton-grid" role="status" aria-label="Loading skills">
		{#each [1, 2, 3, 4, 5, 6] as i (i)}
			<div class="skill-skeleton">
				<Skeleton width="36px" height="36px" radius="var(--radius-lg)" />
				<Skeleton width="64%" height="1.125rem" />
				<Skeleton width="100%" />
				<Skeleton width="80%" />
			</div>
		{/each}
	</div>
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
	/* Mirrors `.skill-grid` in SkillGrid.svelte and `.skill-card`'s box, so the grid
	 * the placeholder reserves is the grid the real cards land in. */
	.skeleton-grid {
		display: grid;
		grid-template-columns: repeat(3, minmax(0, 1fr));
		gap: 13px;
	}
	.skill-skeleton {
		display: flex;
		flex-direction: column;
		gap: 10px;
		min-height: 220px;
		padding: 18px;
		border: 1px solid var(--border);
		border-radius: var(--radius-lg);
		background: var(--surface);
	}
	@media (max-width: 850px) {
		.skeleton-grid {
			grid-template-columns: repeat(2, minmax(0, 1fr));
		}
	}
	@media (max-width: 560px) {
		.skeleton-grid {
			grid-template-columns: 1fr;
		}
	}
	.empty-state {
		text-align: center;
		color: var(--text-dim);
		font-size: var(--text-body-md);
		line-height: var(--text-body-md--line-height);
		letter-spacing: var(--text-body-md--letter-spacing);
		padding: 40px 0;
	}
	.error-state strong,
	.error-state span {
		display: block;
		margin: 0 auto;
	}
	.error-state strong {
		color: var(--text-strong);
		font-weight: 500;
	}
	.error-state span {
		margin-top: 5px;
	}
</style>
