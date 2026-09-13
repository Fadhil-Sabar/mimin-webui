<script lang="ts">
	import type { Project } from './project-types';

	let { project, onedit }: { project: Project; onedit: () => void } = $props();
</script>

<section class="instructions-band" aria-labelledby="project-instructions-heading">
	<div class="instructions-band-content">
		<span id="project-instructions-heading" class="instructions-band-title">Agent instructions</span
		>
		<p>{project.instructions || 'No project-specific instructions set.'}</p>
	</div>
	<button class="button" onclick={onedit}
		>{project.instructions ? 'Update instructions' : 'Add instructions'}</button
	>
</section>

<style>
	.instructions-band {
		display: flex;
		align-items: flex-start;
		justify-content: space-between;
		gap: 20px;
		margin-top: 20px;
		padding: 16px 18px;
		background: var(--surface-2);
		border: 1px solid var(--border);
		border-radius: 8px;
	}
	.instructions-band-content {
		flex: 1;
		min-width: 0;
	}
	.instructions-band-title {
		display: block;
		color: var(--text-muted);
		font-size: var(--text-xs);
		font-weight: 600;
		letter-spacing: 0.02em;
	}
	.instructions-band p {
		max-width: 650px;
		margin: 5px 0 0;
		color: var(--text-body);
		font-size: var(--text-sm);
		line-height: 1.55;
		white-space: pre-wrap;
	}
	.instructions-band .button {
		flex: 0 0 auto;
	}
	.button {
		display: inline-flex;
		align-items: center;
		justify-content: center;
		gap: 7px;
		min-height: 36px;
		padding: 7px 12px;
		border-radius: 6px;
		border: 1px solid var(--border-strong);
		background: var(--surface);
		color: var(--text-body);
		font-family: var(--font-body);
		font-size: var(--text-sm);
		font-weight: 500;
		line-height: 1;
		white-space: nowrap;
		transition: 0.15s ease;
	}
	.button:hover {
		color: var(--text-strong);
		border-color: var(--text-dim);
		background: var(--surface-hover);
	}
	@media (max-width: 760px) {
		.instructions-band {
			align-items: stretch;
			flex-direction: column;
			gap: 12px;
		}
		.instructions-band .button {
			justify-content: center;
			width: 100%;
		}
	}
</style>
