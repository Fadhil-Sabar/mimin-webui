<script lang="ts">
	import { resolve } from '$app/paths';
	import { Loader2, Play, Plus, Sparkles } from '@lucide/svelte';
	import { Button } from '$lib/components/ui/button/index.js';
	import type { SkillSummary } from '$lib/skills';

	let { projectId, onskillchat }: { projectId: string; onskillchat: (skillId: string) => void } =
		$props();

	let skills = $state<SkillSummary[]>([]);
	let loading = $state(true);

	$effect(() => {
		const id = projectId;
		if (!id) return;
		let cancelled = false;
		loading = true;
		void (async () => {
			try {
				const response = await fetch(`/api/skills?projectId=${encodeURIComponent(id)}`);
				if (!response.ok) throw new Error('Could not load skills');
				const data = await response.json();
				if (cancelled) return;
				// The endpoint also returns personal skills; this band is about the project's.
				skills = ((data.skills ?? []) as SkillSummary[]).filter((skill) => skill.projectId === id);
			} catch {
				if (!cancelled) skills = [];
			} finally {
				if (!cancelled) loading = false;
			}
		})();
		return () => {
			cancelled = true;
		};
	});
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

{#if loading || skills.length > 0}
	<div class="skill-list">
		{#if loading}
			<span class="skill-list-status" role="status">
				<Loader2 size={13} class="animate-spin" /> Loading project skills…
			</span>
		{:else}
			{#each skills as skill (skill.id)}
				<div class="skill-row">
					<div class="skill-row-text">
						<strong>{skill.name}</strong>
						{#if skill.description}<small>{skill.description}</small>{/if}
					</div>
					<Button variant="ghost" size="sm" class="skill-use" onclick={() => onskillchat(skill.id)}>
						<Play size={13} /> Use in chat
					</Button>
				</div>
			{/each}
		{/if}
	</div>
{/if}

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
		font-size: var(--text-body-sm);
		line-height: var(--text-body-sm--line-height);
		letter-spacing: var(--text-body-sm--letter-spacing);
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
		font-size: var(--text-body-sm);
		line-height: var(--text-body-sm--line-height);
		letter-spacing: var(--text-body-sm--letter-spacing);
		font-weight: 500;
	}
	.skill-list {
		display: flex;
		flex-direction: column;
		margin-top: 7px;
		background: var(--surface);
		border: 1px solid var(--border);
		border-radius: 8px;
		overflow: hidden;
	}
	.skill-list-status {
		display: inline-flex;
		align-items: center;
		gap: 6px;
		padding: 10px 14px;
		color: var(--text-dim);
		font-size: var(--text-body-sm);
		line-height: var(--text-body-sm--line-height);
		letter-spacing: var(--text-body-sm--letter-spacing);
	}
	.skill-row {
		display: flex;
		align-items: center;
		gap: 12px;
		padding: 9px 14px;
		border-bottom: 1px solid var(--border);
	}
	.skill-row:last-child {
		border-bottom: 0;
	}
	.skill-row-text {
		min-width: 0;
		flex: 1;
	}
	.skill-row-text strong {
		display: block;
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
		color: var(--text-strong);
		font-size: var(--text-body-md);
		line-height: var(--text-body-md--line-height);
		letter-spacing: var(--text-body-md--letter-spacing);
		font-weight: 500;
	}
	.skill-row-text small {
		display: block;
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
		color: var(--text-dim);
		font-size: var(--text-body-sm);
		line-height: var(--text-body-sm--line-height);
		letter-spacing: var(--text-body-sm--letter-spacing);
	}
	.skill-list :global(.skill-use) {
		flex: 0 0 auto;
		color: var(--text-muted);
		font-size: var(--text-label-lg);
		line-height: var(--text-label-lg--line-height);
		letter-spacing: var(--text-label-lg--letter-spacing);
		font-weight: var(--text-label-lg--font-weight);
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
