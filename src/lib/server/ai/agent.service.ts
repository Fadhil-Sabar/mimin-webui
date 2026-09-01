import { Agent } from '@earendil-works/pi-agent-core';
import type { AgentMessage } from '@earendil-works/pi-agent-core';
import { asc, eq } from 'drizzle-orm';
import { getDb, schema } from '$lib/server/db/client';
import { modelRegistry, resolveModel, splitModelRef } from './model.service';
import { getProviderCredential, isProviderId } from './provider-settings.service';
import { createProjectKnowledgeTool } from './tools/project-knowledge.tool';
import { createWebSearchTool } from './tools/web-search.tool';

export type AppEvent = { type: string; [key: string]: unknown };
const activeAgents = new Map<string, Agent>();

type AgentEvent = {
	type?: string;
	toolCallId: string;
	toolName: string;
	args: unknown;
	partialResult: unknown;
	result: unknown;
	isError: boolean;
	assistantMessageEvent?: { type?: string; delta?: string };
	message?: { role?: string };
};

const EMPTY_USAGE = {
	input: 0,
	output: 0,
	cacheRead: 0,
	cacheWrite: 0,
	totalTokens: 0,
	cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, total: 0 }
};

function encodeContent(content: unknown) {
	return typeof content === 'string' ? content : JSON.stringify(content);
}
function toAgentMessages(
	rows: Array<{ role: string; content: unknown; createdAt: Date }>
): AgentMessage[] {
	return rows
		.filter((row) => row.role === 'user' || row.role === 'assistant')
		.map((row) => {
			if (row.role === 'user') {
				const text = typeof row.content === 'string' ? row.content : JSON.stringify(row.content);
				return {
					role: 'user' as const,
					content: [{ type: 'text' as const, text }],
					timestamp: row.createdAt.getTime()
				};
			}
			let contentBlocks: Array<
				{ type: 'thinking'; thinking: string } | { type: 'text'; text: string }
			> = [];
			if (Array.isArray(row.content)) {
				contentBlocks = row.content
					.map((part) => {
						if (part && typeof part === 'object' && 'type' in part) {
							if (part.type === 'thinking' && typeof part.thinking === 'string') {
								return { type: 'thinking' as const, thinking: part.thinking };
							}
							if (part.type === 'text' && typeof part.text === 'string') {
								return { type: 'text' as const, text: part.text };
							}
						}
						return null;
					})
					.filter(Boolean) as Array<
					{ type: 'thinking'; thinking: string } | { type: 'text'; text: string }
				>;
			}
			if (contentBlocks.length === 0) {
				const text = typeof row.content === 'string' ? row.content : JSON.stringify(row.content);
				contentBlocks = [{ type: 'text' as const, text }];
			}
			return {
				role: 'assistant' as const,
				content: contentBlocks as any,
				api: 'unknown' as any,
				provider: 'unknown' as any,
				model: 'unknown',
				usage: EMPTY_USAGE,
				stopReason: 'stop' as const,
				timestamp: row.createdAt.getTime()
			};
		}) as AgentMessage[];
}

export async function runConversationTurn(
	conversationId: string,
	modelRef: string | undefined,
	prompt: string,
	emit: (event: AppEvent) => void,
	userId?: string
) {
	const db = getDb();
	const [conversation] = await db
		.select()
		.from(schema.conversations)
		.where(eq(schema.conversations.id, conversationId));
	if (!conversation) throw new Error('CONVERSATION_NOT_FOUND');
	const selectedModelRef = modelRef ?? conversation.model;
	const selectedModel = splitModelRef(selectedModelRef);
	if (!selectedModel) throw new Error('MODEL_NOT_AVAILABLE');
	const { provider, id: modelId } = selectedModel;
	const model = resolveModel(provider, modelId);
	if (!model) throw new Error('MODEL_NOT_AVAILABLE');
	let credential: { apiKey: string | null; baseUrl: string | null; fromUser: boolean } | undefined;
	if (isProviderId(provider)) {
		credential = await getProviderCredential(userId ?? conversation.userId ?? '', provider);
		if (!credential.apiKey) throw new Error('PROVIDER_NOT_CONFIGURED');
	}
	// A user-saved base URL points the provider adapters at a custom endpoint.
	const isCustomOpenAi =
		provider === 'openai' &&
		Boolean(
			credential?.baseUrl && !credential.baseUrl.replace(/\/+$/, '').endsWith('api.openai.com/v1')
		);
	const requestModel = {
		...model,
		...(credential?.baseUrl ? { baseUrl: credential.baseUrl } : {}),
		...(isCustomOpenAi ? { api: 'openai-completions' as const } : {})
	};
	const history = (
		await db
			.select({
				role: schema.messages.role,
				content: schema.messages.content,
				createdAt: schema.messages.createdAt
			})
			.from(schema.messages)
			.where(eq(schema.messages.conversationId, conversationId))
			.orderBy(asc(schema.messages.createdAt))
	).slice(0, -1);
	const tools = [
		...(conversation.enabledTools.includes('web_search') ? [createWebSearchTool()] : []),
		...(conversation.projectId && conversation.enabledTools.includes('project_knowledge_search')
			? [createProjectKnowledgeTool(conversation.projectId)]
			: [])
	];
	const agent = new Agent({
		initialState: {
			systemPrompt:
				'You are Sol, a concise and helpful AI agent. Answer clearly and use Markdown when useful. For current, uncertain, niche, or verifiable information, use web_search before answering. Prefer primary and recent sources, compare sources when practical, and cite source URLs in the answer. Never claim you searched if the tool failed or is unavailable.',
			model: requestModel,
			messages: toAgentMessages(history),
			tools
		},
		streamFn: modelRegistry().streamSimple.bind(modelRegistry()),
		toolExecution: 'sequential',
		getApiKey: credential?.apiKey ? () => credential.apiKey as string : undefined
	});
	const [assistantMessage] = await db
		.insert(schema.messages)
		.values({ conversationId, role: 'assistant', content: '' })
		.returning();
	activeAgents.set(conversationId, agent);
	let assistantText = '';
	let thinkingText = '';
	agent.subscribe(async (event) => {
		const e = event as AgentEvent;
		if (e.type === 'agent_start') emit({ type: 'turn.start' });
		if (e.type === 'tool_execution_start') {
			await db.insert(schema.toolCalls).values({
				messageId: assistantMessage.id,
				toolCallId: e.toolCallId,
				toolName: e.toolName,
				input: e.args,
				status: 'running',
				startedAt: new Date()
			});
			emit({ type: 'tool.start', toolCallId: e.toolCallId, tool: e.toolName, label: e.toolName });
		}
		if (e.type === 'tool_execution_update')
			emit({ type: 'tool.update', toolCallId: e.toolCallId, update: e.partialResult });
		if (e.type === 'tool_execution_end') {
			await db
				.update(schema.toolCalls)
				.set({
					output: e.result,
					status: e.isError ? 'failed' : 'completed',
					completedAt: new Date()
				})
				.where(eq(schema.toolCalls.toolCallId, e.toolCallId));
			emit({
				type: 'tool.end',
				toolCallId: e.toolCallId,
				status: e.isError ? 'failed' : 'completed',
				result: e.result
			});
		}
		if (e.type === 'message_update') {
			if (e.assistantMessageEvent?.type === 'thinking_delta') {
				const delta = e.assistantMessageEvent.delta;
				thinkingText += delta;
				emit({ type: 'thinking.delta', messageId: `${conversationId}:assistant`, delta });
			} else if (e.assistantMessageEvent?.type === 'text_delta') {
				const delta = e.assistantMessageEvent.delta;
				assistantText += delta;
				emit({ type: 'message.delta', messageId: `${conversationId}:assistant`, delta });
			}
		}
		if (e.type === 'message_end' && e.message?.role === 'assistant')
			emit({ type: 'message.end', messageId: `${conversationId}:assistant` });
		if (e.type === 'agent_end') emit({ type: 'turn.end' });
	});
	try {
		await agent.prompt(prompt);
		if (agent.state.errorMessage) {
			throw new Error(agent.state.errorMessage);
		}
		const lastMsg = agent.state.messages[agent.state.messages.length - 1];
		if (
			lastMsg &&
			lastMsg.role === 'assistant' &&
			(lastMsg as { stopReason?: string }).stopReason === 'error'
		) {
			throw new Error(
				(lastMsg as { errorMessage?: string }).errorMessage || 'Agent execution failed'
			);
		}
		const content = thinkingText.trim()
			? [
					{ type: 'thinking', thinking: thinkingText },
					{ type: 'text', text: assistantText }
				]
			: assistantText;
		await db
			.update(schema.messages)
			.set({ content })
			.where(eq(schema.messages.id, assistantMessage.id));
		await db
			.update(schema.conversations)
			.set({ updatedAt: new Date() })
			.where(eq(schema.conversations.id, conversationId));
		return assistantMessage;
	} catch (error) {
		if (!assistantText && !thinkingText) {
			await db
				.delete(schema.messages)
				.where(eq(schema.messages.id, assistantMessage.id))
				.catch(() => {});
		}
		throw error;
	} finally {
		activeAgents.delete(conversationId);
	}
}

export function stopConversation(conversationId: string) {
	const agent = activeAgents.get(conversationId);
	if (!agent) return false;
	agent.abort();
	return true;
}
