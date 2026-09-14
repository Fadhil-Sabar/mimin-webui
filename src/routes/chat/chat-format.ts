import { SvelteSet } from 'svelte/reactivity';
import type { ModelOption } from '$lib/components/ModelPicker.svelte';
import type { ToolOption } from '$lib/components/ToolPicker.svelte';
import type {
	ConversationMessage,
	MessageCitation,
	ToolCall,
	ToolSource,
	TurnSource
} from './chat-types';

export function modelRef(model: ModelOption) {
	return `${model.provider}/${model.id}`;
}

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
