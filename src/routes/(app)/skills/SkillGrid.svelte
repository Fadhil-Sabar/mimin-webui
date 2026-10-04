<script lang="ts">
	import SkillCard from './SkillCard.svelte';
	import type { Skill } from './skills-types';

	let {
		skills,
		scopeLabel,
		onedit,
		onduplicate,
		ondelete
	}: {
		skills: Skill[];
		scopeLabel: (skill: Skill) => string;
		onedit: (skill: Skill) => void;
		onduplicate: (skill: Skill) => void;
		ondelete: (skill: Skill) => void;
	} = $props();
</script>

<div class="skill-grid">
	{#each skills as skill, index (skill.id)}
		<SkillCard
			{skill}
			order={index}
			scopeLabel={scopeLabel(skill)}
			onedit={() => onedit(skill)}
			onduplicate={() => onduplicate(skill)}
			ondelete={() => ondelete(skill)}
		/>
	{/each}
</div>

<style>
	.skill-grid {
		display: grid;
		grid-template-columns: repeat(3, minmax(0, 1fr));
		gap: var(--space-4);
	}
	@media (max-width: 900px) {
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
