import { SvelteSet } from 'svelte/reactivity';
import type { ToolOption } from '$lib/components/ToolPicker.svelte';
import type { SkillSummary } from '$lib/skills';
import type {
	ConversationMessage,
	MessageCitation,
	ToolCall,
	ToolSource,
	TurnSource
} from './chat-types';

export function modelId(modelRefValue: string) {
	return modelRefValue.split('/').slice(1).join('/') || modelRefValue;
}

/** Timestamp recorded on transcript entries. */
export function nowIso() {
	return new Date().toISOString();
}

/** Tools whose availability follows the browser bridge connection, not the tool picker. */
export const BROWSER_BRIDGE_TOOLS = new Set([
	'browser_search',
	'browser_open',
	'browser_tabs',
	'browser_read_tab',
	'browser_interact'
]);

export const BROWSER_BRIDGE_TOOL_FALLBACKS: ToolOption[] = [
	{
		name: 'browser_search',
		label: 'Browser Search',
		description: 'Search Google or Google Scholar via browser extension.',
		category: 'browser',
		enabled: false,
		readOnly: true
	},
	{
		name: 'browser_open',
		label: 'Browser Open',
		description: 'Open and read a public webpage via browser extension.',
		category: 'browser',
		enabled: false,
		readOnly: true
	},
	{
		name: 'browser_tabs',
		label: 'Browser Tabs',
		description: "List the user's open browser tabs via browser extension.",
		category: 'browser',
		enabled: false,
		readOnly: true
	},
	{
		name: 'browser_read_tab',
		label: 'Browser Read Tab',
		description: "Read one of the user's open browser tabs via browser extension.",
		category: 'browser',
		enabled: false,
		readOnly: true
	},
	{
		name: 'browser_interact',
		label: 'Browser Interact',
		description: "Click, type, and navigate inside the user's open browser tabs.",
		category: 'browser',
		enabled: false,
		readOnly: true
	}
];

export function formatToolLabel(
	toolName: string,
	input?: unknown
): { label: string; action: string; query?: string } {
	const rawInput = input && typeof input === 'object' ? (input as Record<string, unknown>) : {};
	const query = typeof rawInput.query === 'string' ? rawInput.query : undefined;

	if (toolName === 'project_knowledge_search') {
		return {
			label: 'Project Knowledge Search',
			action: query
				? `Searching project knowledge for "${query}"`
				: 'Searching project knowledge...',
			query
		};
	}
	if (toolName === 'web_search') {
		return {
			label: 'Web Search',
			action: query ? `Searching web for "${query}"` : 'Searching web...',
			query
		};
	}
	if (toolName === 'web_fetch') {
		const url = typeof rawInput.url === 'string' ? rawInput.url : undefined;
		return {
			label: 'Web Fetch',
			action: url ? `Reading ${url}` : 'Reading page...',
			query: url
		};
	}
	if (toolName === 'ask_question') {
		const qs = Array.isArray(rawInput.questions) ? rawInput.questions : [];
		const qText =
			qs[0]?.question || (typeof rawInput.question === 'string' ? rawInput.question : undefined);
		return {
			label: 'Ask Question',
			action: 'Waiting for your response...',
			query: qText
		};
	}
	if (toolName === 'create_skill') {
		const skillName = typeof rawInput.name === 'string' ? rawInput.name : undefined;
		return {
			label: 'Create Skill',
			action: skillName ? `Creating skill "${skillName}"...` : 'Creating skill...',
			query: skillName
		};
	}
	if (toolName === 'inspect_canvas') {
		return {
			label: 'Inspect Canvas',
			action: 'Inspecting Canvas style guideline and scenes...'
		};
	}
	if (toolName === 'create_scene') {
		const sceneName = typeof rawInput.name === 'string' ? rawInput.name : undefined;
		const viewport = typeof rawInput.viewport === 'string' ? rawInput.viewport : '';
		return {
			label: 'Create Scene',
			action: sceneName ? `Creating scene "${sceneName}" (${viewport})...` : 'Creating scene...',
			query: sceneName
		};
	}
	if (toolName === 'edit_scene') {
		const sceneId = typeof rawInput.sceneId === 'string' ? rawInput.sceneId : undefined;
		const name = typeof rawInput.name === 'string' ? rawInput.name : undefined;
		return {
			label: 'Edit Scene',
			action: name ? `Updating scene "${name}"...` : 'Updating Canvas scene...',
			query: name || sceneId
		};
	}
	if (toolName === 'delete_scene') {
		const sceneId = typeof rawInput.sceneId === 'string' ? rawInput.sceneId : undefined;
		return {
			label: 'Delete Scene',
			action: 'Deleting Canvas scene...',
			query: sceneId
		};
	}
	if (toolName === 'update_style_guideline') {
		return {
			label: 'Update Style Guideline',
			action: 'Updating Canvas style guideline contract...'
		};
	}
	if (toolName === 'create_connection') {
		return {
			label: 'Connect Scenes',
			action: 'Connecting Canvas scenes...'
		};
	}
	if (toolName === 'delete_connection') {
		return {
			label: 'Remove Connection',
			action: 'Removing Canvas connection...'
		};
	}
	if (toolName === 'browser_tabs') {
		return { label: 'Browser Tabs', action: 'Listing open browser tabs...' };
	}
	if (toolName === 'browser_read_tab') {
		const tabId = typeof rawInput.tabId === 'number' ? rawInput.tabId : undefined;
		return {
			label: 'Read Browser Tab',
			action: tabId !== undefined ? `Reading tab ${tabId}...` : 'Reading the active tab...'
		};
	}
	if (toolName === 'browser_interact') {
		const interaction = typeof rawInput.action === 'string' ? rawInput.action : undefined;
		const detail =
			typeof rawInput.text === 'string' && rawInput.text
				? rawInput.text
				: typeof rawInput.selector === 'string'
					? rawInput.selector
					: interaction === 'navigate' && typeof rawInput.url === 'string'
						? rawInput.url
						: undefined;
		return {
			label: 'Browser Interact',
			action: interaction ? `${interaction} in browser tab...` : 'Interacting with browser tab...',
			query: detail
		};
	}
	return {
		label: toolName,
		action: query ? `Running ${toolName} for "${query}"` : `Running ${toolName}...`,
		query
	};
}

export function contentText(content: unknown): string {
	if (typeof content === 'string') return content;
	if (Array.isArray(content))
		return content
			.filter((part) => (typeof part === 'string' ? true : part?.type !== 'thinking'))
			.map((part) => (typeof part === 'string' ? part : (part?.text ?? '')))
			.join('');
	return '';
}

export function thinkingText(content: unknown): string {
	if (!Array.isArray(content)) return '';
	return content
		.filter((part) => part && typeof part === 'object' && part.type === 'thinking')
		.map((part) => (typeof part.thinking === 'string' ? part.thinking : ''))
		.filter(Boolean)
		.join('\n')
		.trim();
}

export function formatTime(iso: string) {
	return new Date(iso).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
}

export function formatFileSize(bytes: number) {
	return bytes > 1024 * 1024
		? `${(bytes / 1024 / 1024).toFixed(1)} MB`
		: `${Math.max(1, Math.round(bytes / 1024))} KB`;
}

/** File types the chat attachment endpoint accepts, shared by the picker and the guard. */
export const CHAT_ATTACHMENT_ACCEPT = '.txt,.md,.json,.pdf,.png,.jpg,.jpeg,.webp,.gif';
const CHAT_ATTACHMENT_PATTERN = /\.(txt|md|json|pdf|png|jpe?g|webp|gif)$/i;
const IMAGE_ATTACHMENT_PATTERN = /\.(png|jpe?g|webp|gif)$/i;

/** Server-side image vision cap, mirrored so an oversized image fails before it uploads. */
export const MAX_IMAGE_ATTACHMENT_BYTES = 8 * 1024 * 1024;

const IMAGE_EXTENSION_BY_MIME: Record<string, string> = {
	'image/png': 'png',
	'image/jpeg': 'jpg',
	'image/webp': 'webp',
	'image/gif': 'gif'
};

export function isImageAttachment(attachment: { mimeType?: string; filename?: string }) {
	return (
		Boolean(attachment.mimeType?.startsWith('image/')) ||
		Boolean(attachment.filename && IMAGE_ATTACHMENT_PATTERN.test(attachment.filename))
	);
}

/** The same check for a not-yet-uploaded `File` from the picker or the clipboard. */
export function isImageFile(file: File) {
	return isImageAttachment({ mimeType: file.type, filename: file.name });
}

/**
 * A pasted image arrives as a blob with a type but often no usable name. The upload
 * route is extension-driven, so give it a name it can validate. Returns null for a
 * file the endpoint would reject anyway.
 */
export function normalizeAttachmentFile(file: File): File | null {
	const extension = IMAGE_EXTENSION_BY_MIME[file.type];
	if (extension && !CHAT_ATTACHMENT_PATTERN.test(file.name))
		return new File([file], `pasted-${Date.now().toString(36)}.${extension}`, {
			type: file.type,
			lastModified: file.lastModified
		});
	return CHAT_ATTACHMENT_PATTERN.test(file.name) ? file : null;
}

export function getToolSourceList(toolCall: ToolCall): ToolSource[] {
	if (!toolCall.output || typeof toolCall.output !== 'object') return [];
	const output = toolCall.output as Record<string, unknown>;
	const details = output.details as Record<string, unknown> | undefined;
	if (details) {
		if (Array.isArray(details.sources)) {
			return details.sources as ToolSource[];
		}
		if (Array.isArray(details.results)) {
			return details.results as ToolSource[];
		}
		if (details.url && typeof details.url === 'string') {
			return [
				{
					title: typeof details.title === 'string' && details.title ? details.title : details.url,
					url: details.url
				}
			];
		}
	}
	return [];
}

export function getToolResultSummary(toolCall: ToolCall): string {
	const sources = getToolSourceList(toolCall);
	if (toolCall.toolName === 'project_knowledge_search') {
		if (sources.length > 0) {
			return `${sources.length} document${sources.length === 1 ? '' : 's'} referenced`;
		}
		return 'Search completed';
	}
	if (toolCall.toolName === 'web_search' || toolCall.toolName === 'browser_search') {
		if (sources.length > 0) {
			return `${sources.length} source${sources.length === 1 ? '' : 's'} found`;
		}
		return 'Search completed';
	}
	if (toolCall.toolName === 'browser_open') {
		return 'Page opened';
	}
	if (toolCall.toolName === 'web_fetch') {
		const output =
			toolCall.output && typeof toolCall.output === 'object'
				? (toolCall.output as Record<string, unknown>)
				: {};
		const details =
			output.details && typeof output.details === 'object'
				? (output.details as Record<string, unknown>)
				: undefined;
		return details?.truncated === true ? 'Page read (truncated)' : 'Page read';
	}
	if (toolCall.toolName === 'browser_tabs') {
		const output =
			toolCall.output && typeof toolCall.output === 'object'
				? (toolCall.output as Record<string, unknown>)
				: {};
		const details =
			output.details && typeof output.details === 'object'
				? (output.details as Record<string, unknown>)
				: undefined;
		const tabs = Array.isArray(details?.tabs) ? details.tabs : [];
		if (tabs.length > 0) return `${tabs.length} tab${tabs.length === 1 ? '' : 's'} listed`;
		return 'Tabs listed';
	}
	if (toolCall.toolName === 'browser_read_tab') {
		const output =
			toolCall.output && typeof toolCall.output === 'object'
				? (toolCall.output as Record<string, unknown>)
				: {};
		const details =
			output.details && typeof output.details === 'object'
				? (output.details as Record<string, unknown>)
				: undefined;
		if (details && details.readable === false) return 'Tab not readable';
		return 'Tab read';
	}
	if (toolCall.toolName === 'browser_interact') return 'Browser action done';
	if (toolCall.toolName === 'ask_question') {
		const output =
			toolCall.output && typeof toolCall.output === 'object'
				? (toolCall.output as Record<string, unknown>)
				: {};
		const details =
			output.details && typeof output.details === 'object'
				? (output.details as Record<string, unknown>)
				: undefined;
		if (details?.skipped) return 'Skipped';
		if (details?.answers && Array.isArray(details.answers)) return 'Answered';
		return 'Completed';
	}
	if (toolCall.toolName === 'create_skill') {
		const output =
			toolCall.output && typeof toolCall.output === 'object'
				? (toolCall.output as Record<string, unknown>)
				: {};
		const details =
			output.details && typeof output.details === 'object'
				? (output.details as Record<string, unknown>)
				: undefined;
		const skill = details?.skill as Record<string, unknown> | undefined;
		if (skill?.name) return `Created "${skill.name}"`;
		return 'Skill created';
	}
	return 'Completed';
}

export function getTurnSources(messages: ConversationMessage[], msgIndex: number): TurnSource[] {
	const target = messages[msgIndex];
	if (!target || target.role !== 'assistant') return [];

	const collected: TurnSource[] = [];
	const seenSources = new SvelteSet<string>();

	function addCitation(citation: MessageCitation) {
		const metadata = citation.metadata ?? {};
		const url = citation.url ?? '';
		const snippet = citation.passage || metadata.passage || '';
		const sourceKey = `${url}|${citation.page ?? metadata.page ?? ''}|${snippet}`;
		if (
			!url ||
			(!/^https?:\/\//i.test(url) && !url.startsWith('/api/')) ||
			seenSources.has(sourceKey)
		)
			return;
		seenSources.add(sourceKey);
		collected.push({
			title: citation.filename || citation.title || metadata.filename || citation.label || url,
			url,
			snippet,
			page: citation.page ?? metadata.page ?? null,
			type: citation.type,
			filename: citation.filename || metadata.filename
		});
	}

	for (const citation of target.citations ?? []) addCitation(citation);

	function addFromToolCalls(toolCalls?: ToolCall[]) {
		if (!toolCalls) return;
		for (const tc of toolCalls) {
			const sources = getToolSourceList(tc);
			for (const s of sources) {
				const url =
					s.url ||
					(s.type === 'project_file' && s.projectId && s.fileId
						? `/api/projects/${encodeURIComponent(s.projectId)}/files/${encodeURIComponent(s.fileId)}`
						: '');
				const sourceKey = `${url}|${s.page ?? ''}|${s.passage || ''}`;
				if (
					url &&
					(/^https?:\/\//i.test(url) || url.startsWith('/api/')) &&
					!seenSources.has(sourceKey)
				) {
					seenSources.add(sourceKey);
					collected.push({
						title: s.filename || s.title || url,
						url,
						snippet: s.passage || '',
						page: s.page ?? null,
						type: s.type,
						filename: s.filename
					});
				}
			}
		}
	}

	// 1. Check tool calls directly on this message
	addFromToolCalls(target.toolCalls);

	// 2. Scan preceding assistant messages in the current turn
	for (let idx = msgIndex - 1; idx >= 0; idx--) {
		const prev = messages[idx];
		if (prev.role !== 'assistant') break;
		addFromToolCalls(prev.toolCalls);
	}

	return collected;
}

/** What one finished answer cost and drew on, in compact and full form. */
export type MessageContext = {
	/** One-line summary rendered under the reply. */
	summary: string;
	/** Full breakdown, used as the tooltip so the compact form loses nothing. */
	detail: string;
};

function formatTokenCount(value: number) {
	if (value < 1_000) return String(value);
	if (value < 10_000) return `${(value / 1_000).toFixed(1)}k`;
	return `${Math.round(value / 1_000)}k`;
}

function formatElapsed(seconds: number) {
	return seconds < 60 ? `${seconds}s` : `${Math.floor(seconds / 60)}m ${seconds % 60}s`;
}

function pluralize(count: number, noun: string) {
	return `${count} ${noun}${count === 1 ? '' : 's'}`;
}

/**
 * Summarise a finished answer.
 *
 * Returns null when there is nothing substantive to report. A project name or a skill
 * on its own must not qualify: that would put a line under every reply in a project
 * chat, which is exactly the noise this replaced.
 */
export function messageContextSummary(
	message: ConversationMessage,
	options: {
		attachments?: string[];
		skill?: SkillSummary | null;
		projectName?: string | null;
	} = {}
): MessageContext | null {
	if (message.role !== 'assistant' || message.isStreaming) return null;

	const usage = message.usage ?? null;
	const totalTokens =
		usage?.totalTokens ??
		(usage
			? (usage.input ?? 0) +
				(usage.output ?? 0) +
				(usage.cacheRead ?? 0) +
				(usage.cacheWrite ?? 0) +
				(usage.reasoning ?? 0)
			: 0);
	const elapsedMs = (() => {
		if (!message.completedAt) return null;
		const start = Date.parse(message.createdAt);
		const end = Date.parse(message.completedAt);
		if (!Number.isFinite(start) || !Number.isFinite(end) || end < start) return null;
		return end - start;
	})();
	const elapsedSeconds = elapsedMs === null ? null : Math.round(elapsedMs / 1000);
	/**
	 * Output tokens over the turn's wall clock. It is an estimate: tool execution is
	 * part of that clock, so a turn that ran tools reads slower than the model wrote.
	 */
	const outputTokens = usage?.output ?? 0;
	const tokensPerSecond =
		outputTokens > 0 && elapsedMs !== null && elapsedMs > 0
			? Math.round(outputTokens / (elapsedMs / 1000))
			: null;
	const sources = message.citations?.length ?? 0;
	const toolCalls = message.toolCalls?.length ?? 0;
	const attachments = options.attachments ?? [];

	if (
		totalTokens <= 0 &&
		elapsedSeconds === null &&
		tokensPerSecond === null &&
		sources === 0 &&
		toolCalls === 0 &&
		attachments.length === 0
	)
		return null;

	const summary: string[] = [];
	if (totalTokens > 0) summary.push(`${formatTokenCount(totalTokens)} tokens`);
	if (elapsedSeconds !== null) summary.push(formatElapsed(elapsedSeconds));
	if (tokensPerSecond !== null) summary.push(`${tokensPerSecond} tok/s`);
	if (sources > 0) summary.push(pluralize(sources, 'source'));
	if (toolCalls > 0) summary.push(pluralize(toolCalls, 'tool'));
	if (attachments.length > 0) summary.push(pluralize(attachments.length, 'file'));

	const detail: string[] = [];
	if (usage) {
		if (usage.input) detail.push(`Input ${usage.input.toLocaleString()}`);
		if (usage.output) detail.push(`Output ${usage.output.toLocaleString()}`);
		if (usage.cacheRead) detail.push(`Cache read ${usage.cacheRead.toLocaleString()}`);
		if (usage.cacheWrite) detail.push(`Cache write ${usage.cacheWrite.toLocaleString()}`);
		if (usage.reasoning) detail.push(`Reasoning ${usage.reasoning.toLocaleString()}`);
	}
	if (elapsedSeconds !== null) detail.push(`Duration ${formatElapsed(elapsedSeconds)}`);
	if (tokensPerSecond !== null)
		detail.push(
			`Speed ~${tokensPerSecond} tok/s (output tokens over the whole turn, so tool time lowers it)`
		);
	if (toolCalls > 0) detail.push(pluralize(toolCalls, 'tool call'));
	if (sources > 0) detail.push(pluralize(sources, 'source'));
	if (attachments.length > 0) detail.push(`Files: ${attachments.join(', ')}`);
	if (options.skill) detail.push(`Skill: ${options.skill.name}`);
	if (options.projectName) detail.push(`Project: ${options.projectName} knowledge available`);
	if (!usage) detail.push('This turn did not report token usage.');

	return { summary: summary.join(' · '), detail: detail.join(' · ') };
}
