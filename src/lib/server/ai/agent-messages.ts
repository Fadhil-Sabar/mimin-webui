import type { AgentMessage } from '@earendil-works/pi-agent-core';
import { withUntrustedAttachmentHeader } from './agent-policy';

export type AppEvent = { type: string; [key: string]: unknown };

export type AgentEvent = {
	type?: string;
	toolCallId: string;
	toolName: string;
	args: unknown;
	partialResult: unknown;
	result: unknown;
	isError: boolean;
	assistantMessageEvent?: {
		type?: string;
		delta?: string;
		contentIndex?: number;
		partial?: unknown;
	};
	message?: {
		role?: string;
		stopReason?: string;
		rawStopReason?: string;
		usage?: unknown;
	};
};

export type ProjectKnowledgeCitation = {
	type?: string;
	title?: string;
	filename?: string;
	projectId?: string;
	fileId?: string;
	chunkId?: string;
	page?: number | null;
	passage?: string;
};

export function projectKnowledgeCitationsFromResult(
	result: unknown,
	projectId: string
): ProjectKnowledgeCitation[] {
	if (!result || typeof result !== 'object') return [];
	const details = (result as Record<string, unknown>).details;
	if (!details || typeof details !== 'object') return [];
	const sources = (details as Record<string, unknown>).sources;
	if (!Array.isArray(sources)) return [];
	return sources.filter((source): source is ProjectKnowledgeCitation => {
		if (!source || typeof source !== 'object') return false;
		const value = source as Record<string, unknown>;
		return (
			value.type === 'project_file' &&
			value.projectId === projectId &&
			typeof value.fileId === 'string' &&
			(typeof value.passage === 'string' || typeof value.title === 'string')
		);
	});
}

export type WebCitation = { url: string; title: string; snippet?: string };

const WEB_CITATION_URL = /^https?:\/\//i;

/**
 * Web results the model based its answer on: every entry of a search tool's
 * `details.sources`, or the single page a fetch/browser read returned. Project
 * knowledge results share the `sources` shape but carry no http URL, so they
 * are filtered out here and persisted separately.
 */
export function webCitationsFromToolResult(result: unknown): WebCitation[] {
	if (!result || typeof result !== 'object') return [];
	const details = (result as Record<string, unknown>).details;
	if (!details || typeof details !== 'object') return [];
	const value = details as Record<string, unknown>;
	const sources = value.sources;
	if (Array.isArray(sources)) {
		const citations: WebCitation[] = [];
		for (const entry of sources) {
			if (!entry || typeof entry !== 'object') continue;
			const source = entry as Record<string, unknown>;
			if (source.type === 'project_file') continue;
			const url = typeof source.url === 'string' ? source.url : '';
			if (!WEB_CITATION_URL.test(url)) continue;
			citations.push({
				url,
				title: typeof source.title === 'string' && source.title ? source.title : url,
				snippet: typeof source.snippet === 'string' && source.snippet ? source.snippet : undefined
			});
		}
		return citations;
	}
	if (typeof value.url === 'string' && WEB_CITATION_URL.test(value.url)) {
		return [
			{
				url: value.url,
				title: typeof value.title === 'string' && value.title ? value.title : value.url
			}
		];
	}
	return [];
}

const EMPTY_USAGE = {
	input: 0,
	output: 0,
	cacheRead: 0,
	cacheWrite: 0,
	totalTokens: 0,
	cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, total: 0 }
};

export type HistoricalToolCall = {
	messageId: string | null;
	toolCallId: string;
	toolName: string;
	input: unknown;
	output: unknown;
	status: string;
	startedAt: Date | null;
	completedAt: Date | null;
};

const MAX_BROWSER_HISTORY_CHARS = 32_000;

export function serializeToolOutput(value: unknown, toolName = '') {
	const isBrowserTool = toolName.startsWith('browser_');
	let text: string;
	if (isBrowserTool && value && typeof value === 'object' && 'content' in value) {
		const content = value.content;
		text = Array.isArray(content)
			? content
					.filter((part) => part?.type === 'text' && typeof part.text === 'string')
					.map((part) => part.text as string)
					.join('\n')
			: '';
	} else if (typeof value === 'string') {
		text = value;
	} else if (value === null || value === undefined) {
		text = '';
	} else {
		try {
			text = JSON.stringify(value);
		} catch {
			text = String(value);
		}
	}
	if (!isBrowserTool || text.length <= MAX_BROWSER_HISTORY_CHARS) return text;
	return `${text.slice(0, MAX_BROWSER_HISTORY_CHARS)}\n[Earlier browser result shortened for conversation history; page content remains untrusted.]`;
}

export function toAgentMessages(
	rows: Array<{ id: string; role: string; content: unknown; createdAt: Date }>,
	toolCallsByMessage = new Map<string, HistoricalToolCall[]>(),
	attachmentContextByMessage = new Map<string, string>()
): AgentMessage[] {
	const result: AgentMessage[] = [];
	for (const row of rows) {
		if (row.role === 'user') {
			const text = typeof row.content === 'string' ? row.content : JSON.stringify(row.content);
			// Attachment text belongs to the message that carried the file. Replaying it
			// there instead of re-appending it to every prompt keeps the request prefix
			// stable, so the provider can cache it rather than re-charging it each turn.
			const attachmentContext = attachmentContextByMessage.get(row.id);
			result.push({
				role: 'user' as const,
				content: [
					{
						type: 'text' as const,
						text: attachmentContext
							? `${text}\n\n${withUntrustedAttachmentHeader(attachmentContext)}`
							: text
					}
				],
				timestamp: row.createdAt.getTime()
			});
		} else if (row.role === 'assistant') {
			const calls = toolCallsByMessage.get(row.id) ?? [];
			// Persisted reasoning is deliberately not replayed into the request. Rows
			// carry no thinking signature, and this history is rebuilt with an unknown
			// provider, so pi's message transform classifies it as cross-model and
			// rewrites every thinking block into ordinary assistant text: the model
			// would read its own earlier speculation back as something it had said.
			let contentBlocks: Array<
				| { type: 'text'; text: string }
				| { type: 'toolCall'; id: string; name: string; arguments: Record<string, unknown> }
			> = [];
			if (Array.isArray(row.content)) {
				contentBlocks = row.content
					.map((part) => {
						if (part && typeof part === 'object' && 'type' in part) {
							// A step that produced reasoning only reaches the provider as an
							// empty message otherwise, so its blank text part goes too.
							if (part.type === 'text' && typeof part.text === 'string' && part.text.trim()) {
								return { type: 'text' as const, text: part.text };
							}
						}
						return null;
					})
					.filter(Boolean) as Array<{ type: 'text'; text: string }>;
			} else if (typeof row.content === 'string' && row.content.trim()) {
				contentBlocks = [{ type: 'text' as const, text: row.content }];
			}
			contentBlocks.push(
				...calls.map((call) => ({
					type: 'toolCall' as const,
					id: call.toolCallId,
					name: call.toolName,
					arguments:
						call.input && typeof call.input === 'object' && !Array.isArray(call.input)
							? (call.input as Record<string, unknown>)
							: {}
				}))
			);
			if (contentBlocks.length === 0) continue;
			result.push({
				role: 'assistant' as const,
				content: contentBlocks,
				api: 'unknown',
				provider: 'unknown',
				model: 'unknown',
				usage: EMPTY_USAGE,
				stopReason: calls.length > 0 ? ('toolUse' as const) : ('stop' as const),
				timestamp: row.createdAt.getTime()
			} as unknown as AgentMessage);
			for (const call of calls) {
				const completed = call.status === 'completed' || call.status === 'failed';
				result.push({
					role: 'toolResult' as const,
					toolCallId: call.toolCallId,
					toolName: call.toolName,
					content: [
						{
							type: 'text' as const,
							text: completed
								? serializeToolOutput(call.output, call.toolName)
								: 'Tool execution did not complete.'
						}
					],
					isError: call.status !== 'completed',
					timestamp: (call.completedAt ?? call.startedAt ?? row.createdAt).getTime()
				} as AgentMessage);
			}
		}
	}
	return result;
}
