import { z } from 'zod';

export const SKILL_NAME_MAX_LENGTH = 120;
export const SKILL_DESCRIPTION_MAX_LENGTH = 2000;
export const SKILL_INSTRUCTIONS_MAX_LENGTH = 20000;
export const SKILL_MAX_TOOLS = 20;
export const SKILL_MAX_TRIGGER_PHRASES = 12;
export const SKILL_TRIGGER_MAX_LENGTH = 160;

function hasUniqueNormalizedValues(values: string[]) {
	const normalized = values.map((value) => value.replace(/\s+/g, ' ').trim().toLowerCase());
	return new Set(normalized).size === normalized.length;
}

const skillTriggerPhrases = z
	.array(z.string().trim().min(1).max(SKILL_TRIGGER_MAX_LENGTH))
	.max(SKILL_MAX_TRIGGER_PHRASES)
	.refine(hasUniqueNormalizedValues, 'Trigger phrases must be unique.');

export const skillInput = z.object({
	name: z.string().trim().min(1).max(SKILL_NAME_MAX_LENGTH),
	description: z.string().trim().max(SKILL_DESCRIPTION_MAX_LENGTH).default(''),
	instructions: z.string().trim().min(1).max(SKILL_INSTRUCTIONS_MAX_LENGTH),
	projectId: z.string().uuid().nullable().default(null),
	enabledTools: z.array(z.string().trim().min(1).max(100)).max(SKILL_MAX_TOOLS).default([]),
	triggerPhrases: skillTriggerPhrases.default([])
});

export const skillPatchInput = z.object({
	name: z.string().trim().min(1).max(SKILL_NAME_MAX_LENGTH).optional(),
	description: z.string().trim().max(SKILL_DESCRIPTION_MAX_LENGTH).optional(),
	instructions: z.string().trim().min(1).max(SKILL_INSTRUCTIONS_MAX_LENGTH).optional(),
	projectId: z.string().uuid().nullable().optional(),
	enabledTools: z.array(z.string().trim().min(1).max(100)).max(SKILL_MAX_TOOLS).optional(),
	triggerPhrases: skillTriggerPhrases.optional()
});

export const projectInput = z.object({
	name: z.string().trim().min(1).max(120),
	description: z.string().trim().max(2000).default(''),
	instructions: z.string().trim().max(10000).optional()
});
export const conversationInput = z.object({
	projectId: z.string().uuid().nullable().optional(),
	skillId: z.string().uuid().nullable().optional(),
	title: z.string().trim().min(1).max(200).optional(),
	model: z.string().trim().min(1).max(200).default('openai/gpt-4o-mini'),
	enabledTools: z.array(z.string()).max(20).default(['web_search', 'web_fetch'])
});
export const modelPreferenceInput = z.object({
	model: z.string().trim().min(1).max(200),
	thinkingLevel: z.enum(['off', 'minimal', 'low', 'medium', 'high', 'xhigh', 'max'])
});
export const userInstructionsInput = z.object({
	instructions: z.string().trim().max(10000)
});
export const messageInput = z.object({
	content: z.string().trim().min(1).max(100000),
	model: z.string().trim().max(200).optional(),
	enabledTools: z.array(z.string()).max(20).optional()
});
export const attachmentMessageInput = z.object({
	content: z.string().trim().max(100000).default(''),
	model: z.string().trim().max(200).optional()
});
export const retryMessageInput = z.object({
	model: z.string().trim().max(200).optional()
});
export const providerSettingsInput = z.object({
	apiKey: z.string().trim().min(1).max(400).nullable().optional(),
	baseUrl: z
		.url()
		.max(500)
		.refine((value) => value.startsWith('https://') || value.startsWith('http://'))
		.nullable()
		.optional(),
	customConfig: z
		.object({
			name: z.string().trim().min(1).max(80),
			protocol: z.enum([
				'openai-completions',
				'openai-responses',
				'anthropic-messages',
				'google-generative-ai',
				'mistral-conversations',
				'pi-messages',
				'azure-openai-responses'
			]),
			models: z
				.array(
					z.object({
						id: z.string().trim().min(1).max(200),
						name: z.string().trim().min(1).max(200).optional(),
						contextWindow: z.number().int().positive().max(10_000_000).optional(),
						maxTokens: z.number().int().positive().max(1_000_000).optional(),
						reasoning: z.boolean().optional(),
						vision: z.boolean().optional()
					})
				)
				.max(1000)
				.optional()
				.default([])
		})
		.optional()
});

export const webSearchSettingsInput = z.object({
	apiKey: z.string().trim().max(400).nullable().optional(),
	searchUrl: z
		.string()
		.trim()
		.max(500)
		.refine((value) => !value || value.startsWith('https://') || value.startsWith('http://'), {
			message: 'Search URL must begin with http:// or https://'
		})
		.nullable()
		.optional(),
	provider: z.enum(['tavily', 'searxng', 'duckduckgo', 'custom']).optional()
});
