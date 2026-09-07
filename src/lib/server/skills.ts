import { getTool } from '$lib/server/ai/tools/registry';
import { toSkillSnapshot, type Skill, type SkillSnapshot, type SkillSummary } from '$lib/skills';

export { toSkillSnapshot };

export type SkillRow = Skill & { userId: string };

/** Return a de-duplicated preset only when every requested tool is valid for its scope. */
export function validateSkillTools(enabledTools: readonly string[], projectId: string | null) {
	const tools = [...new Set(enabledTools.map((tool) => tool.trim()).filter(Boolean))];
	if (
		tools.some((tool) => {
			const entry = getTool(tool, projectId ?? undefined);
			return !entry || entry.readOnly;
		})
	)
		return null;
	return tools;
}

export function skillSummary(skill: SkillSummary | Skill): SkillSummary {
	return {
		id: skill.id,
		projectId: skill.projectId,
		name: skill.name,
		description: skill.description,
		enabledTools: [...skill.enabledTools],
		triggerPhrases: [...skill.triggerPhrases],
		...(skill.userId ? { userId: skill.userId } : {}),
		...(skill.createdAt ? { createdAt: skill.createdAt } : {}),
		...(skill.updatedAt ? { updatedAt: skill.updatedAt } : {})
	};
}

export function skillSnapshot(skill: Skill): SkillSnapshot {
	return toSkillSnapshot(skill);
}
