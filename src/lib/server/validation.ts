import { z } from 'zod';
export const projectInput = z.object({ name: z.string().trim().min(1).max(120), description: z.string().trim().max(2000).default(''), instructions: z.string().trim().max(10000).optional() });
export const conversationInput = z.object({ projectId: z.string().uuid().nullable().optional(), title: z.string().trim().min(1).max(200).optional(), model: z.string().trim().min(1).max(200).default('openai/gpt-4o-mini'), enabledTools: z.array(z.string()).max(20).default([]) });
export const messageInput = z.object({ content: z.string().trim().min(1).max(100000), model: z.string().trim().max(200).optional(), enabledTools: z.array(z.string()).max(20).optional() });
