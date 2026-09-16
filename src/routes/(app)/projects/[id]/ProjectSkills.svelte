<script lang="ts">
	import { resolve } from '$app/paths';
	import { Plus, Sparkles } from '@lucide/svelte';
	import { Button } from '$lib/components/ui/button/index.js';

	let { projectId }: { projectId: string } = $props();
</script>

<section class="skills-band" aria-labelledby="project-skills-heading">
	<div class="skills-band-icon"><Sparkles size={17} /></div>
	<div class="skills-band-content">
		<span id="project-skills-heading" class="instructions-band-title">Project skills</span>
		<p>Keep reusable workflows close to the context they belong to.</p>
	</div>
	<div class="skills-band-actions">
		<Button
			variant="outline"
			class="skills-band-button"
			href={resolve(`/skills?projectId=${encodeURIComponent(projectId)}`)}>Manage skills</Button
		>
		<Button
			variant="default"
			class="skills-band-button"
			href={resolve(`/skills?projectId=${encodeURIComponent(projectId)}&create=1`)}
			><Plus size={14} /> New skill</Button
		>
	</div>
</section>

<style>
	.skills-band {
		display: flex;
		align-items: center;
		gap: 12px;
		margin-top: 10px;
		padding: 13px 15px;
		background: var(--surface-subtle);
		border: 1px solid var(--border);
		border-radius: 8px;
	}
	.skills-band-icon {
		display: grid;
		place-items: center;
		width: 31px;
		height: 31px;
		flex: 0 0 31px;
		color: var(--text-body);
		background: var(--surface-2);
		border: 1px solid var(--border);
		border-radius: 7px;
	}
	.skills-band-content {
		min-width: 0;
		flex: 1;
	}
	.skills-band-content p {
		margin: 3px 0 0;
		color: var(--text-muted);
		font-size: var(--text-xs);
		line-height: 1.4;
	}
	.skills-band-actions {
		display: flex;
		align-items: center;
		gap: 7px;
		flex: 0 0 auto;
	}
	.instructions-band-title {
		display: block;
		color: var(--text-muted);
		font-size: var(--text-xs);
		font-weight: 600;
		letter-spacing: 0.02em;
	}
	@media (max-width: 760px) {
		.skills-band {
			align-items: flex-start;
			flex-wrap: wrap;
		}
		.skills-band-actions {
			width: 100%;
			padding-left: 43px;
		}
		.skills-band-actions :global(.skills-band-button) {
			flex: 1;
		}
	}
</style>
