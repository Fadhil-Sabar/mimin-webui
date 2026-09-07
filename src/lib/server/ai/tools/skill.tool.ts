import { Type } from 'typebox';
import type { AgentTool } from '@earendil-works/pi-agent-core';
import { getDb, schema } from '../../db/client';
import { getOwnedProject } from '../../api';
import { validateSkillTools } from '../../skills';
import {
	SKILL_NAME_MAX_LENGTH,
	SKILL_DESCRIPTION_MAX_LENGTH,
	SKILL_INSTRUCTIONS_MAX_LENGTH,
	SKILL_MAX_TOOLS,
	SKILL_MAX_TRIGGER_PHRASES,
	SKILL_TRIGGER_MAX_LENGTH
} from '../../validation';

export type SkillToolContext = {
	userId: string;
	conversationProjectId?: string | null;
};

export const createSkillParameters = Type.Object({
	name: Type.String({
		minLength: 1,
		maxLength: SKILL_NAME_MAX_LENGTH,
		description: 'The title/name of the skill (e.g. "TypeScript Refactorer", "SQL Optimizer", "Meeting Notes Formatter").'
	}),
	instructions: Type.String({
		minLength: 1,
		maxLength: SKILL_INSTRUCTIONS_MAX_LENGTH,
		description: 'Comprehensive system instructions for this skill, describing its persona, step-by-step approach, constraints, style, and output format.'
	}),
	description: Type.Optional(
		Type.String({
			maxLength: SKILL_DESCRIPTION_MAX_LENGTH,
			description: 'A short description of what the skill does and when to use it.'
		})
	),
	projectId: Type.Optional(
		Type.Union([Type.String(), Type.Null()], {
			description: 'Optional project ID to associate this skill with. Pass null or omit for a personal skill available across all chats.'
		})
	),
	enabledTools: Type.Optional(
		Type.Array(Type.String(), {
			maxItems: SKILL_MAX_TOOLS,
			description: 'Tool names enabled when this skill is active (e.g. ["web_search", "project_knowledge_search"]).'
		})
	),
	triggerPhrases: Type.Optional(
		Type.Array(Type.String({ maxLength: SKILL_TRIGGER_MAX_LENGTH }), {
			maxItems: SKILL_MAX_TRIGGER_PHRASES,
			description: 'Phrases that trigger a recommendation to activate this skill (e.g. ["review code", "write sql query"]).'
		})
	)
});

export function createCreateSkillTool(context: SkillToolContext): AgentTool<typeof createSkillParameters> {
	return {
		name: 'create_skill',
		label: 'Create Skill',
		description:
			'Create a reusable skill with custom instructions, tool presets, and trigger phrases. Use this whenever the user asks to save, create, or turn a workflow, persona, or instructions into a skill.',
		parameters: createSkillParameters,
		execute: async (_toolCallId, params, signal) => {
			if (signal?.aborted) throw new Error('Tool cancelled');

			const name = params.name?.trim();
			if (!name) {
				return {
					content: [{ type: 'text', text: 'Error: Skill name cannot be empty.' }],
					details: { error: 'Skill name cannot be empty.' },
					isError: true
				};
			}

			const instructions = params.instructions?.trim();
			if (!instructions) {
				return {
					content: [{ type: 'text', text: 'Error: Skill instructions cannot be empty.' }],
					details: { error: 'Skill instructions cannot be empty.' },
					isError: true
				};
			}

			let targetProjectId: string | null = null;
			if (params.projectId !== undefined && params.projectId !== null) {
				const pid = params.projectId.trim();
				if (pid) {
					const project = await getOwnedProject(pid, context.userId);
					if (!project) {
						return {
							content: [
								{
									type: 'text',
									text: `Error: Project "${pid}" does not exist or is not accessible.`
								}
							],
							details: { error: `Project "${pid}" does not exist or is not accessible.` },
							isError: true
						};
					}
					targetProjectId = pid;
				}
			}

			const rawTools = params.enabledTools ?? [];
			const validatedTools = validateSkillTools(rawTools, targetProjectId);
			if (!validatedTools) {
				return {
					content: [
						{
							type: 'text',
							text: `Error: One or more selected tools are unavailable for this scope: ${rawTools.join(', ')}`
						}
					],
					details: {
						error: `One or more selected tools are unavailable for this scope: ${rawTools.join(', ')}`
					},
					isError: true
				};
			}

			const cleanedTriggers: string[] = [];
			const seenNormalized = new Set<string>();
			for (const phrase of params.triggerPhrases ?? []) {
				const trimmed = phrase.trim();
				if (!trimmed) continue;
				const normalized = trimmed.toLowerCase().replace(/\s+/g, ' ');
				if (!seenNormalized.has(normalized)) {
					seenNormalized.add(normalized);
					cleanedTriggers.push(trimmed);
				}
				if (cleanedTriggers.length >= SKILL_MAX_TRIGGER_PHRASES) break;
			}

			const description = params.description?.trim() ?? '';

			const [skill] = await getDb()
				.insert(schema.skills)
				.values({
					userId: context.userId,
					projectId: targetProjectId,
					name,
					description,
					instructions,
					enabledTools: validatedTools,
					triggerPhrases: cleanedTriggers
				})
				.returning();

			const toolList = skill.enabledTools.length > 0 ? skill.enabledTools.join(', ') : 'None';
			const triggerList =
				skill.triggerPhrases.length > 0
					? skill.triggerPhrases.map((p: string) => `"${p}"`).join(', ')
					: 'None';

			return {
				content: [
					{
						type: 'text',
						text: `Skill "${skill.name}" created successfully!\n\n- ID: ${skill.id}\n- Scope: ${skill.projectId ? 'Project-specific' : 'Personal (all conversations)'}\n- Tools: ${toolList}\n- Trigger phrases: ${triggerList}\n- Description: ${skill.description || 'None'}\n\nInstructions preview:\n${skill.instructions.slice(0, 300)}${skill.instructions.length > 300 ? '...' : ''}`
					}
				],
				details: {
					skill: {
						id: skill.id,
						name: skill.name,
						description: skill.description,
						projectId: skill.projectId,
						enabledTools: skill.enabledTools,
						triggerPhrases: skill.triggerPhrases
					}
				}
			};
		}
	};
}
