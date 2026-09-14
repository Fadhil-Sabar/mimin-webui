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

export type ConversationMessage = {
	skill?: SkillSummary | null;
	id: string;
	role: 'user' | 'assistant';
	content: unknown;
	createdAt: string;
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
