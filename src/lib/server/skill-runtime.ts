import { and, eq } from 'drizzle-orm';
import { getDb, schema } from '$lib/server/db/client';
import { toSkillSnapshot, type Skill, type SkillSnapshot, type SkillSummary } from '$lib/skills';

/**
 * The server-side shape of the immutable activation snapshot. Keeping this
 * separate from the response shape makes it harder to accidentally expose
 * skill instructions through a conversation endpoint.
 */
export type ConversationSkillFields = {
	projectId?: string | null;
	activeSkillId?: string | null;
	activeSkillSnapshot?: SkillSnapshot | null;
};

export function getConversationSkillSnapshot(
	conversation: ConversationSkillFields
): SkillSnapshot | null {
	const snapshot = conversation.activeSkillSnapshot;
	if (!snapshot?.name || !snapshot.instructions) return null;
	return {
		// A deleted skill has no foreign-key id anymore, but its immutable
		// snapshot remains useful to the conversation runtime and retries.
		id: snapshot.id,
		projectId: snapshot.projectId ?? null,
		name: snapshot.name,
		description: snapshot.description ?? '',
		instructions: snapshot.instructions,
		enabledTools: [...(snapshot.enabledTools ?? [])],
		triggerPhrases: [...(snapshot.triggerPhrases ?? [])]
	};
}

export function getConversationSkillSummary(
	conversation: ConversationSkillFields
): SkillSummary | null {
	const snapshot = getConversationSkillSnapshot(conversation);
	if (!snapshot) return null;
	return {
		id: conversation.activeSkillId ?? snapshot.id,
		projectId: snapshot.projectId,
		name: snapshot.name,
		description: snapshot.description,
		enabledTools: snapshot.enabledTools,
		triggerPhrases: snapshot.triggerPhrases
	};
}

/** Remove private instructions before returning a conversation to the client. */
export function toPublicConversation<T extends ConversationSkillFields>(conversation: T) {
	const publicConversation = { ...conversation } as T & { activeSkillSnapshot?: unknown };
	delete publicConversation.activeSkillSnapshot;
	return {
		...publicConversation,
		activeSkill: getConversationSkillSummary(conversation)
	};
}

/** Remove immutable instructions from a message response while exposing its badge data. */
export function toPublicMessage<T extends { role?: string; skillSnapshot?: SkillSnapshot | null }>(
	message: T
) {
	const publicMessage = { ...message } as T & { skillSnapshot?: unknown };
	delete publicMessage.skillSnapshot;
	return {
		...publicMessage,
		skill: message.role === 'user' ? skillSnapshotToSummary(message.skillSnapshot) : null
	};
}

export function skillSnapshotToSummary(
	snapshot: SkillSnapshot | null | undefined
): SkillSummary | null {
	if (!snapshot?.name || !snapshot.instructions) return null;
	return {
		id: snapshot.id,
		projectId: snapshot.projectId,
		name: snapshot.name,
		description: snapshot.description,
		enabledTools: [...(snapshot.enabledTools ?? [])],
		triggerPhrases: [...(snapshot.triggerPhrases ?? [])]
	};
}

/** Resolve the immutable skill for a turn; an explicit null snapshot means no skill. */
export function getTurnSkillSnapshot(
	message: { skillSnapshot?: SkillSnapshot | null } | null | undefined,
	conversation: ConversationSkillFields
): SkillSnapshot | null {
	if (message && Object.prototype.hasOwnProperty.call(message, 'skillSnapshot')) {
		return message.skillSnapshot ?? null;
	}
	return getConversationSkillSnapshot(conversation);
}

/** Find a skill without revealing whether a foreign id exists. */
export async function getOwnedSkill(skillId: string, userId: string): Promise<Skill | null> {
	const [skill] = await getDb()
		.select()
		.from(schema.skills)
		.where(and(eq(schema.skills.id, skillId), eq(schema.skills.userId, userId)));
	return (skill as Skill | undefined) ?? null;
}

/**
 * Resolve a skill for activation. Personal skills are valid in every
 * conversation; project skills are valid only in that exact project.
 */
export async function resolveConversationSkill(
	skillId: string,
	userId: string,
	conversationProjectId: string | null | undefined
): Promise<{ skill: Skill } | { error: 'SKILL_NOT_FOUND' | 'INVALID_SKILL' }> {
	const skill = await getOwnedSkill(skillId, userId);
	if (!skill) return { error: 'SKILL_NOT_FOUND' };
	if (skill.projectId !== null && skill.projectId !== (conversationProjectId ?? null)) {
		return { error: 'INVALID_SKILL' };
	}
	return { skill };
}

export function skillActivationFields(skill: Skill | null): ConversationSkillFields {
	if (!skill) {
		return { activeSkillId: null, activeSkillSnapshot: null };
	}
	const snapshot = toSkillSnapshot(skill);
	return {
		activeSkillId: snapshot.id,
		activeSkillSnapshot: snapshot
	};
}
