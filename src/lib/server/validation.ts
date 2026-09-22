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

/** A transcript mutation must name the revision the client rendered. */
export const conversationHistoryRevision = z.coerce.number().int().positive();

export const editMessageInput = z.object({
	messageId: z.string().trim().min(1).max(200),
	content: z.string().trim().min(1).max(100000),
	historyRevision: conversationHistoryRevision,
	model: z.string().trim().max(200).optional()
});

export const branchConversationInput = z.object({
	messageId: z.string().trim().min(1).max(200).nullable().optional(),
	throughMessageId: z.string().trim().min(1).max(200).nullable().optional(),
	historyRevision: conversationHistoryRevision,
	title: z.string().trim().min(1).max(200).optional()
});
export const providerSettingsInput = z.object({
	apiKey: z.string().trim().min(1).max(400).nullable().optional(),
	baseUrl: z
		.url()
		.max(500)
		.refine((value) => {
			try {
				return /^https?:$/.test(new URL(value).protocol);
			} catch {
				return false;
			}
		})
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
		.refine(
			(value) => {
				if (!value) return true;
				try {
					return /^https?:$/.test(new URL(value).protocol);
				} catch {
					return false;
				}
			},
			{
				message: 'Search URL must begin with http:// or https://'
			}
		)
		.nullable()
		.optional(),
	provider: z.enum(['tavily', 'searxng', 'duckduckgo', 'custom']).optional()
});

export const styleGuidelineInput = z.object({
	tokens: z.record(z.string(), z.any()).default({}),
	rules: z.array(z.string().trim().min(1).max(2000)).max(50).default([]),
	avoidances: z.array(z.string().trim().min(1).max(2000)).max(50).default([]),
	direction: z.string().trim().max(5000).default('')
});

export const canvasInput = z.object({
	title: z.string().trim().min(1).max(120),
	description: z.string().trim().max(2000).default(''),
	projectId: z.string().uuid().nullable().optional(),
	conversationId: z.string().uuid().nullable().optional(),
	styleGuideline: styleGuidelineInput.optional()
});

export const canvasPatchInput = z.object({
	title: z.string().trim().min(1).max(120).optional(),
	description: z.string().trim().max(2000).optional(),
	activeSceneId: z.string().uuid().nullable().optional(),
	styleGuideline: styleGuidelineInput.optional()
});

export const canvasSceneInput = z.object({
	name: z.string().trim().min(1).max(120),
	description: z.string().trim().max(2000).optional(),
	viewport: z.enum(['mobile', 'tablet', 'desktop']).default('desktop'),
	order: z.number().int().min(0).optional(),
	positionX: z.number().finite().optional(),
	positionY: z.number().finite().optional(),
	html: z.string().default(''),
	css: z.string().default(''),
	js: z.string().default('')
});

// PATCH must not apply the creation defaults to fields the caller did not send.
export const canvasScenePatchInput = canvasSceneInput.partial().extend({
	viewport: z.enum(['mobile', 'tablet', 'desktop']).optional(),
	html: z.string().optional(),
	css: z.string().optional(),
	js: z.string().optional()
});

export const canvasConnectionInput = z
	.object({
		sourceSceneId: z.string().uuid(),
		targetSceneId: z.string().uuid()
	})
	.refine((value) => value.sourceSceneId !== value.targetSceneId, {
		message: 'A scene cannot connect to itself.'
	});
