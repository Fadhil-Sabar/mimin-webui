import {
	extractSseErrorMessage,
	stopConversation,
	streamMessage,
	streamRetry,
	type SseEvent
} from '$lib/client/api';
import {
	applyConsentDecision,
	attachOrBufferConsent,
	consentFromEvent,
	flushConsentBuffer,
	type ConsentBuffer,
	type ConsentDecision
} from '$lib/client/consent-state';
import { createStreamingDeltaBatcher, type StreamingDelta } from '$lib/client/streaming-batcher';
import { setLastUsedModel } from '$lib/client/conversations.svelte';
import type { SkillSummary } from '$lib/skills';
import { contentText, nowIso, thinkingText } from './chat-format';
import type {
	Conversation,
	ConversationMessage,
	MessageAttachment,
	MessageCitation,
	MessageUsage,
	PendingSubmission,
	ToolCall
} from './chat-types';

export type ChatStreamDeps = {
	/** Show a transient toast. */
	notify: (value: string) => void;
	getActiveId: () => string;
	getActiveConversation: () => Conversation | null;
	getDraft: () => string;
	setDraft: (value: string) => void;
	getAttachments: () => File[];
	setAttachments: (files: File[]) => void;
	getConversationLoadToken: () => number;
	bumpConversationLoadToken: () => void;
	/** True while a conversation is loading or a preference write is in flight. */
	isBlocked: () => boolean;
	setUserAtBottom: (value: boolean) => void;
	loadConversations: () => Promise<void>;
	loadConversation: (
		id: string,
		replaceUrl?: boolean,
		preserveLiveState?: boolean
	) => Promise<unknown>;
	loadSkills: () => Promise<void>;
	onCanvasEvent?: (event: SseEvent) => void;
};

/**
 * Owns the transcript of the active conversation and the SSE state machine that
 * fills it. Exactly one instance exists per page load; it is created during
 * component initialisation so its state and effects belong to that page.
 */
export function createChatStream(deps: ChatStreamDeps) {
	let running = $state(false);
	let liveError = $state('');
	/** Set when a turn finished without an answer, e.g. the output budget ran out. */
	let turnNotice = $state('');
	let messages = $state<ConversationMessage[]>([]);
	/**
	 * Consent prompts that arrived before the tool call they belong to. The two
	 * frames are sent by different server paths and can invert, so a prompt waits
	 * here until its tool call exists rather than being dropped.
	 */
	let consentBuffer: ConsentBuffer = {};
	let lastFailedSubmission = $state<PendingSubmission | null>(null);
	let abortController: AbortController | undefined;

	const canRetry = $derived.by(() => {
		if (running) return false;
		const last = messages.length > 0 ? messages[messages.length - 1] : null;
		return Boolean(
			liveError ||
			// A turn that never produced an answer, or one that died mid-flight.
			last?.role === 'user' ||
			last?.turnState === 'interrupted' ||
			(lastFailedSubmission && lastFailedSubmission.conversationId === deps.getActiveId())
		);
	});

	/** Local ids belong to the optimistic user message and its attachment chips. */
	function isLocalMessageId(id: string) {
		return id.includes(':user:') || id.includes(':attachment:');
	}

	function compareMessages(a: ConversationMessage, b: ConversationMessage) {
		if (a.createdAt === b.createdAt) return a.id < b.id ? -1 : a.id > b.id ? 1 : 0;
		return a.createdAt < b.createdAt ? -1 : 1;
	}

	/**
	 * Fold a freshly fetched page into the transcript.
	 *
	 * A page holds only the newest messages, so anything already loaded that the
	 * server did not resend is kept: without this the reload that follows every turn
	 * would throw away the earlier history the reader had paged in. Optimistic local
	 * rows are dropped because the server always resends their authoritative copies.
	 */
	function mergeMessages(next: ConversationMessage[]) {
		const resent = next.map((message) => message.id);
		const kept = messages.filter(
			(message) => !isLocalMessageId(message.id) && !resent.includes(message.id)
		);
		messages = [...kept, ...next].sort(compareMessages);
	}

	function applyStreamingDeltas(deltas: StreamingDelta[]) {
		for (const { id, thinking, text } of deltas) {
			let found = false;
			messages = messages.map((msg) => {
				if (msg.id !== id) return msg;
				found = true;
				const currentThinking = thinkingText(msg.content) + thinking;
				const currentText = contentText(msg.content) + text;
				return {
					...msg,
					content: currentThinking
						? [
								{ type: 'thinking', thinking: currentThinking },
								...(currentText ? [{ type: 'text', text: currentText }] : [])
							]
						: currentText,
					isStreaming: true
				};
			});
			if (!found) {
				messages = [
					...messages,
					{
						id,
						role: 'assistant',
						content: thinking
							? [{ type: 'thinking', thinking }, ...(text ? [{ type: 'text', text }] : [])]
							: text,
						createdAt: nowIso(),
						toolCalls: [],
						isStreaming: true
					}
				];
			}
		}
	}

	const streamingDeltas = createStreamingDeltaBatcher(applyStreamingDeltas);

	function handleStreamEvent(event: SseEvent) {
		if (event.type === 'message.start') {
			if (event.role === 'user') {
				const index = messages.findLastIndex((item) => item.role === 'user');
				if (index >= 0)
					messages = messages.map((item, i) =>
						i === index
							? {
									...item,
									id: String(event.messageId),
									skill: (event.skill as SkillSummary | null) ?? null,
									// The authoritative rows carry the URLs the bubbles render from,
									// so thumbnails appear as soon as the turn starts rather than
									// after the post-turn reload.
									...(Array.isArray(event.attachments)
										? { attachments: event.attachments as MessageAttachment[] }
										: {})
								}
							: item
					);
			} else if (event.role === 'assistant') {
				const msgId = String(event.messageId);
				const existing = messages.find((m) => m.id === msgId);
				if (!existing) {
					messages = [
						...messages,
						{
							id: msgId,
							role: 'assistant',
							content: '',
							createdAt: typeof event.createdAt === 'string' ? event.createdAt : nowIso(),
							toolCalls: [],
							isStreaming: true
						}
					];
				}
			}
		} else if (event.type === 'thinking.delta') {
			const msgId = String(event.messageId);
			const delta = String(event.delta ?? '');
			streamingDeltas.push(msgId, 'thinking', delta);
		} else if (event.type === 'message.delta') {
			const msgId = String(event.messageId);
			const delta = String(event.delta ?? '');
			streamingDeltas.push(msgId, 'text', delta);
		} else if (event.type === 'tool.start') {
			const msgId = event.messageId ? String(event.messageId) : undefined;
			const toolCallId = String(event.toolCallId);
			const toolName = String(event.tool ?? event.label ?? 'tool');
			const input = event.input;
			const newCall: ToolCall = {
				toolCallId,
				toolName,
				input,
				status: 'running',
				preparing: event.preparing === true,
				startedAt: nowIso()
			};
			let targetMsgId = msgId;
			if (!targetMsgId) {
				const lastAssistant = [...messages].reverse().find((m) => m.role === 'assistant');
				targetMsgId = lastAssistant?.id;
			}
			if (targetMsgId) {
				messages = messages.map((msg) => {
					if (msg.id !== targetMsgId) return msg;
					const currentCalls = msg.toolCalls ? [...msg.toolCalls] : [];
					const idx = currentCalls.findIndex((c) => c.toolCallId === toolCallId);
					if (idx >= 0) {
						currentCalls[idx] = { ...currentCalls[idx], ...newCall };
					} else {
						currentCalls.push(newCall);
					}
					return { ...msg, toolCalls: currentCalls };
				});
			}
			if (consentBuffer[toolCallId]) {
				const flushed = flushConsentBuffer(messages, consentBuffer);
				messages = flushed.messages;
				consentBuffer = flushed.buffer;
			}
		} else if (event.type === 'tool.update') {
			const toolCallId = String(event.toolCallId);
			messages = messages.map((msg) => {
				if (!msg.toolCalls?.some((c) => c.toolCallId === toolCallId)) return msg;
				return {
					...msg,
					toolCalls: msg.toolCalls.map((c) =>
						c.toolCallId === toolCallId ? { ...c, output: event.update } : c
					)
				};
			});
		} else if (event.type === 'tool.input') {
			// The model is still writing this call's arguments; keep the card's label
			// and details in sync as they parse.
			const toolCallId = String(event.toolCallId);
			messages = messages.map((msg) => {
				if (!msg.toolCalls?.some((c) => c.toolCallId === toolCallId)) return msg;
				return {
					...msg,
					toolCalls: msg.toolCalls.map((c) =>
						c.toolCallId === toolCallId ? { ...c, input: event.input } : c
					)
				};
			});
		} else if (event.type === 'browser.consent.request') {
			const consent = consentFromEvent(event);
			if (consent) {
				// The prompt is emitted from inside the tool and used to be able to
				// beat the tool.start frame, so a prompt with no tool call yet is
				// held until that call arrives instead of being dropped.
				const next = attachOrBufferConsent(messages, consentBuffer, consent);
				messages = next.messages;
				consentBuffer = next.buffer;
			}
		} else if (event.type === 'tool.end') {
			const toolCallId = String(event.toolCallId);
			const status = event.status === 'failed' ? 'failed' : 'completed';
			const result = event.result;
			let isCreateSkill = event.toolName === 'create_skill' || event.tool === 'create_skill';
			messages = messages.map((msg) => {
				if (!msg.toolCalls?.some((c) => c.toolCallId === toolCallId)) return msg;
				return {
					...msg,
					toolCalls: msg.toolCalls.map((c) => {
						if (c.toolCallId === toolCallId) {
							if (c.toolName === 'create_skill') isCreateSkill = true;
							return {
								...c,
								status,
								preparing: false,
								output: result,
								completedAt: nowIso()
							};
						}
						return c;
					})
				};
			});
			if (isCreateSkill && status === 'completed') {
				void deps.loadSkills();
			}
		} else if (event.type === 'retry.replaced') {
			const replaced = new Set(Array.isArray(event.messageIds) ? event.messageIds.map(String) : []);
			messages = messages.filter((message) => !replaced.has(message.id));
		} else if (event.type === 'message.end') {
			streamingDeltas.flush();
			lastFailedSubmission = null;
			const msgId = String(event.messageId);
			const usage = (event.usage as MessageUsage | null | undefined) ?? null;
			const completedAt = typeof event.completedAt === 'string' ? event.completedAt : nowIso();
			messages = messages.map((msg) =>
				msg.id === msgId
					? {
							...msg,
							isStreaming: false,
							turnState: 'complete',
							usage,
							completedAt,
							content: event.content !== undefined ? event.content : msg.content,
							...(Array.isArray(event.citations)
								? { citations: event.citations as MessageCitation[] }
								: {})
						}
					: msg
			);
		} else if (event.type === 'message.citations') {
			const msgId = String(event.messageId);
			if (Array.isArray(event.citations))
				messages = messages.map((msg) =>
					msg.id === msgId ? { ...msg, citations: event.citations as MessageCitation[] } : msg
				);
		} else if (event.type === 'turn.incomplete') {
			streamingDeltas.flush();
			turnNotice = typeof event.notice === 'string' ? event.notice : '';
			const msgId = String(event.messageId);
			messages = messages.map((msg) =>
				msg.id === msgId
					? { ...msg, stopReason: event.kind === 'truncated' ? 'length' : 'no-answer' }
					: msg
			);
		} else if (event.type.startsWith('canvas.')) {
			deps.onCanvasEvent?.(event);
		} else if (event.type === 'error') {
			streamingDeltas.flush();
			liveError = extractSseErrorMessage(event.error);
			// Whatever the turn managed to write is unfinished, and the server records it
			// that way too; presenting it as a live reply would be wrong.
			const unfinished = messages.findLastIndex(
				(message) => message.role === 'assistant' && message.isStreaming
			);
			messages = messages.map((message, index) => ({
				...message,
				isStreaming: false,
				...(index === unfinished ? { turnState: 'interrupted' as const } : {})
			}));
			consentBuffer = {};
		}
	}

	async function send() {
		if (running || deps.isBlocked()) return;
		const content = deps.getDraft().trim();
		const activeId = deps.getActiveId();
		if ((!content && deps.getAttachments().length === 0) || !activeId) {
			deps.notify(!activeId ? 'No active conversation' : 'Type a message or attach a file first');
			return;
		}
		const activeConversation = deps.getActiveConversation();
		if (activeConversation?.model) {
			setLastUsedModel(activeConversation.model);
		}
		const filesToSend = deps.getAttachments();
		lastFailedSubmission = {
			conversationId: activeId,
			content,
			files: filesToSend
		};
		deps.bumpConversationLoadToken();
		running = true;
		liveError = '';
		turnNotice = '';
		deps.setDraft('');
		deps.setAttachments([]);
		deps.setUserAtBottom(true);
		const attachmentTimestamp = Date.now();
		messages = [
			...messages,
			{
				id: `${activeId}:user:${Date.now()}`,
				role: 'user',
				skill: activeConversation?.activeSkill ?? null,
				content,
				attachments: filesToSend.map((file, index) => ({
					id: `${activeId}:attachment:${attachmentTimestamp}:${index}`,
					filename: file.name,
					mimeType: file.type || 'application/octet-stream',
					sizeBytes: file.size
				})),
				createdAt: nowIso()
			}
		];
		abortController = new AbortController();
		const streamConversationId = activeId;
		const streamAbortController = abortController;
		try {
			await streamMessage(
				activeId,
				content,
				(event) => {
					if (
						deps.getActiveId() !== streamConversationId ||
						abortController !== streamAbortController
					)
						return;
					handleStreamEvent(event);
				},
				abortController.signal,
				activeConversation?.model,
				filesToSend
			);
		} catch (error) {
			if (deps.getActiveId() !== streamConversationId || abortController !== streamAbortController)
				return;
			if ((error as Error).name !== 'AbortError') {
				deps.setAttachments(filesToSend);
				const errMsg = error instanceof Error ? error.message : 'Agent error';
				liveError = errMsg;
				deps.notify(errMsg);
			}
		} finally {
			if (
				deps.getActiveId() === streamConversationId &&
				abortController === streamAbortController
			) {
				streamingDeltas.flush();
				// A prompt whose tool call never arrived cannot be answered once
				// the turn is over.
				consentBuffer = {};
				messages = messages.map((msg) => ({ ...msg, isStreaming: false }));
				const completedLoadToken = deps.getConversationLoadToken();
				await deps.loadConversations();
				if (
					deps.getActiveId() === streamConversationId &&
					abortController === streamAbortController &&
					completedLoadToken === deps.getConversationLoadToken()
				)
					await deps.loadConversation(streamConversationId, false, true).catch(() => {});
				if (abortController === streamAbortController) {
					abortController = undefined;
					running = false;
				}
			}
		}
	}

	async function retry() {
		const activeId = deps.getActiveId();
		if (running || deps.isBlocked() || !activeId) return;
		const streamConversationId = activeId;
		const lastUserIdx = messages.findLastIndex((m) => m.role === 'user');
		if (lastUserIdx === -1) {
			if (lastFailedSubmission && lastFailedSubmission.conversationId === activeId) {
				deps.setDraft(lastFailedSubmission.content);
				deps.setAttachments(lastFailedSubmission.files);
				await send();
				return;
			}
			deps.notify('No message to retry');
			return;
		}

		deps.bumpConversationLoadToken();
		running = true;
		liveError = '';
		turnNotice = '';
		deps.setUserAtBottom(true);
		abortController = new AbortController();
		const streamAbortController = abortController;

		try {
			await streamRetry(
				activeId,
				(event) => {
					if (
						deps.getActiveId() !== streamConversationId ||
						abortController !== streamAbortController
					)
						return;
					handleStreamEvent(event);
				},
				abortController.signal,
				deps.getActiveConversation()?.model
			);
		} catch (error) {
			if (deps.getActiveId() !== streamConversationId || abortController !== streamAbortController)
				return;
			if ((error as Error).name !== 'AbortError') {
				const errMsg = error instanceof Error ? error.message : 'Agent error';
				liveError = errMsg;
				deps.notify(errMsg);
			}
		} finally {
			if (
				deps.getActiveId() === streamConversationId &&
				abortController === streamAbortController
			) {
				streamingDeltas.flush();
				// A prompt whose tool call never arrived cannot be answered once
				// the turn is over.
				consentBuffer = {};
				messages = messages.map((msg) => ({ ...msg, isStreaming: false }));
				const completedLoadToken = deps.getConversationLoadToken();
				await deps.loadConversations();
				if (
					deps.getActiveId() === streamConversationId &&
					abortController === streamAbortController &&
					completedLoadToken === deps.getConversationLoadToken()
				)
					await deps.loadConversation(streamConversationId, false, true).catch(() => {});
				if (abortController === streamAbortController) {
					abortController = undefined;
					running = false;
				}
			}
		}
	}

	async function stop() {
		const stoppingId = deps.getActiveId();
		const stoppingController = abortController;
		streamingDeltas.flush();
		stoppingController?.abort();
		if (stoppingId) await stopConversation(stoppingId).catch(() => {});
		if (
			deps.getActiveId() === stoppingId &&
			(!abortController || abortController === stoppingController)
		) {
			messages = messages.map((msg) => ({ ...msg, isStreaming: false }));
			deps.notify('Generation stopped');
		}
	}

	/** Drop the transcript and any in-flight stream, e.g. when switching conversation. */
	function reset() {
		streamingDeltas.clear();
		abortController?.abort();
		abortController = undefined;
		running = false;
		messages = [];
		turnNotice = '';
		consentBuffer = {};
	}

	/** Forget turn-scoped error state without touching the transcript. */
	function resetLiveState() {
		liveError = '';
		turnNotice = '';
		consentBuffer = {};
	}

	function applyConsent(toolCallId: string, decision: ConsentDecision) {
		messages = applyConsentDecision(messages, toolCallId, decision);
	}

	function dispose() {
		streamingDeltas.clear();
	}

	function setMessages(next: ConversationMessage[]) {
		messages = next;
	}

	return {
		get messages() {
			return messages;
		},
		setMessages,
		mergeMessages,
		get running() {
			return running;
		},
		get liveError() {
			return liveError;
		},
		get turnNotice() {
			return turnNotice;
		},
		dismissTurnNotice: () => {
			turnNotice = '';
		},
		get canRetry() {
			return canRetry;
		},
		send,
		retry,
		stop,
		reset,
		resetLiveState,
		applyConsent,
		dispose
	};
}
