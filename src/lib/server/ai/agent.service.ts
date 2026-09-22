import { Agent } from '@earendil-works/pi-agent-core';
import { and, eq, inArray } from 'drizzle-orm';
import { getDb, schema } from '$lib/server/db/client';
import { modelRegistry } from './model.service';
import { previewToolInput, streamingToolCallBlock } from './tool-stream-preview';
import { describeTurnOutcome, persistedStopReason, type TurnOutcome } from './turn-outcome';
import { createTurnTiming, logTurnTiming } from './turn-timing';
import type { MessageUsage } from '$lib/server/db/schema';
import { cancelBrowserRequests } from '../browser/bridge';
import { cancelBrowserConsents } from '../browser/consent';
import { cancelQuestionRequests } from './question-broker';
import {
	AUTO_CONTINUE_PROMPT,
	MAX_AUTO_CONTINUES,
	WEB_SEARCH_FAILURE_NOTICE,
	getToolFailurePolicy
} from './agent-policy';
import type { AppEvent, AgentEvent, ProjectKnowledgeCitation } from './agent-messages';
import {
	projectKnowledgeCitationsFromResult,
	toAgentMessages,
	webCitationsFromToolResult,
	type WebCitation
} from './agent-messages';
import { createAgentEventQueue } from './agent-event-queue';
import { loadTurnContext } from './turn-context';
import { buildTurnTools } from './turn-tools';
import { buildTurnPrompts } from './turn-prompt';
import {
	isConversationTurnCanceled,
	refreshConversationTurnCanceled,
	registerActiveAgent,
	releaseConversationTurn,
	startTurnLeaseHeartbeat
} from './turn-registry';

// Public API is preserved: consumers import from agent.service as before.
export type { AppEvent } from './agent-messages';
export {
	AGENT_SYSTEM_PROMPT,
	MAX_AUTO_CONTINUES,
	WEB_SEARCH_FAILURE_NOTICE,
	buildSkillSystemPrompt,
	getToolFailurePolicy
} from './agent-policy';
export { groupAttachmentsByMessage, withUntrustedAttachmentHeader } from './agent-policy';
export { toAgentMessages } from './agent-messages';
export {
	beginConversationTurn,
	hasActiveConversationTurn,
	isConversationTurnCanceled,
	releaseConversationTurn,
	stopConversation
} from './turn-registry';

export async function runConversationTurn(
	conversationId: string,
	modelRef: string | undefined,
	prompt: string,
	emit: (event: AppEvent) => void,
	userId: string | undefined,
	currentMessageId: string,
	turnToken = '',
	browserBridgeEnabled = false,
	turnEnabledTools?: string[]
) {
	const db = getDb();
	const timing = createTurnTiming();
	const ctx = await loadTurnContext({
		conversationId,
		modelRef,
		prompt,
		userId,
		currentMessageId,
		turnToken,
		browserBridgeEnabled,
		turnEnabledTools
	});
	const { systemPrompt, turnPrompt } = buildTurnPrompts(ctx);
	const tools = buildTurnTools(ctx, { emit, browserBridgeEnabled, turnEnabledTools });
	const {
		conversation,
		credential,
		configuredMaxTokens,
		thinkingLevel,
		requestModel,
		history,
		toolCallsByMessage,
		historicalAttachments,
		attachmentContext,
		historicalAttachmentChars,
		visionImages
	} = ctx;
	let pendingToolFailureNotice: string | null = null;
	// An uncapped reasoning phase can consume the whole response, so the output cap
	// resolved above is applied to every stream call (see the "no answer" outcome in
	// turn-outcome.ts).
	const registry = modelRegistry();
	const registryStream = registry.streamSimple.bind(registry);
	const streamFn: typeof registryStream = (model, context, options) =>
		registryStream(
			model,
			context,
			configuredMaxTokens ? { ...options, maxTokens: configuredMaxTokens } : options
		);
	const agentMessages = toAgentMessages(history, toolCallsByMessage, historicalAttachments);
	timing.markContextAssembled({
		promptChars: systemPrompt.length + turnPrompt.length,
		historyMessages: agentMessages.length,
		attachmentChars: attachmentContext.length + historicalAttachmentChars
	});
	const agent = new Agent({
		initialState: {
			systemPrompt,
			model: requestModel,
			thinkingLevel,
			messages: agentMessages,
			tools
		},
		streamFn,
		toolExecution: 'sequential',
		afterToolCall: async ({ toolCall, isError }) => {
			const policy = getToolFailurePolicy(toolCall.name, isError);
			if (policy) pendingToolFailureNotice = WEB_SEARCH_FAILURE_NOTICE;
			return policy;
		},
		getApiKey: credential?.apiKey ? () => credential.apiKey as string : undefined
	});
	await registerActiveAgent(conversationId, agent, turnToken);
	// The row's lease keeps other instances from reclaiming a turn that is alive
	// but between prompts (long generations exceed the base lease).
	const stopLeaseHeartbeat = startTurnLeaseHeartbeat(conversationId, turnToken);

	let currentAssistantMessageId: string | null = null;
	let currentAssistantText = '';
	let currentThinkingText = '';
	/** Tool calls requested by the assistant message that is currently open. */
	let currentToolCallCount = 0;
	/** Outcome of the last finalised assistant message, reported once the turn ends. */
	const turnOutcome: { last: (TurnOutcome & { messageId: string }) | null } = { last: null };
	let lastAssistantMessageId: string | null = null;
	let lastTextAssistantMessageId: string | null = null;
	const createdAssistantMessageIds: string[] = [];
	const projectCitations: ProjectKnowledgeCitation[] = [];
	const projectCitationKeys = new Set<string>();
	const MAX_PROJECT_CITATIONS = 32;
	const webCitations: WebCitation[] = [];
	const webCitationKeys = new Set<string>();
	const MAX_WEB_CITATIONS = 32;
	/**
	 * Live input updates for a tool call still being generated. Deltas arrive per
	 * token, so emissions are throttled and deduplicated; the authoritative
	 * `tool.start` frame carries the full input once the call executes.
	 */
	const toolInputEmitAt = new Map<string, number>();
	const lastToolInputPreview = new Map<string, string>();
	const TOOL_INPUT_THROTTLE_MS = 200;

	function emitStreamingToolInput(messageId: string, toolCallId: string, args: unknown) {
		const preview = previewToolInput(args);
		let serialized: string;
		try {
			serialized = JSON.stringify(preview) ?? '';
		} catch {
			serialized = '';
		}
		if (lastToolInputPreview.get(toolCallId) === serialized) return;
		const now = Date.now();
		if (now - (toolInputEmitAt.get(toolCallId) ?? 0) < TOOL_INPUT_THROTTLE_MS) return;
		toolInputEmitAt.set(toolCallId, now);
		lastToolInputPreview.set(toolCallId, serialized);
		emit({ type: 'tool.input', messageId, toolCallId, input: preview });
	}

	function collectProjectKnowledgeCitations(result: unknown) {
		if (!conversation.projectId) return;
		for (const citation of projectKnowledgeCitationsFromResult(result, conversation.projectId)) {
			if (projectCitations.length >= MAX_PROJECT_CITATIONS) return;
			const passage = citation.passage?.trim() ?? '';
			const key = [citation.fileId, citation.chunkId ?? '', citation.page ?? '', passage].join('|');
			if (!projectCitationKeys.has(key)) {
				projectCitationKeys.add(key);
				projectCitations.push({ ...citation, passage });
			}
		}
	}

	function collectWebCitations(result: unknown) {
		for (const citation of webCitationsFromToolResult(result)) {
			if (webCitations.length >= MAX_WEB_CITATIONS) return;
			if (webCitationKeys.has(citation.url)) continue;
			webCitationKeys.add(citation.url);
			webCitations.push(citation);
		}
	}

	async function persistTurnCitations(messageId: string) {
		if (projectCitations.length === 0 && webCitations.length === 0) return [];
		const projectId = conversation.projectId;
		return db.transaction(async (tx) => {
			const persisted: Array<Record<string, unknown>> = [];
			let citationIndex = 0;
			if (projectId) {
				const fileIds = [
					...new Set(
						projectCitations
							.map((citation) => citation.fileId)
							.filter((fileId): fileId is string => Boolean(fileId))
					)
				];
				const liveFiles = fileIds.length
					? await tx
							.select({ id: schema.projectFiles.id })
							.from(schema.projectFiles)
							.where(
								and(
									eq(schema.projectFiles.projectId, projectId),
									inArray(schema.projectFiles.id, fileIds)
								)
							)
							.for('key share')
					: [];
				const liveFileIds = new Set(liveFiles.map((file) => file.id));
				for (const citation of projectCitations) {
					if (!citation.fileId) continue;
					const url = `/api/projects/${encodeURIComponent(projectId)}/files/${encodeURIComponent(citation.fileId)}`;
					const filename = citation.filename?.trim() || citation.title?.trim() || 'Project file';
					const label = citation.page ? `${filename} p.${citation.page}` : filename;
					citationIndex += 1;
					const [source] = await tx
						.insert(schema.sources)
						.values({
							type: 'project_file' as const,
							title: filename,
							url,
							fileId: liveFileIds.has(citation.fileId) ? citation.fileId : null,
							metadata: {
								projectId,
								citationIndex,
								filename,
								page: citation.page ?? null,
								passage: citation.passage ?? '',
								chunkId: citation.chunkId ?? null
							}
						})
						.returning({ id: schema.sources.id });
					if (!source) continue;
					await tx.insert(schema.messageCitations).values({
						messageId,
						sourceId: source.id,
						label
					});
					persisted.push({ ...citation, title: filename, url });
				}
			}
			for (const citation of webCitations) {
				citationIndex += 1;
				const title = citation.title || citation.url;
				const snippet = citation.snippet ?? '';
				const [source] = await tx
					.insert(schema.sources)
					.values({
						type: 'web',
						title,
						url: citation.url,
						metadata: { citationIndex, passage: snippet }
					})
					.returning({ id: schema.sources.id });
				if (!source) continue;
				await tx.insert(schema.messageCitations).values({
					messageId,
					sourceId: source.id,
					label: title
				});
				persisted.push({
					type: 'web',
					title,
					url: citation.url,
					passage: snippet,
					metadata: { citationIndex, passage: snippet }
				});
			}
			return persisted;
		});
	}

	async function ensureAssistantMessage(): Promise<string> {
		if (currentAssistantMessageId) return currentAssistantMessageId;
		const [msg] = await db
			.insert(schema.messages)
			// Marked `streaming` on insert so a turn that never finalizes (dropped
			// connection, restart) is still recognisable as unfinished on read.
			.values({ conversationId, role: 'assistant', content: '', turnState: 'streaming' })
			.returning();
		currentAssistantMessageId = msg.id;
		lastAssistantMessageId = msg.id;
		createdAssistantMessageIds.push(msg.id);
		emit({
			type: 'message.start',
			messageId: msg.id,
			role: 'assistant',
			createdAt: msg.createdAt.toISOString()
		});
		return msg.id;
	}

	async function finalizeCurrentAssistantMessage(
		finish: {
			stopReason?: string;
			rawStopReason?: string;
			usage?: MessageUsage;
		} = {}
	) {
		if (!currentAssistantMessageId) return;
		const msgId = currentAssistantMessageId;
		const text = currentAssistantText;
		const thinking = currentThinkingText;
		const content = thinking.trim()
			? [
					{ type: 'thinking', thinking: thinking.trim() },
					{ type: 'text', text }
				]
			: text;
		const outcome = describeTurnOutcome({
			stopReason: finish.stopReason,
			rawStopReason: finish.rawStopReason,
			text,
			toolCallCount: currentToolCallCount
		});
		const completedAt = new Date();
		await db
			.update(schema.messages)
			.set({
				content,
				stopReason: persistedStopReason(outcome, finish.stopReason),
				usage: finish.usage ?? null,
				turnState: 'complete',
				completedAt
			})
			.where(eq(schema.messages.id, msgId));
		turnOutcome.last = outcome.incomplete ? { ...outcome, messageId: msgId } : null;
		if (text.trim()) lastTextAssistantMessageId = msgId;
		emit({
			type: 'message.end',
			messageId: msgId,
			content,
			// Token counts and the completion time drive the client's context panel.
			usage: finish.usage ?? null,
			completedAt: completedAt.toISOString()
		});
		currentAssistantMessageId = null;
		currentAssistantText = '';
		currentThinkingText = '';
		currentToolCallCount = 0;
	}

	/**
	 * The turn's phase timing lands on its final assistant message and in one log line.
	 * A turn that produced no message at all (early failure) is still logged.
	 */
	async function recordTurnTiming() {
		const snapshot = timing.snapshot();
		logTurnTiming(snapshot);
		if (!lastAssistantMessageId) return;
		await db
			.update(schema.messages)
			.set({ timing: snapshot })
			.where(eq(schema.messages.id, lastAssistantMessageId))
			.catch(() => {});
	}

	let subscriberError: unknown;

	const handleAgentEvent = async (event: unknown) => {
		const e = event as AgentEvent;
		if (e.type === 'agent_start') emit({ type: 'turn.start' });
		if (e.type === 'message_start') {
			const role = (e.message as { role?: string })?.role;
			if (role === 'assistant') {
				await ensureAssistantMessage();
			}
		}
		if (e.type === 'message_update') {
			const msgId = await ensureAssistantMessage();
			const assistantEvent = e.assistantMessageEvent;
			if (assistantEvent?.type === 'thinking_delta') {
				const delta = assistantEvent.delta ?? '';
				timing.markFirstToken();
				currentThinkingText += delta;
				emit({ type: 'thinking.delta', messageId: msgId, delta });
			} else if (assistantEvent?.type === 'text_delta') {
				const delta = assistantEvent.delta ?? '';
				timing.markFirstToken();
				if (delta) pendingToolFailureNotice = null;
				currentAssistantText += delta;
				emit({ type: 'message.delta', messageId: msgId, delta });
			} else if (assistantEvent?.type === 'toolcall_start') {
				// The model has only started writing the call; execute() has not run yet.
				// Show the card now so a slow scene generation is not mistaken for a hang.
				const block = streamingToolCallBlock(assistantEvent.partial, assistantEvent.contentIndex);
				if (block) {
					emit({
						type: 'tool.start',
						messageId: msgId,
						toolCallId: block.id,
						tool: block.name || 'tool',
						label: block.name || 'tool',
						input: previewToolInput(block.arguments),
						preparing: true
					});
				}
			} else if (assistantEvent?.type === 'toolcall_delta') {
				const block = streamingToolCallBlock(assistantEvent.partial, assistantEvent.contentIndex);
				if (block) emitStreamingToolInput(msgId, block.id, block.arguments);
			}
		}
		if (e.type === 'message_end') {
			const message = e.message as
				| { role?: string; stopReason?: string; rawStopReason?: string; usage?: MessageUsage }
				| undefined;
			if (message?.role === 'assistant') {
				await finalizeCurrentAssistantMessage({
					stopReason: message.stopReason,
					rawStopReason: message.rawStopReason,
					usage: message.usage
				});
			}
		}
		if (e.type === 'tool_execution_start') {
			timing.beginTool();
			currentToolCallCount += 1;
			const parentMessageId = lastAssistantMessageId ?? (await ensureAssistantMessage());
			await db.insert(schema.toolCalls).values({
				messageId: parentMessageId,
				toolCallId: e.toolCallId,
				toolName: e.toolName,
				input: e.args,
				status: 'running',
				startedAt: new Date()
			});
			emit({
				type: 'tool.start',
				messageId: parentMessageId,
				toolCallId: e.toolCallId,
				tool: e.toolName,
				label: e.toolName,
				input: e.args,
				preparing: false
			});
		}
		if (e.type === 'tool_execution_update') {
			emit({
				type: 'tool.update',
				messageId: lastAssistantMessageId,
				toolCallId: e.toolCallId,
				update: e.partialResult
			});
		}
		if (e.type === 'tool_execution_end') {
			timing.endTool();
			if (e.toolName === 'project_knowledge_search' && !e.isError)
				collectProjectKnowledgeCitations(e.result);
			if (!e.isError) collectWebCitations(e.result);
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
				messageId: lastAssistantMessageId,
				toolCallId: e.toolCallId,
				toolName: e.toolName,
				status: e.isError ? 'failed' : 'completed',
				result: e.result
			});
		}
		if (e.type === 'agent_end') {
			if (pendingToolFailureNotice) {
				const msgId = await ensureAssistantMessage();
				currentAssistantText = pendingToolFailureNotice;
				emit({ type: 'message.delta', messageId: msgId, delta: pendingToolFailureNotice });
				await finalizeCurrentAssistantMessage();
				pendingToolFailureNotice = null;
			}
			emit({ type: 'turn.end' });
		}
	};
	const agentEvents = createAgentEventQueue(agent, handleAgentEvent, (error) => {
		subscriberError ??= error;
	});
	try {
		if (await refreshConversationTurnCanceled(conversationId, turnToken)) return null;
		// Reasoning shares the output budget with the answer, so a turn can stop on
		// `length` with the answer missing or half-written. Nudge the model to keep
		// going on its own rather than making the user press Continue, but bound the
		// retries so a model that never finishes cannot loop forever.
		let autoContinues = 0;
		for (;;) {
			timing.beginPrompt();
			if (autoContinues === 0) await agent.prompt(turnPrompt, visionImages);
			else await agent.prompt(AUTO_CONTINUE_PROMPT);
			await agentEvents.drain();
			timing.endPrompt();
			if (subscriberError) throw subscriberError;
			await finalizeCurrentAssistantMessage();
			if (turnOutcome.last?.kind !== 'truncated') break;
			if (autoContinues >= MAX_AUTO_CONTINUES) break;
			if (await refreshConversationTurnCanceled(conversationId, turnToken)) break;
			autoContinues += 1;
			timing.markAutoContinue();
		}
		timing.beginPersist();
		// Still unfinished after the retries, or a clean stop with reasoning only:
		// tell the client instead of leaving a reply that looks like it is thinking.
		if (turnOutcome.last) {
			emit({
				type: 'turn.incomplete',
				messageId: turnOutcome.last.messageId,
				kind: turnOutcome.last.kind,
				notice: turnOutcome.last.notice
			});
		}
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
		if (lastTextAssistantMessageId && (projectCitations.length > 0 || webCitations.length > 0)) {
			const citations = await persistTurnCitations(lastTextAssistantMessageId);
			if (citations.length)
				emit({
					type: 'message.citations',
					messageId: lastTextAssistantMessageId,
					citations
				});
		}

		for (const msgId of createdAssistantMessageIds) {
			const [msg] = await db.select().from(schema.messages).where(eq(schema.messages.id, msgId));
			if (msg) {
				const hasContent =
					typeof msg.content === 'string'
						? msg.content.trim().length > 0
						: Array.isArray(msg.content)
							? msg.content.length > 0
							: Boolean(msg.content);
				if (!hasContent) {
					const toolCallsForMsg = await db
						.select()
						.from(schema.toolCalls)
						.where(eq(schema.toolCalls.messageId, msgId));
					if (toolCallsForMsg.length === 0) {
						await db
							.delete(schema.messages)
							.where(eq(schema.messages.id, msgId))
							.catch(() => {});
					}
				}
			}
		}

		await db
			.update(schema.conversations)
			.set({ updatedAt: new Date() })
			.where(eq(schema.conversations.id, conversationId));
		if (conversation.projectId)
			await db
				.update(schema.projects)
				.set({ updatedAt: new Date() })
				.where(eq(schema.projects.id, conversation.projectId));
		timing.endPersist();
		await recordTurnTiming();
		return lastAssistantMessageId;
	} catch (error) {
		// Subscriber promises are handled in order, but the loop can still stop
		// between events. Drain queued persistence work before cleanup so a late
		// event cannot write after a failed turn.
		await agentEvents.drain().catch(() => {});
		// A turn the user stopped on purpose ends quietly; anything else that dies here
		// (dropped stream, provider failure, restart) leaves a reply that is unfinished
		// and has to be recognisable as such on the next read.
		await refreshConversationTurnCanceled(conversationId, turnToken);
		const stoppedByUser = isConversationTurnCanceled(turnToken);
		for (const msgId of createdAssistantMessageIds) {
			const [msg] = await db
				.select()
				.from(schema.messages)
				.where(eq(schema.messages.id, msgId))
				.catch(() => []);
			if (!msg) continue;
			const hasContent =
				typeof msg.content === 'string'
					? msg.content.trim().length > 0
					: Array.isArray(msg.content)
						? msg.content.length > 0
						: Boolean(msg.content);
			if (!hasContent) {
				await db
					.delete(schema.messages)
					.where(eq(schema.messages.id, msgId))
					.catch(() => {});
				continue;
			}
			if (!stoppedByUser) {
				await db
					.update(schema.messages)
					.set({ turnState: 'interrupted', completedAt: new Date() })
					.where(eq(schema.messages.id, msgId))
					.catch(() => {});
			}
		}
		timing.endPersist();
		await recordTurnTiming();
		throw error;
	} finally {
		stopLeaseHeartbeat();
		cancelBrowserRequests(conversationId, turnToken);
		await cancelBrowserConsents(conversationId, turnToken);
		await cancelQuestionRequests(conversationId, turnToken);
		await releaseConversationTurn(conversationId, turnToken);
	}
}
