import { z } from 'zod';
export const projectInput = z.object({
	name: z.string().trim().min(1).max(120),
	description: z.string().trim().max(2000).default(''),
	instructions: z.string().trim().max(10000).optional()
});
export const conversationInput = z.object({
	projectId: z.string().uuid().nullable().optional(),
	title: z.string().trim().min(1).max(200).optional(),
	model: z.string().trim().min(1).max(200).default('openai/gpt-4o-mini'),
	enabledTools: z.array(z.string()).max(20).default(['web_search'])
});
export const modelPreferenceInput = z.object({
	model: z.string().trim().min(1).max(200),
	thinkingLevel: z.enum(['off', 'minimal', 'low', 'medium', 'high', 'xhigh', 'max'])
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
