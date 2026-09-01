import { Agent } from '@earendil-works/pi-agent-core';
import type { AgentMessage } from '@earendil-works/pi-agent-core';
import { asc, eq } from 'drizzle-orm';
import { getDb, schema } from '$lib/server/db/client';
import { modelRegistry, resolveModel, splitModelRef } from './model.service';
import { getProviderCredential, isProviderId } from './provider-settings.service';
import { createProjectKnowledgeTool } from './tools/project-knowledge.tool';

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

function encodeContent(content: unknown) {
	return typeof content === 'string' ? content : JSON.stringify(content);
}
function toAgentMessages(
	rows: Array<{ role: string; content: unknown; createdAt: Date }>
): AgentMessage[] {
	return rows
		.filter((row) => row.role === 'user' || row.role === 'assistant')
		.map((row) => ({
			role: row.role as 'user' | 'assistant',
			content: encodeContent(row.content),
			timestamp: row.createdAt.getTime()
		})) as AgentMessage[];
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
	const requestModel = credential?.baseUrl ? { ...model, baseUrl: credential.baseUrl } : model;
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
	const tools = conversation.projectId ? [createProjectKnowledgeTool(conversation.projectId)] : [];
	const agent = new Agent({
		initialState: {
			systemPrompt:
				'You are Sol, a concise and helpful AI agent. Answer clearly and use Markdown when useful.',
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
		if (e.type === 'message_update' && e.assistantMessageEvent?.type === 'text_delta') {
			const delta = e.assistantMessageEvent.delta;
			assistantText += delta;
			emit({ type: 'message.delta', messageId: `${conversationId}:assistant`, delta });
		}
		if (e.type === 'message_end' && e.message?.role === 'assistant')
			emit({ type: 'message.end', messageId: `${conversationId}:assistant` });
		if (e.type === 'agent_end') emit({ type: 'turn.end' });
	});
	try {
		await agent.prompt(prompt);
		await db
			.update(schema.messages)
			.set({ content: assistantText })
			.where(eq(schema.messages.id, assistantMessage.id));
		await db
			.update(schema.conversations)
			.set({ updatedAt: new Date() })
			.where(eq(schema.conversations.id, conversationId));
		return assistantMessage;
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
