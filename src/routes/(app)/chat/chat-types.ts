import type { SkillSummary } from '$lib/skills';
import type { ConsentDecision, ConsentState } from '$lib/client/consent-state';

export type Conversation = {
	activeSkill?: SkillSummary | null;
	id: string;
	title: string;
	model: string;
	enabledTools: string[];
	createdAt: string;
	updatedAt: string;
	projectId: string | null;
	projectName?: string | null;
	canvasId?: string | null;
};

export type ToolCall = {
	id?: string;
	toolCallId: string;
	toolName: string;
	input?: unknown;
	output?: unknown;
	consent?: ConsentState;
	status: 'pending' | 'running' | 'completed' | 'failed';
	/** True while the model is still writing this call's arguments, before it executes. */
	preparing?: boolean;
	startedAt?: string | null;
	completedAt?: string | null;
};

export type MessageCitation = {
	sourceId?: string;
	label?: string;
	type?: string;
	title?: string;
	url?: string | null;
	fileId?: string | null;
	metadata?: {
		filename?: string;
		page?: number | null;
		passage?: string;
		chunkId?: string | null;
		projectId?: string;
	} | null;
	page?: number | null;
	passage?: string;
	filename?: string;
};

export type MessageAttachment = {
	id: string;
	filename: string;
	mimeType: string;
	sizeBytes: number;
	extractionStatus?: string | null;
	pageCount?: number | null;
	extractionError?: string | null;
};

/** Provider-reported token counts for one assistant message. */
export type MessageUsage = {
	input?: number;
	output?: number;
	cacheRead?: number;
	cacheWrite?: number;
	reasoning?: number;
	totalTokens?: number;
};

/**
 * Lifecycle of the turn that produced the message. `superseded` rows never reach
 * the client: they are filtered out of the transcript server-side.
 */
export type TurnState = 'streaming' | 'complete' | 'interrupted';

export type ConversationMessage = {
	skill?: SkillSummary | null;
	id: string;
	role: 'user' | 'assistant';
	content: unknown;
	createdAt: string;
	/**
	 * Terminal state of the turn, when the server recorded one: pi's stop reason
	 * ("stop", "length", "toolUse") or "no-answer" for a turn that produced only
	 * reasoning. Used to mark replies that stopped before writing an answer.
	 */
	stopReason?: string | null;
	/** Set when a turn ended without finalizing, so the reply can be retried. */
	turnState?: TurnState | null;
	/** When the turn finalized; with `createdAt` this gives the turn duration. */
	completedAt?: string | null;
	usage?: MessageUsage | null;
	attachments?: MessageAttachment[];
	toolCalls?: ToolCall[];
	citations?: MessageCitation[];
	isStreaming?: boolean;
};

/** A source referenced by a tool result, before it is turned into a turn citation. */
export type ToolSource = {
	title: string;
	url?: string;
	page?: number | null;
	type?: string;
	filename?: string;
	projectId?: string;
	fileId?: string;
	chunkId?: string;
	passage?: string;
};

/** A deduplicated source shown under an assistant message. */
export type TurnSource = {
	title: string;
	url: string;
	snippet?: string;
	page?: number | null;
	type?: string;
	filename?: string;
};

export type SkillSuggestion = SkillSummary;

export type PendingSubmission = {
	conversationId: string;
	content: string;
	files: File[];
};

/** Answers collected by a QuestionCard, shaped for the answer endpoint. */
export type QuestionPayload = {
	answers: Array<Record<string, unknown>>;
	skipped?: boolean;
};

export type QuestionSubmitHandler = (
	toolCallId: string | undefined,
	payload: QuestionPayload
) => Promise<void> | void;

export type ConsentSubmitHandler = (
	toolCallId: string | undefined,
	decision: ConsentDecision
) => Promise<void> | void;
