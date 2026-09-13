<script lang="ts">
	import { resolve } from '$app/paths';
	import { Plus, Sparkles } from '@lucide/svelte';

	let { projectId }: { projectId: string } = $props();
</script>

<section class="skills-band" aria-labelledby="project-skills-heading">
	<div class="skills-band-icon"><Sparkles size={17} /></div>
	<div class="skills-band-content">
		<span id="project-skills-heading" class="instructions-band-title">Project skills</span>
		<p>Keep reusable workflows close to the context they belong to.</p>
	</div>
	<div class="skills-band-actions">
		<a class="button" href={resolve(`/skills?projectId=${encodeURIComponent(projectId)}`)}
			>Manage skills</a
		>
		<a
			class="button primary"
			href={resolve(`/skills?projectId=${encodeURIComponent(projectId)}&create=1`)}
			><Plus size={14} /> New skill</a
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
	.button.primary {
		color: var(--accent-fg);
		background: var(--accent-bg);
		border-color: var(--accent-bg);
	}
	.button.primary:hover {
		background: var(--accent-bg-hover);
		border-color: var(--accent-bg-hover);
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
		.skills-band-actions .button {
			flex: 1;
		}
	}
</style>
