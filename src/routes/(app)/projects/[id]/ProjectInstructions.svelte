<script lang="ts">
	import type { Project } from './project-types';
	import { Button } from '$lib/components/ui/button/index.js';

	let { project, onedit }: { project: Project; onedit: () => void } = $props();
</script>

<section class="instructions-band" aria-labelledby="project-instructions-heading">
	<div class="instructions-band-content">
		<span id="project-instructions-heading" class="instructions-band-title">Agent instructions</span
		>
		<p>{project.instructions || 'No project-specific instructions set.'}</p>
	</div>
	<Button variant="outline" class="instructions-action" onclick={onedit}
		>{project.instructions ? 'Update instructions' : 'Add instructions'}</Button
	>
</section>

<style>
	.instructions-band {
		display: flex;
		align-items: flex-start;
		justify-content: space-between;
		gap: 20px;
		margin-top: 20px;
		padding: var(--space-4) 18px;
		background: var(--surface-2);
		border: 1px solid var(--border);
		border-radius: var(--radius-lg);
	}
	.instructions-band-content {
		flex: 1;
		min-width: 0;
	}
	.instructions-band-title {
		display: block;
		color: var(--text-muted);
		font-size: var(--text-body-sm);
		line-height: var(--text-body-sm--line-height);
		letter-spacing: var(--text-body-sm--letter-spacing);
		font-weight: 500;
	}
	.instructions-band p {
		max-width: 650px;
		margin: 5px 0 0;
		color: var(--text-body);
		font-size: var(--text-body-md);
		line-height: var(--text-body-md--line-height);
		letter-spacing: var(--text-body-md--letter-spacing);
		white-space: pre-wrap;
	}
	.instructions-band :global(.instructions-action) {
		flex: 0 0 auto;
	}
	@media (max-width: 760px) {
		.instructions-band {
			align-items: stretch;
			flex-direction: column;
			gap: var(--space-3);
		}
		.instructions-band :global(.instructions-action) {
			width: 100%;
		}
	}
</style>
