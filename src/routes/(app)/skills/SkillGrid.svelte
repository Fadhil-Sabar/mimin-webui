<script lang="ts">
	import { Plus } from '@lucide/svelte';
	import SkillCard from './SkillCard.svelte';
	import type { Skill } from './skills-types';

	let {
		skills,
		scopeLabel,
		showCreateCard,
		oncreate,
		onedit,
		onduplicate,
		ondelete
	}: {
		skills: Skill[];
		scopeLabel: (skill: Skill) => string;
		showCreateCard: boolean;
		oncreate: () => void;
		onedit: (skill: Skill) => void;
		onduplicate: (skill: Skill) => void;
		ondelete: (skill: Skill) => void;
	} = $props();
</script>

<div class="skill-grid">
	{#each skills as skill (skill.id)}
		<SkillCard
			{skill}
			scopeLabel={scopeLabel(skill)}
			onedit={() => onedit(skill)}
			onduplicate={() => onduplicate(skill)}
			ondelete={() => ondelete(skill)}
		/>
	{/each}
	{#if showCreateCard}
		<button class="empty-card" onclick={oncreate}>
			<Plus size={19} />
			<strong>Create a new skill</strong>
			<span>Save instructions and tools to reuse in chat</span>
		</button>
	{/if}
</div>

<style>
	.skill-grid {
		display: grid;
		grid-template-columns: repeat(3, minmax(0, 1fr));
		gap: 13px;
	}
	.empty-card {
		min-height: 220px;
		padding: 18px;
		text-align: left;
		border: 1px solid var(--border);
		border-radius: 10px;
		background: var(--surface);
		transition: var(--duration-short4) var(--ease-standard);
		text-decoration: none;
		color: inherit;
		display: flex;
		flex-direction: column;
		align-items: center;
		justify-content: center;
		gap: 8px;
		color: var(--text-muted);
		border-style: dashed;
		background: transparent;
		cursor: pointer;
	}
	.empty-card:hover {
		border-color: var(--text-dim);
		background: var(--surface-hover);
	}
	.empty-card strong {
		color: var(--text-strong);
		font-size: var(--text-body-md);
		line-height: var(--text-body-md--line-height);
		letter-spacing: var(--text-body-md--letter-spacing);
		font-weight: 500;
	}
	.empty-card span {
		font-size: var(--text-body-sm);
		line-height: var(--text-body-sm--line-height);
		letter-spacing: var(--text-body-sm--letter-spacing);
		color: var(--text-dim);
	}
	@media (max-width: 850px) {
		.skill-grid {
			grid-template-columns: repeat(2, minmax(0, 1fr));
		}
	}
	@media (max-width: 560px) {
		.skill-grid {
			grid-template-columns: 1fr;
		}
	}
</style>
