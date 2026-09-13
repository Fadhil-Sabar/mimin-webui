<script lang="ts">
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
		<strong>Couldn’t load skills</strong><span>{error}</span><button
			class="button"
			onclick={onretry}>Try again</button
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
	.error-state span,
	.error-state .button {
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
	.error-state .button {
		margin-top: 15px;
	}
	.button {
		display: inline-flex;
		align-items: center;
		gap: 8px;
		min-height: 38px;
		padding: 8px 13px;
		border-radius: 6px;
		border: 1px solid var(--border-strong);
		background: var(--surface);
		color: var(--text-body);
		font-family: var(--font-body);
		font-size: var(--text-sm);
		font-weight: 500;
		transition: 0.18s ease;
	}
	.button:hover:not(:disabled) {
		color: var(--text-strong);
		background: var(--surface-hover);
		border-color: var(--text-dim);
	}
</style>
