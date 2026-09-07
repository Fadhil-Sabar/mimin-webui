/** The public portion of a skill, safe to use in browser state and API responses. */
export interface SkillSummary {
	id: string;
	userId?: string;
	projectId: string | null;
	name: string;
	description: string;
	enabledTools: string[];
	triggerPhrases: string[];
	createdAt?: string | Date;
	updatedAt?: string | Date;
}

/** A skill with its editable instructions. Keep this out of conversation summaries. */
export interface Skill extends SkillSummary {
	instructions: string;
}

/** Immutable instructions and preset captured when a skill is activated for a turn. */
export interface SkillSnapshot {
	id: string;
	projectId: string | null;
	name: string;
	description: string;
	instructions: string;
	enabledTools: string[];
	triggerPhrases: string[];
}

function normalize(value: string) {
	return value.trim().replace(/\s+/g, ' ').toLowerCase();
}

/**
 * Find the deterministic contextual skill suggestion for an unsent draft.
 * Matching is local and intentionally only inspects the supplied skill data.
 */
export function matchSkillSuggestion(
	draft: string,
	skills: readonly SkillSummary[],
	projectId: string | null | undefined,
	activeSkillId: string | null | undefined
): SkillSummary | null {
	if (draft.trim().length < 12) return null;
	const normalizedDraft = normalize(draft);
	if (!normalizedDraft) return null;

	const candidates: Array<{ skill: SkillSummary; triggerLength: number; isProjectSkill: boolean }> =
		[];
	for (const skill of skills) {
		if (skill.id === activeSkillId) continue;
		const isProjectSkill = Boolean(projectId && skill.projectId === projectId);
		if (skill.projectId !== null && !isProjectSkill) continue;
		for (const triggerPhrase of skill.triggerPhrases ?? []) {
			const normalizedTrigger = normalize(triggerPhrase);
			if (!normalizedTrigger || !normalizedDraft.includes(normalizedTrigger)) continue;
			candidates.push({
				skill,
				triggerLength: normalizedTrigger.length,
				isProjectSkill
			});
		}
	}

	candidates.sort((a, b) => {
		if (b.triggerLength !== a.triggerLength) return b.triggerLength - a.triggerLength;
		if (a.isProjectSkill !== b.isProjectSkill) return a.isProjectSkill ? -1 : 1;
		const aName = a.skill.name.toLowerCase();
		const bName = b.skill.name.toLowerCase();
		if (aName !== bName) return aName < bName ? -1 : 1;
		return a.skill.id.localeCompare(b.skill.id);
	});
	const winner = candidates[0];
	return winner?.skill ?? null;
}

export function toSkillSnapshot(skill: Skill): SkillSnapshot {
	return {
		id: skill.id,
		projectId: skill.projectId,
		name: skill.name,
		description: skill.description,
		instructions: skill.instructions,
		enabledTools: [...skill.enabledTools],
		triggerPhrases: [...skill.triggerPhrases]
	};
}

/** Dismissal is draft-scoped: clearing or submitting the draft makes it eligible again. */
export function isSkillSuggestionDismissed(draft: string, dismissed: boolean) {
	return dismissed && draft.trim().length > 0;
}
