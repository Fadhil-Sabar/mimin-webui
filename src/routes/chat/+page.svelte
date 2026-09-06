<script lang="ts">
	import { onMount, tick } from 'svelte';
	import { SvelteSet } from 'svelte/reactivity';
	import { resolve } from '$app/paths';
	import {
		createConversation,
		deleteConversation,
		extractSseErrorMessage,
		stopConversation,
		streamMessage,
		streamRetry,
		updateConversation,
		type SseEvent
	} from '$lib/client/api';
	import {
		ArrowUp,
		Bot,
		Check,
		ChevronDown,
		FileText,
		FolderKanban,
		Globe,
		LogOut,
		MessageSquare,
		PanelLeft,
		Paperclip,
		Plus,
		Puzzle,
		RotateCcw,
		Search,
		Settings,
		Sparkles,
		Square,
		User,
		UserRound,
		Wrench,
		X
	} from '@lucide/svelte';
	import ThemeToggle from '$lib/components/ThemeToggle.svelte';
	import { authClient } from '$lib/client/auth';
	import { sidebar } from '$lib/client/sidebar.svelte';
	import ModelPicker, {
		type ModelOption,
		type ThinkingLevel
	} from '$lib/components/ModelPicker.svelte';
	import ToolPicker, { type ToolOption } from '$lib/components/ToolPicker.svelte';
	import Markdown from '$lib/components/Markdown.svelte';
	import RecentChats from '$lib/components/RecentChats.svelte';
	import { conversationsState, type ConversationSummary } from '$lib/client/conversations.svelte';
	import { isBrowserBridgeEnabled } from '$lib/client/browser-bridge';

	type Conversation = {
		id: string;
		title: string;
		model: string;
		enabledTools: string[];
		createdAt: string;
		updatedAt: string;
		projectId: string | null;
		projectName?: string | null;
	};
	type ToolCall = {
		id?: string;
		toolCallId: string;
		toolName: string;
		input?: unknown;
		output?: unknown;
		status: 'pending' | 'running' | 'completed' | 'failed';
		startedAt?: string | null;
		completedAt?: string | null;
	};
	type ChatMessage = {
		id: string;
		role: 'user' | 'assistant';
		content: unknown;
		createdAt: string;
		attachments?: MessageAttachment[];
		toolCalls?: ToolCall[];
		isStreaming?: boolean;
	};
	type MessageAttachment = {
		id: string;
		filename: string;
		mimeType: string;
		sizeBytes: number;
		extractionStatus?: string | null;
		pageCount?: number | null;
		extractionError?: string | null;
	};

	let running = $state(false);
	let message = $state('');
	let toast = $state('');
	let busy = $state(true);
	let { data } = $props();
	let user = $derived(data.user);
	let conversations = $state<Conversation[]>(
		conversationsState.items.map((conversation) => ({
			id: conversation.id,
			title: conversation.title,
			model: conversation.model ?? 'openai/gpt-4o-mini',
			enabledTools: ['web_search'],
			createdAt: conversation.createdAt ?? new Date().toISOString(),
			updatedAt: conversation.updatedAt ?? new Date().toISOString(),
			projectId: conversation.projectId,
			projectName: conversation.projectName
		}))
	);
	let activeId = $state('');
	let activeConversation = $state<Conversation | null>(null);
	let messages = $state<ChatMessage[]>([]);
	let liveError = $state('');
	let lastFailedSubmission = $state<{
		conversationId: string;
		content: string;
		files: File[];
	} | null>(null);
	const canRetry = $derived(
		!running &&
			Boolean(
				liveError ||
				(messages.length > 0 && messages[messages.length - 1]?.role === 'user') ||
				(lastFailedSubmission && lastFailedSubmission.conversationId === activeId)
			)
	);
	let models = $state<ModelOption[]>([]);
	let modelsLoading = $state(true);
	let modelLoadError = $state('');
	let modelSaving = $state(false);
	let thinkingSaving = $state(false);
	let thinkingLevelsByModel = $state<Record<string, ThinkingLevel>>({});
	let availableTools = $state<ToolOption[]>([]);
	let toolsLoading = $state(true);
	let browserBridgeEnabled = $state(false);
	let abortController: AbortController | undefined;
	let scrollEl: HTMLElement | undefined;
	let userAtBottom = $state(true);
	let editingId = $state<string | null>(null);
	let editingTitle = $state('');
	let deletingConversation = $state<ConversationSummary | null>(null);
	let deleteLoading = $state(false);
	let pendingAttachments = $state<File[]>([]);
	let fileInput = $state<HTMLInputElement | undefined>(undefined);
	let conversationLoadToken = 0;
	let toolsLoadToken = 0;

	$effect(() => {
		if (typeof window === 'undefined') return;
		browserBridgeEnabled = isBrowserBridgeEnabled();
		const handleSync = () => {
			browserBridgeEnabled = isBrowserBridgeEnabled();
		};
		window.addEventListener('storage', handleSync);
		window.addEventListener('focus', handleSync);
		return () => {
			window.removeEventListener('storage', handleSync);
			window.removeEventListener('focus', handleSync);
		};
	});

	let displayTools = $derived.by(() => {
		const tools = availableTools.map((tool) =>
			tool.name === 'browser_search' || tool.name === 'browser_open'
				? {
						...tool,
						enabled: browserBridgeEnabled,
						readOnly: true,
						settingHref: '/settings/browser-extension'
					}
				: tool
		);
		if (!tools.some((t) => t.name === 'browser_search')) {
			tools.push({
				name: 'browser_search',
				label: 'Browser Search',
				description: 'Search Google or Google Scholar via browser extension.',
				category: 'browser',
				enabled: browserBridgeEnabled,
				readOnly: true,
				settingHint: 'Configure in Settings > Browser Extension',
				settingHref: '/settings/browser-extension'
			});
		}
		return tools;
	});

	let isNewConversationEmpty = $derived(messages.length === 0 && !running && !!activeConversation);

	const SCROLL_THRESHOLD = 80;

	function isNearBottom(el: HTMLElement) {
		return el.scrollHeight - el.scrollTop - el.clientHeight < SCROLL_THRESHOLD;
	}

	function handleScroll() {
		if (!scrollEl) return;
		userAtBottom = isNearBottom(scrollEl);
	}

	function scrollToBottom() {
		if (!scrollEl) return;
		scrollEl.scrollTop = scrollEl.scrollHeight;
	}

	$effect(() => {
		// Subscribe to reactive changes
		void messages;

		if (userAtBottom) {
			tick().then(scrollToBottom);
		}
	});

	function formatToolLabel(
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
		return {
			label: toolName,
			action: query ? `Running ${toolName} for "${query}"` : `Running ${toolName}...`,
			query
		};
	}

	function getToolSourceList(
		toolCall: ToolCall
	): Array<{ title: string; url?: string; page?: number | null; type?: string }> {
		if (!toolCall.output || typeof toolCall.output !== 'object') return [];
		const output = toolCall.output as Record<string, unknown>;
		const details = output.details as Record<string, unknown> | undefined;
		if (details && Array.isArray(details.sources)) {
			return details.sources as Array<{
				title: string;
				url?: string;
				page?: number | null;
				type?: string;
			}>;
		}
		return [];
	}

	function getToolResultSummary(toolCall: ToolCall): string {
		const sources = getToolSourceList(toolCall);
		if (toolCall.toolName === 'project_knowledge_search') {
			if (sources.length > 0) {
				return `${sources.length} document${sources.length === 1 ? '' : 's'} referenced`;
			}
			return 'Search completed';
		}
		if (toolCall.toolName === 'web_search') {
			if (sources.length > 0) {
				return `${sources.length} source${sources.length === 1 ? '' : 's'} found`;
			}
			return 'Search completed';
		}
		return 'Completed';
	}

	function getTurnSources(
		msgIndex: number
	): Array<{ title: string; url: string; snippet?: string }> {
		const target = messages[msgIndex];
		if (!target || target.role !== 'assistant') return [];

		const collected: Array<{ title: string; url: string; snippet?: string }> = [];
		const seenUrls = new SvelteSet<string>();

		function addFromToolCalls(toolCalls?: ToolCall[]) {
			if (!toolCalls) return;
			for (const tc of toolCalls) {
				const sources = getToolSourceList(tc);
				for (const s of sources) {
					if (s.url && /^https?:\/\//i.test(s.url) && !seenUrls.has(s.url)) {
						seenUrls.add(s.url);
						collected.push({
							title: s.title || s.url,
							url: s.url,
							snippet: ''
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

	let activeAgentActivity = $derived.by(() => {
		if (!running) return '';
		for (let i = messages.length - 1; i >= 0; i--) {
			const msg = messages[i];
			if (msg.role === 'assistant') {
				const runningTool = msg.toolCalls?.find((t) => t.status === 'running');
				if (runningTool) {
					return formatToolLabel(runningTool.toolName, runningTool.input).action;
				}
				if (msg.isStreaming) {
					if (thinkingText(msg.content) && !contentText(msg.content)) {
						return 'Thinking...';
					}
					if (contentText(msg.content)) {
						return 'Responding...';
					}
				}
			}
		}
		return 'Working...';
	});

	function notify(value: string) {
		toast = value;
		setTimeout(() => (toast = ''), 1800);
	}

	function contentText(content: unknown): string {
		if (typeof content === 'string') return content;
		if (Array.isArray(content))
			return content
				.filter((part) => (typeof part === 'string' ? true : part?.type !== 'thinking'))
				.map((part) => (typeof part === 'string' ? part : (part?.text ?? '')))
				.join('');
		return '';
	}

	function thinkingText(content: unknown): string {
		if (!Array.isArray(content)) return '';
		return content
			.filter((part) => part && typeof part === 'object' && part.type === 'thinking')
			.map((part) => (typeof part.thinking === 'string' ? part.thinking : ''))
			.filter(Boolean)
			.join('\n')
			.trim();
	}

	function modelRef(model: ModelOption) {
		return `${model.provider}/${model.id}`;
	}

	function modelId(modelRefValue: string) {
		return modelRefValue.split('/').slice(1).join('/') || modelRefValue;
	}

	let configuredModels = $derived(
		models.filter((model) => model.configured || model.userConfigured)
	);
	let pickerModels = $derived.by(() => {
		const current = activeConversation?.model;
		if (!current || configuredModels.some((model) => modelRef(model) === current))
			return configuredModels;
		const currentModel = models.find((model) => modelRef(model) === current);
		return currentModel ? [currentModel, ...configuredModels] : configuredModels;
	});
	let selectedModel = $derived(
		models.find((model) => modelRef(model) === activeConversation?.model)
	);
	let availableThinkingLevels = $derived<ThinkingLevel[]>(
		selectedModel?.capabilities?.thinkingLevels ?? ['off']
	);
	let selectedThinkingLevel = $derived.by(() => {
		const saved = activeConversation?.model
			? thinkingLevelsByModel[activeConversation.model]
			: undefined;
		return saved && availableThinkingLevels.includes(saved)
			? saved
			: (availableThinkingLevels[0] ?? 'off');
	});

	async function loadModels() {
		try {
			const response = await fetch('/api/models');
			if (!response.ok) throw new Error('Could not load models');
			const data = await response.json();
			models = Array.isArray(data.models) ? data.models : [];
			const errors = Array.isArray(data.errors) ? data.errors : [];
			modelLoadError = errors
				.map((error: { message?: string }) => error.message ?? '')
				.filter(Boolean)
				.join(' ');
			if (modelLoadError) notify('Some live models could not be loaded. Check Providers.');
		} catch (error) {
			notify(error instanceof Error ? error.message : 'Could not load models');
		} finally {
			modelsLoading = false;
		}
	}

	function defaultModel() {
		const preferred = configuredModels.find((model) => modelRef(model) === 'openai/gpt-4o-mini');
		const selected = preferred ?? configuredModels[0];
		return selected ? modelRef(selected) : undefined;
	}

	async function loadConversations() {
		try {
			const response = await fetch('/api/conversations');
			if (!response.ok) throw new Error('Could not load conversations');
			const data = await response.json();
			conversations = data.conversations ?? [];
			conversationsState.setItems(conversations);
		} catch (error) {
			notify(error instanceof Error ? error.message : 'Could not load conversations');
		}
	}

	async function loadTools(projectId?: string | null) {
		const requestToken = ++toolsLoadToken;
		toolsLoading = true;
		try {
			const url = projectId ? `/api/tools?projectId=${projectId}` : '/api/tools';
			const response = await fetch(url);
			if (response.ok && requestToken === toolsLoadToken) {
				const data = await response.json();
				if (requestToken !== toolsLoadToken) return;
				availableTools = data.tools ?? [];
			}
		} catch {
			/* ignore */
		} finally {
			if (requestToken === toolsLoadToken) toolsLoading = false;
		}
	}

	async function loadThinkingPreferences() {
		try {
			const response = await fetch('/api/preferences');
			if (!response.ok) return;
			const data = await response.json();
			if (data.thinkingLevels && typeof data.thinkingLevels === 'object')
				thinkingLevelsByModel = data.thinkingLevels as Record<string, ThinkingLevel>;
		} catch {
			/* ignore */
		}
	}

	function updateChatUrl(id: string, replace = false) {
		if (typeof window === 'undefined') return;
		const url = new URL(window.location.href);
		if (
			url.searchParams.get('id') === id &&
			!url.searchParams.has('prompt') &&
			!url.searchParams.has('new')
		) {
			return;
		}
		url.searchParams.set('id', id);
		url.searchParams.delete('prompt');
		url.searchParams.delete('new');
		if (replace) {
			window.history.replaceState({}, '', url.pathname + '?' + url.searchParams.toString());
		} else {
			window.history.pushState({}, '', url.pathname + '?' + url.searchParams.toString());
		}
	}

	function handlePopState() {
		const params = new URL(window.location.href).searchParams;
		const id = params.get('id');
		const isNew = params.get('new') === '1';
		if (id && id !== activeId) {
			void loadConversation(id, true);
		} else if (isNew) {
			void startNewConversation(true);
		} else if (!id && conversations.length > 0 && conversations[0].id !== activeId) {
			void loadConversation(conversations[0].id, true);
		}
	}

	async function loadConversation(id: string, replaceUrl = false, preserveLiveState = false) {
		const loadToken = ++conversationLoadToken;
		const switching = id !== activeId;
		if (switching) {
			pendingAttachments = [];
			abortController?.abort();
			abortController = undefined;
			running = false;
			messages = [];
			availableTools = [];
			toolsLoadToken += 1;
		}
		activeId = id;
		activeConversation = conversations.find((c) => c.id === id) ?? null;
		if (!preserveLiveState) {
			liveError = '';
		}
		updateChatUrl(id, replaceUrl);
		try {
			const response = await fetch(`/api/conversations/${id}`);
			if (!response.ok) throw new Error('Could not load conversation');
			const data = await response.json();
			if (loadToken !== conversationLoadToken || activeId !== id) return;
			activeConversation = data.conversation ?? activeConversation;
			messages = (data.messages ?? []).filter(
				(m: ChatMessage) => m.role === 'user' || m.role === 'assistant'
			);
			if (activeConversation?.projectId) void loadTools(activeConversation.projectId);
			else void loadTools(null);
		} catch (error) {
			if (loadToken !== conversationLoadToken || activeId !== id) return;
			notify(error instanceof Error ? error.message : 'Could not load conversation');
			throw error;
		}
	}

	async function startNewConversation(force = false) {
		if (!force && isNewConversationEmpty) return;
		pendingAttachments = [];
		try {
			const model = defaultModel();
			const conversation = await createConversation(model ? { model } : {});
			await loadConversations();
			await loadConversation(conversation.id, false);
		} catch (error) {
			notify(error instanceof Error ? error.message : 'Backend unavailable');
		}
	}

	function startRename(conversation: ConversationSummary) {
		editingId = conversation.id;
		editingTitle = conversation.title;
	}

	function cancelRename() {
		editingId = null;
		editingTitle = '';
	}

	async function saveRename(id: string) {
		const newTitle = editingTitle.trim();
		if (!newTitle) {
			notify('Title cannot be empty');
			return;
		}
		try {
			const updated = await updateConversation(id, { title: newTitle });
			conversations = conversations.map((c) => (c.id === id ? { ...c, title: updated.title } : c));
			conversationsState.updateTitle(id, updated.title);
			if (activeConversation && activeConversation.id === id) {
				activeConversation = { ...activeConversation, title: updated.title };
			}
			editingId = null;
			notify('Conversation renamed');
		} catch (error) {
			notify(error instanceof Error ? error.message : 'Could not rename conversation');
		}
	}

	function promptDelete(conversation: ConversationSummary) {
		deletingConversation = conversation;
	}

	function cancelDelete() {
		deletingConversation = null;
	}

	async function confirmDelete() {
		if (!deletingConversation) return;
		const id = deletingConversation.id;
		deleteLoading = true;
		try {
			await deleteConversation(id);
			conversations = conversations.filter((c) => c.id !== id);
			conversationsState.remove(id);
			notify('Conversation deleted');
			const wasActive = activeId === id;
			deletingConversation = null;

			if (wasActive) {
				if (conversations.length > 0) {
					await loadConversation(conversations[0].id, false);
				} else {
					await startNewConversation(true);
				}
			}
		} catch (error) {
			notify(error instanceof Error ? error.message : 'Could not delete conversation');
		} finally {
			deleteLoading = false;
		}
	}

	function handleWindowKeydown(event: KeyboardEvent) {
		if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'k') {
			event.preventDefault();
			if (!isNewConversationEmpty && !running) {
				void startNewConversation();
			}
		}
		if (event.key === 'Escape') {
			if (deletingConversation) cancelDelete();
			if (editingId) cancelRename();
		}
	}

	onMount(async () => {
		await Promise.all([loadModels(), loadConversations(), loadTools(), loadThinkingPreferences()]);
		const params = new URL(window.location.href).searchParams;
		const requested = params.get('id');
		const pendingPrompt = params.get('prompt');
		const isNew = params.get('new') === '1';

		if (requested) {
			try {
				await loadConversation(requested, true);
			} catch {
				if (conversations.length > 0) {
					await loadConversation(conversations[0].id, true);
				} else {
					await startNewConversation(true);
				}
			}
		} else if (isNew) {
			await startNewConversation(true);
		} else if (conversations.length > 0) {
			await loadConversation(conversations[0].id, true);
		} else {
			await startNewConversation(true);
		}
		busy = false;
		if (pendingPrompt) {
			message = pendingPrompt;
			await sendMessage();
		}
	});

	async function selectModel(model: string) {
		if (!activeId || model === activeConversation?.model) return;
		modelSaving = true;
		try {
			const response = await fetch(`/api/conversations/${activeId}`, {
				method: 'PATCH',
				headers: { 'content-type': 'application/json' },
				body: JSON.stringify({ model })
			});
			if (!response.ok)
				throw new Error(
					(await response.json().catch(() => null))?.error?.message ?? 'Could not select model'
				);
			const data = await response.json();
			activeConversation = data.conversation;
			conversations = conversations.map((conversation) =>
				conversation.id === activeId ? data.conversation : conversation
			);
			notify('Model selected');
		} catch (error) {
			notify(error instanceof Error ? error.message : 'Could not select model');
		} finally {
			modelSaving = false;
		}
	}

	async function selectThinkingLevel(level: string) {
		const model = activeConversation?.model;
		if (!activeId || !model || !availableThinkingLevels.includes(level as ThinkingLevel)) return;
		const nextLevel = level as ThinkingLevel;
		const previousLevel = thinkingLevelsByModel[model];
		thinkingLevelsByModel = { ...thinkingLevelsByModel, [model]: nextLevel };
		thinkingSaving = true;
		try {
			const response = await fetch('/api/preferences', {
				method: 'PUT',
				headers: { 'content-type': 'application/json' },
				body: JSON.stringify({ model, thinkingLevel: nextLevel })
			});
			if (!response.ok)
				throw new Error(
					(await response.json().catch(() => null))?.error?.message ??
						'Could not save thinking level'
				);
			notify('Thinking level saved');
		} catch (error) {
			if (previousLevel)
				thinkingLevelsByModel = { ...thinkingLevelsByModel, [model]: previousLevel };
			else {
				const restored = { ...thinkingLevelsByModel };
				delete restored[model];
				thinkingLevelsByModel = restored;
			}
			notify(error instanceof Error ? error.message : 'Could not save thinking level');
		} finally {
			thinkingSaving = false;
		}
	}

	async function toggleTool(toolName: string, enable: boolean) {
		if (!activeId || !activeConversation) return;
		const toolObj = displayTools.find((t) => t.name === toolName);
		if (toolObj?.readOnly) return;
		const conversation = activeConversation;
		const current = conversation.enabledTools ?? [];
		const updated = enable
			? [...new Set([...current, toolName])]
			: current.filter((t) => t !== toolName);

		activeConversation = { ...conversation, enabledTools: updated };
		conversations = conversations.map((c) =>
			c.id === activeId ? { ...c, enabledTools: updated } : c
		);

		try {
			const response = await fetch(`/api/conversations/${activeId}`, {
				method: 'PATCH',
				headers: { 'content-type': 'application/json' },
				body: JSON.stringify({ enabledTools: updated })
			});
			if (!response.ok) throw new Error('Could not update tools');
			const data = await response.json();
			if (data.conversation) {
				activeConversation = data.conversation;
				conversations = conversations.map((c) => (c.id === activeId ? data.conversation : c));
			}
			const label = toolObj?.label ?? toolName;
			notify(enable ? `${label} enabled` : `${label} disabled`);
		} catch (error) {
			notify(error instanceof Error ? error.message : 'Could not update tools');
			if (activeConversation) {
				activeConversation = { ...activeConversation, enabledTools: current };
			}
			conversations = conversations.map((c) =>
				c.id === activeId ? { ...c, enabledTools: current } : c
			);
		}
	}

	function formatTime(iso: string) {
		return new Date(iso).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
	}

	function formatFileSize(bytes: number) {
		return bytes > 1024 * 1024
			? `${(bytes / 1024 / 1024).toFixed(1)} MB`
			: `${Math.max(1, Math.round(bytes / 1024))} KB`;
	}

	function addAttachments(selected: FileList | null) {
		if (!selected || selected.length === 0) return;
		const allowed = /\.(txt|md|json|pdf)$/i;
		const accepted: File[] = [];
		for (const file of Array.from(selected)) {
			if (!allowed.test(file.name)) {
				notify(`${file.name}: file type is not supported`);
				continue;
			}
			if (file.size > 25 * 1024 * 1024) {
				notify(`${file.name}: file exceeds 25 MB`);
				continue;
			}
			accepted.push(file);
		}
		const combined = [...pendingAttachments, ...accepted];
		if (combined.length > 5) {
			notify('Attach up to 5 files per message');
			return;
		}
		if (combined.reduce((total, file) => total + file.size, 0) > 25 * 1024 * 1024) {
			notify('Attachments must total 25 MB or less');
			return;
		}
		pendingAttachments = combined;
		if (fileInput) fileInput.value = '';
	}

	function removeAttachment(index: number) {
		pendingAttachments = pendingAttachments.filter((_, itemIndex) => itemIndex !== index);
	}

	function handleStreamEvent(event: SseEvent) {
		if (event.type === 'message.start') {
			if (event.role === 'assistant') {
				const msgId = String(event.messageId);
				const existing = messages.find((m) => m.id === msgId);
				if (!existing) {
					messages = [
						...messages,
						{
							id: msgId,
							role: 'assistant',
							content: '',
							createdAt:
								typeof event.createdAt === 'string' ? event.createdAt : new Date().toISOString(),
							toolCalls: [],
							isStreaming: true
						}
					];
				}
			}
		} else if (event.type === 'thinking.delta') {
			const msgId = String(event.messageId);
			const delta = String(event.delta ?? '');
			let found = false;
			messages = messages.map((msg) => {
				if (msg.id !== msgId) return msg;
				found = true;
				let currentThinking = thinkingText(msg.content);
				let currentText = contentText(msg.content);
				currentThinking += delta;
				return {
					...msg,
					content: [
						{ type: 'thinking', thinking: currentThinking },
						...(currentText ? [{ type: 'text', text: currentText }] : [])
					],
					isStreaming: true
				};
			});
			if (!found) {
				messages = [
					...messages,
					{
						id: msgId,
						role: 'assistant',
						content: [{ type: 'thinking', thinking: delta }],
						createdAt: new Date().toISOString(),
						toolCalls: [],
						isStreaming: true
					}
				];
			}
		} else if (event.type === 'message.delta') {
			const msgId = String(event.messageId);
			const delta = String(event.delta ?? '');
			let found = false;
			messages = messages.map((msg) => {
				if (msg.id !== msgId) return msg;
				found = true;
				let currentThinking = thinkingText(msg.content);
				let currentText = contentText(msg.content);
				currentText += delta;
				return {
					...msg,
					content: currentThinking
						? [
								{ type: 'thinking', thinking: currentThinking },
								{ type: 'text', text: currentText }
							]
						: currentText,
					isStreaming: true
				};
			});
			if (!found) {
				messages = [
					...messages,
					{
						id: msgId,
						role: 'assistant',
						content: delta,
						createdAt: new Date().toISOString(),
						toolCalls: [],
						isStreaming: true
					}
				];
			}
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
				startedAt: new Date().toISOString()
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
		} else if (event.type === 'tool.end') {
			const toolCallId = String(event.toolCallId);
			const status = event.status === 'failed' ? 'failed' : 'completed';
			const result = event.result;
			messages = messages.map((msg) => {
				if (!msg.toolCalls?.some((c) => c.toolCallId === toolCallId)) return msg;
				return {
					...msg,
					toolCalls: msg.toolCalls.map((c) =>
						c.toolCallId === toolCallId
							? {
									...c,
									status,
									output: result,
									completedAt: new Date().toISOString()
								}
							: c
					)
				};
			});
		} else if (event.type === 'message.end') {
			lastFailedSubmission = null;
			const msgId = String(event.messageId);
			messages = messages.map((msg) =>
				msg.id === msgId
					? {
							...msg,
							isStreaming: false,
							content: event.content !== undefined ? event.content : msg.content
						}
					: msg
			);
		} else if (event.type === 'error') {
			liveError = extractSseErrorMessage(event.error);
			messages = messages.map((msg) => ({ ...msg, isStreaming: false }));
		}
	}

	async function sendMessage() {
		if (running) return;
		const content = message.trim();
		if ((!content && pendingAttachments.length === 0) || !activeId) {
			notify(!activeId ? 'No active conversation' : 'Type a message or attach a file first');
			return;
		}
		const filesToSend = pendingAttachments;
		lastFailedSubmission = {
			conversationId: activeId,
			content,
			files: filesToSend
		};
		conversationLoadToken += 1;
		running = true;
		liveError = '';
		message = '';
		pendingAttachments = [];
		userAtBottom = true;
		const attachmentTimestamp = Date.now();
		messages = [
			...messages,
			{
				id: `${activeId}:user:${Date.now()}`,
				role: 'user',
				content,
				attachments: filesToSend.map((file, index) => ({
					id: `${activeId}:attachment:${attachmentTimestamp}:${index}`,
					filename: file.name,
					mimeType: file.type || 'application/octet-stream',
					sizeBytes: file.size
				})),
				createdAt: new Date().toISOString()
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
					if (activeId !== streamConversationId || abortController !== streamAbortController)
						return;
					handleStreamEvent(event);
				},
				abortController.signal,
				activeConversation?.model,
				filesToSend
			);
		} catch (error) {
			if (activeId !== streamConversationId || abortController !== streamAbortController) return;
			if ((error as Error).name !== 'AbortError') {
				pendingAttachments = filesToSend;
				const errMsg = error instanceof Error ? error.message : 'Agent error';
				liveError = errMsg;
				notify(errMsg);
			}
		} finally {
			if (activeId === streamConversationId && abortController === streamAbortController) {
				messages = messages.map((msg) => ({ ...msg, isStreaming: false }));
				const completedLoadToken = conversationLoadToken;
				await loadConversations();
				if (
					activeId === streamConversationId &&
					abortController === streamAbortController &&
					completedLoadToken === conversationLoadToken
				)
					await loadConversation(streamConversationId, false, true).catch(() => {});
				if (abortController === streamAbortController) {
					abortController = undefined;
					running = false;
				}
			}
		}
	}

	async function retryLastMessage() {
		if (running || !activeId) return;
		const streamConversationId = activeId;
		const lastUserIdx = messages.findLastIndex((m) => m.role === 'user');
		if (lastUserIdx === -1) {
			if (lastFailedSubmission && lastFailedSubmission.conversationId === activeId) {
				message = lastFailedSubmission.content;
				pendingAttachments = lastFailedSubmission.files;
				await sendMessage();
				return;
			}
			notify('No message to retry');
			return;
		}

		// Strip any trailing assistant messages locally
		messages = messages.slice(0, lastUserIdx + 1);

		conversationLoadToken += 1;
		running = true;
		liveError = '';
		userAtBottom = true;
		abortController = new AbortController();
		const streamAbortController = abortController;

		try {
			await streamRetry(
				activeId,
				(event) => {
					if (activeId !== streamConversationId || abortController !== streamAbortController)
						return;
					handleStreamEvent(event);
				},
				abortController.signal,
				activeConversation?.model
			);
		} catch (error) {
			if (activeId !== streamConversationId || abortController !== streamAbortController) return;
			if ((error as Error).name !== 'AbortError') {
				const errMsg = error instanceof Error ? error.message : 'Agent error';
				liveError = errMsg;
				notify(errMsg);
			}
		} finally {
			if (activeId === streamConversationId && abortController === streamAbortController) {
				messages = messages.map((msg) => ({ ...msg, isStreaming: false }));
				const completedLoadToken = conversationLoadToken;
				await loadConversations();
				if (
					activeId === streamConversationId &&
					abortController === streamAbortController &&
					completedLoadToken === conversationLoadToken
				)
					await loadConversation(streamConversationId, false, true).catch(() => {});
				if (abortController === streamAbortController) {
					abortController = undefined;
					running = false;
				}
			}
		}
	}

	async function stopMessage() {
		const stoppingId = activeId;
		const stoppingController = abortController;
		stoppingController?.abort();
		if (stoppingId) await stopConversation(stoppingId).catch(() => {});
		if (activeId === stoppingId && (!abortController || abortController === stoppingController)) {
			messages = messages.map((msg) => ({ ...msg, isStreaming: false }));
			notify('Generation stopped');
		}
	}

	function onKeydown(event: KeyboardEvent) {
		if (event.key === 'Enter' && !event.shiftKey) {
			event.preventDefault();
			if (!running) sendMessage();
		}
	}

	async function logout() {
		await authClient.signOut();
		window.location.href = '/login';
	}
</script>

<svelte:head><title>Mimin WebUI | Chat</title></svelte:head>
<svelte:window onpopstate={handlePopState} onkeydown={handleWindowKeydown} />
<div
	class="app-shell"
	class:sidebar-collapsed={sidebar.collapsed}
	class:mobile-open={sidebar.mobileOpen}
>
	<button
		class="sidebar-backdrop"
		onclick={() => sidebar.closeMobile()}
		aria-label="Close sidebar"
		tabindex="-1"
	></button>
	<aside class="sidebar">
		<div class="sidebar-top-row">
			<div class="brand">
				<span class="brand-mark"><Sparkles size={13} /></span><span>mimin</span><span
					class="brand-muted">/ workbench</span
				>
			</div>
			<button
				class="sidebar-toggle"
				onclick={() => sidebar.toggle()}
				title="Collapse sidebar"
				aria-label="Collapse sidebar"><PanelLeft size={16} /></button
			>
		</div>
		<button
			class="new-chat"
			disabled={isNewConversationEmpty || running}
			title={isNewConversationEmpty ? 'Already on a new conversation' : 'New chat'}
			onclick={() => {
				sidebar.closeMobile();
				startNewConversation();
			}}
		>
			<Plus size={16} /> New chat <kbd>⌘ K</kbd>
		</button>
		<div class="sidebar-scroll">
			<div class="nav-label">Workspace</div>
			<a class="nav-item active" href={resolve('/chat')}
				><MessageSquare size={16} /> Chat <span class="nav-count">{conversations.length}</span></a
			>
			<a class="nav-item" href={resolve('/projects')}><FolderKanban size={16} /> Projects</a>
			{#if user?.role === 'admin'}<a class="nav-item" href={resolve('/admin/users')}
					><User size={16} /> Users</a
				>{/if}
			<div class="nav-label projects-label">Preferences</div>
			<a class="nav-item" href={resolve('/settings')}><Settings size={16} /> Models</a>
			<a class="nav-item" href={resolve('/settings/web-search')}><Globe size={16} /> Web Search</a>
			<a class="nav-item" href={resolve('/settings/browser-extension')}
				><Puzzle size={16} /> Browser Extension</a
			>
			<RecentChats
				{conversations}
				{activeId}
				onSelectChat={loadConversation}
				onStartRename={startRename}
				onPromptDelete={promptDelete}
				{editingId}
				bind:editingTitle
				onSaveRename={saveRename}
				onCancelRename={cancelRename}
			/>
		</div>
		<div class="sidebar-bottom">
			<div class="user-row">
				<span class="avatar">{user?.name?.[0]?.toUpperCase() ?? 'F'}</span>
				<div class="user-meta">
					<strong>{user?.name ?? 'Fadhil'}</strong>
					<small>Personal workspace</small>
				</div>
				<button class="logout-btn" onclick={logout} title="Log out" aria-label="Log out">
					<LogOut size={15} />
				</button>
			</div>
		</div>
	</aside>
	<main class="main-content" bind:this={scrollEl} onscroll={handleScroll}>
		<header class="topbar">
			<div class="topbar-left">
				<button
					class="sidebar-toggle topbar-toggle"
					onclick={() => sidebar.toggle()}
					title="Toggle sidebar"
					aria-label="Toggle sidebar"><PanelLeft size={16} /></button
				>
				<div class="breadcrumb">
					<strong>Chat</strong><ChevronDown size={14} /><span
						>{activeConversation?.title ?? 'New session'}</span
					>
				</div>
			</div>
			<div class="top-actions">
				<button
					class="icon-button"
					aria-label="Search conversations"
					title="Search conversations"
					onclick={() => notify('Search opened')}><Search size={17} /></button
				>
				<ThemeToggle />
			</div>
		</header>
		<div class="chat-wrap">
			<div class="chat-title">
				<span class="ready" class:working={running}>
					<i></i>
					{running
						? activeAgentActivity
							? `working · ${activeAgentActivity.toLowerCase()}`
							: 'working'
						: 'ready'}
				</span>
				<h1>{activeConversation?.title ?? 'New conversation'}</h1>
				<p>
					{activeConversation?.model
						? modelId(activeConversation.model)
						: 'Pick a model'}{activeConversation && activeConversation.enabledTools?.length
						? ` · ${activeConversation.enabledTools.join(', ')}`
						: ''}
				</p>
			</div>
			{#if busy}
				<div class="empty-state" role="status">Loading conversations...</div>
			{:else if messages.length === 0}
				<div class="empty-state">Ask something to start a conversation.</div>
			{/if}
			{#each messages as msg, i (msg.id)}
				<article
					class="message"
					class:assistant-message={msg.role === 'assistant'}
					aria-label={`${msg.role === 'user' ? 'Your' : 'Mimin'} message`}
				>
					<div class="message-label">
						<div class="message-label-header">
							{#if msg.role === 'user'}
								<UserRound size={14} aria-hidden="true" />
								<span>YOU</span>
							{:else}
								<Bot size={14} aria-hidden="true" />
								<span>MIMIN</span>
							{/if}
							<time datetime={msg.createdAt}>{formatTime(msg.createdAt)}</time>
						</div>
						{#if msg.role === 'user' && i === messages.length - 1 && canRetry}
							<button
								type="button"
								class="message-retry-btn"
								onclick={retryLastMessage}
								disabled={running}
								title="Retry last message"
								aria-label="Retry last message"
							>
								<RotateCcw size={11} aria-hidden="true" />
								<span>Retry</span>
							</button>
						{/if}
						{#if msg.role === 'assistant' && msg.isStreaming}
							<span class="live-tag">
								{#if msg.toolCalls?.some((t) => t.status === 'running')}
									{formatToolLabel(
										msg.toolCalls.find((t) => t.status === 'running')!.toolName,
										msg.toolCalls.find((t) => t.status === 'running')!.input
									).action.toLowerCase()}
								{:else if thinkingText(msg.content) && !contentText(msg.content)}
									thinking...
								{:else if contentText(msg.content)}
									responding...
								{:else}
									working...
								{/if}
							</span>
						{/if}
					</div>
					<div class="message-body">
						{#if msg.attachments?.length}
							<div class="attachment-list message-attachments" aria-label="Attached files">
								{#each msg.attachments as attachment (attachment.id)}
									<div class="attachment-chip">
										<Paperclip size={13} aria-hidden="true" />
										<span>{attachment.filename}</span><small>
											{formatFileSize(
												attachment.sizeBytes
											)}{#if attachment.extractionStatus === 'failed'}
												· text unavailable{:else if attachment.extractionStatus === 'empty'}
												· no text{:else if attachment.extractionStatus}
												· ready{/if}
										</small>
									</div>
								{/each}
							</div>
						{/if}
						{#if msg.role === 'assistant' && thinkingText(msg.content)}
							<details class="thinking-block" open={msg.isStreaming && !contentText(msg.content)}>
								<summary class="thinking-summary">
									<Sparkles size={13} />
									<span>Thinking process</span>
									{#if msg.isStreaming && !contentText(msg.content)}
										<span class="thinking-live-dot"></span>
									{/if}
									<ChevronDown size={13} class="chevron" />
								</summary>
								<div class="thinking-content">{thinkingText(msg.content)}</div>
							</details>
						{/if}
						{#if contentText(msg.content)}
							{#if msg.role === 'assistant'}
								<Markdown content={contentText(msg.content)} sources={getTurnSources(i)} />
							{:else}
								<p>{contentText(msg.content)}</p>
							{/if}
						{:else if msg.role === 'assistant' && msg.isStreaming && !thinkingText(msg.content) && (!msg.toolCalls || msg.toolCalls.length === 0)}
							<p class="response-text thinking"><span class="pulse-dot"></span> Thinking...</p>
						{/if}
						{#if msg.toolCalls && msg.toolCalls.length > 0}
							<div class="tool-calls-container" aria-label="Tool executions">
								{#each msg.toolCalls as toolCall (toolCall.toolCallId || toolCall.id || toolCall.toolName)}
									{@const toolMeta = formatToolLabel(toolCall.toolName, toolCall.input)}
									<details
										class="tool-call-card"
										class:tool-running={toolCall.status === 'running'}
										class:tool-failed={toolCall.status === 'failed'}
									>
										<summary class="tool-call-summary">
											<div class="tool-call-icon">
												{#if toolCall.toolName === 'project_knowledge_search'}
													<FolderKanban size={13} />
												{:else if toolCall.toolName === 'web_search'}
													<Globe size={13} />
												{:else}
													<Wrench size={13} />
												{/if}
											</div>
											<div class="tool-call-info">
												<span class="tool-call-label">{toolMeta.label}</span>
												{#if toolMeta.query}
													<span class="tool-call-query">"{toolMeta.query}"</span>
												{/if}
											</div>
											<div class="tool-call-status">
												{#if toolCall.status === 'running'}
													<span class="tool-status-badge running">
														<span class="pulse-dot"></span> Running...
													</span>
												{:else if toolCall.status === 'failed'}
													<span class="tool-status-badge failed">Failed</span>
												{:else}
													<span class="tool-status-badge completed">
														<Check size={11} />
														{getToolResultSummary(toolCall)}
													</span>
												{/if}
												<ChevronDown size={12} class="tool-chevron" />
											</div>
										</summary>
										<div class="tool-call-details">
											{#if toolCall.input}
												<div class="tool-detail-section">
													<span class="tool-detail-heading">Input Parameters</span>
													<pre class="tool-json">{JSON.stringify(toolCall.input, null, 2)}</pre>
												</div>
											{/if}
											{#if toolCall.output}
												<div class="tool-detail-section">
													<span class="tool-detail-heading">Result</span>
													{#if getToolSourceList(toolCall).length > 0}
														<div class="tool-source-chips">
															{#each getToolSourceList(toolCall) as src (src.title + src.url + src.page)}
																<div class="tool-source-chip">
																	{#if src.type === 'project_file'}
																		<FileText size={12} />
																		<span>{src.title}{src.page ? ` (p. ${src.page})` : ''}</span>
																	{:else}
																		<Globe size={12} />
																		<!-- eslint-disable-next-line svelte/no-navigation-without-resolve -->
																		<a href={src.url} target="_blank" rel="noopener noreferrer"
																			>{src.title || src.url}</a
																		>
																	{/if}
																</div>
															{/each}
														</div>
													{:else}
														<pre class="tool-json">{typeof toolCall.output === 'string'
																? toolCall.output
																: JSON.stringify(toolCall.output, null, 2)}</pre>
													{/if}
												</div>
											{/if}
										</div>
									</details>
								{/each}
							</div>
						{/if}
					</div>
				</article>
			{/each}
			{#if liveError}
				<div class="inline-error" role="alert">
					<div class="inline-error-content">
						<strong>Agent error</strong>
						<span class="inline-error-text">{liveError}</span>
					</div>
					{#if canRetry}
						<button
							type="button"
							class="inline-error-retry"
							onclick={retryLastMessage}
							disabled={running}
							title="Retry last message"
							aria-label="Retry last message"
						>
							<RotateCcw size={13} aria-hidden="true" />
							<span>Retry</span>
						</button>
					{/if}
				</div>
			{/if}
			<div class="composer-container">
				<div class="chat-composer">
					{#if pendingAttachments.length}
						<div class="attachment-list" aria-label="Files to attach">
							{#each pendingAttachments as file, index (file.name + file.size + index)}
								<div class="attachment-chip pending-attachment">
									<Paperclip size={13} aria-hidden="true" />
									<span>{file.name}</span><small>{formatFileSize(file.size)}</small>
									<button
										type="button"
										class="remove-attachment"
										aria-label={`Remove ${file.name}`}
										title={`Remove ${file.name}`}
										onclick={() => removeAttachment(index)}><X size={13} /></button
									>
								</div>
							{/each}
						</div>
					{/if}
					<textarea
						bind:value={message}
						aria-label="Message Mimin"
						placeholder={running
							? 'Mimin is responding...'
							: 'Ask Mimin to think, write, or plan...'}
						disabled={running}
						onkeydown={onKeydown}></textarea>
					<div class="composer-row">
						<div class="composer-tools">
							<input
								bind:this={fileInput}
								type="file"
								multiple
								accept=".txt,.md,.json,.pdf"
								hidden
								onchange={(event) => addAttachments(event.currentTarget.files)}
							/>
							<button
								class="control"
								title="Attach files"
								disabled={running}
								onclick={() => fileInput?.click()}><Paperclip size={15} /> File</button
							>
							<ModelPicker
								models={pickerModels}
								value={activeConversation?.model ?? ''}
								loading={modelsLoading}
								disabled={running || !activeId || modelSaving || configuredModels.length === 0}
								placeholder={configuredModels.length
									? 'Pick a model'
									: modelLoadError
										? 'Models unavailable'
										: 'Configure a provider'}
								onselect={selectModel}
							/>
							<select
								class="control thinking-level-control"
								value={selectedThinkingLevel}
								disabled={running || thinkingSaving || !activeId || !activeConversation?.model}
								aria-label="Thinking level"
								title="Thinking level"
								onchange={(event) => selectThinkingLevel(event.currentTarget.value)}
							>
								{#each availableThinkingLevels as level (level)}
									<option value={level}>
										{level === 'off'
											? 'Thinking off'
											: `${level[0].toUpperCase()}${level.slice(1)}`}
									</option>
								{/each}
							</select>
							<ToolPicker
								tools={displayTools}
								enabledTools={activeConversation?.enabledTools ?? []}
								loading={toolsLoading}
								disabled={running || !activeId}
								ontoggle={toggleTool}
							/>
						</div>
						<button
							class="send-button"
							class:stop={running}
							aria-label={running ? 'Stop generation' : 'Send message'}
							title={running ? 'Stop generation' : 'Send message'}
							onclick={() => (running ? stopMessage() : sendMessage())}
							>{#if running}<Square size={13} />{:else}<ArrowUp size={16} />{/if}</button
						>
					</div>
				</div>
			</div>
		</div>
	</main>
</div>
{#if deletingConversation}
	<div
		class="modal-backdrop"
		role="dialog"
		aria-modal="true"
		tabindex="-1"
		onclick={(e) => {
			if (e.target === e.currentTarget) cancelDelete();
		}}
		onkeydown={(e) => {
			if (e.key === 'Escape') cancelDelete();
		}}
	>
		<div class="modal" role="document">
			<div class="modal-head">
				<h2>Delete chat</h2>
				<button class="icon-button" onclick={cancelDelete} aria-label="Close dialog">
					<X size={16} />
				</button>
			</div>
			<p class="modal-text">
				Are you sure you want to delete <strong>"{deletingConversation.title}"</strong>? This will
				permanently remove all messages in this conversation.
			</p>
			<div class="modal-actions">
				<button class="button" onclick={cancelDelete} disabled={deleteLoading}>Cancel</button>
				<button class="button danger" onclick={confirmDelete} disabled={deleteLoading}>
					{deleteLoading ? 'Deleting...' : 'Delete'}
				</button>
			</div>
		</div>
	</div>
{/if}
{#if toast}<div class="toast" role="status" aria-live="polite">{toast}</div>{/if}

<style>
	.new-chat:disabled {
		opacity: 0.5;
		cursor: not-allowed;
		transform: none;
		box-shadow: none;
	}
	.modal-text {
		margin: 0 0 16px;
		color: var(--text-body);
		font-size: var(--text-sm);
		line-height: 1.5;
	}
	.chat-wrap {
		width: 100%;
		min-height: calc(100dvh - 66px);
		display: flex;
		flex-direction: column;
		padding: 34px 44px 20px;
	}
	.chat-title {
		padding-bottom: 24px;
		border-bottom: 1px solid var(--border);
	}
	.chat-title h1 {
		font-family: var(--font-body);
		font-size: var(--text-xl);
		font-weight: 600;
		line-height: 1.25;
		letter-spacing: -0.02em;
		color: var(--text-strong);
		margin: 8px 0 4px;
	}
	.chat-title p {
		color: var(--text-muted);
		font-size: var(--text-sm);
		margin: 0;
	}
	.ready {
		float: right;
		color: var(--status-ok-text);
		border: 1px solid color-mix(in srgb, var(--status-ok-dot) 35%, transparent);
		padding: 4px 7px;
		border-radius: 5px;
		font-size: var(--text-xs);
		line-height: 1.2;
	}
	.ready i {
		display: inline-block;
		width: 6px;
		height: 6px;
		background: var(--status-ok-dot);
		border-radius: 50%;
		margin-right: 4px;
	}
	.ready.working {
		color: var(--status-working-text);
		border-color: color-mix(in srgb, var(--status-working-dot) 40%, transparent);
	}
	.empty-state {
		flex: 1;
		display: flex;
		align-items: center;
		justify-content: center;
		text-align: center;
		color: var(--text-dim);
		font-size: var(--text-sm);
		padding: 42px 0 10px;
	}
	.message {
		display: grid;
		grid-template-columns: 130px 1fr;
		gap: 24px;
		padding: 24px 0;
		border-bottom: 1px solid var(--border);
	}
	.assistant-message {
		margin-inline: -14px;
		padding-inline: 14px;
		background: color-mix(in srgb, var(--surface-3) 52%, transparent);
		border-bottom-color: transparent;
	}
	.assistant-message + .message {
		border-top: 1px solid var(--border);
	}
	.message-label {
		display: flex;
		flex-direction: column;
		align-items: flex-start;
		gap: 3px;
		color: var(--text-dim);
		font-size: var(--text-xs);
		flex-shrink: 0;
		min-width: 0;
	}
	.message-label-header {
		display: flex;
		align-items: center;
		gap: 6px;
		white-space: nowrap;
	}
	.message-label time {
		color: var(--text-faint);
		margin-left: 2px;
		font-variant-numeric: tabular-nums;
	}
	.message p {
		margin: 0;
		color: var(--text-body);
		line-height: 1.6;
		white-space: pre-wrap;
		font-family: var(--font-body);
	}
	.attachment-list {
		display: flex;
		flex-wrap: wrap;
		gap: 6px;
		margin-bottom: 10px;
	}
	.attachment-chip {
		display: inline-flex;
		align-items: center;
		gap: 6px;
		max-width: 100%;
		padding: 6px 8px;
		border: 1px solid var(--border);
		border-radius: 6px;
		background: var(--surface-subtle);
		color: var(--text-body);
		font-size: var(--text-xs);
	}
	.attachment-chip span {
		max-width: 220px;
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
	}
	.attachment-chip small {
		color: var(--text-faint);
		white-space: nowrap;
	}
	.remove-attachment {
		display: grid;
		place-items: center;
		padding: 1px;
		border: 0;
		background: transparent;
		color: var(--text-muted);
	}
	.remove-attachment:hover {
		color: var(--danger-text);
	}
	.message-attachments {
		margin-bottom: 12px;
	}
	.assistant-message > div:last-child {
		min-width: 0;
	}
	.response-text {
		margin: 0;
		line-height: 1.6;
		white-space: pre-wrap;
	}
	.inline-error {
		display: flex;
		align-items: center;
		justify-content: space-between;
		gap: 12px;
		background: rgba(141, 47, 38, 0.09);
		border: 1px solid rgba(141, 47, 38, 0.35);
		color: var(--danger-text);
		border-radius: 6px;
		padding: 10px 12px;
		margin: 18px 0 0;
		font-size: var(--text-sm);
	}
	.inline-error-content {
		min-width: 0;
		flex: 1;
	}
	.inline-error strong {
		display: block;
		font-size: var(--text-sm);
		margin-bottom: 2px;
	}
	.inline-error-text {
		word-break: break-word;
	}
	.inline-error-retry {
		display: inline-flex;
		align-items: center;
		gap: 6px;
		flex-shrink: 0;
		padding: 6px 12px;
		font-size: var(--text-xs);
		font-weight: 500;
		color: var(--danger-text);
		background: rgba(141, 47, 38, 0.12);
		border: 1px solid rgba(141, 47, 38, 0.4);
		border-radius: 5px;
		cursor: pointer;
		transition: all 0.15s ease;
	}
	.inline-error-retry:hover:not(:disabled) {
		background: rgba(141, 47, 38, 0.22);
		border-color: rgba(141, 47, 38, 0.6);
	}
	.inline-error-retry:disabled {
		opacity: 0.5;
		cursor: not-allowed;
	}
	.message-retry-btn {
		display: inline-flex;
		align-items: center;
		gap: 4px;
		margin-top: 4px;
		padding: 2px 7px;
		font-size: var(--text-xs);
		color: var(--text-muted);
		background: var(--surface-subtle);
		border: 1px solid var(--border);
		border-radius: 4px;
		cursor: pointer;
		transition: all 0.15s ease;
	}
	.message-retry-btn:hover:not(:disabled) {
		color: var(--text);
		border-color: var(--border-hover);
		background: var(--surface-hover);
	}
	.message-retry-btn:disabled {
		opacity: 0.5;
		cursor: not-allowed;
	}
	.thinking-block {
		margin-bottom: 10px;
		border: 1px solid var(--border);
		background: var(--surface-subtle);
		border-radius: 7px;
		font-size: var(--text-sm);
		overflow: hidden;
	}
	.thinking-summary {
		display: flex;
		align-items: center;
		gap: 6px;
		padding: 7px 11px;
		cursor: pointer;
		color: var(--text-muted);
		font-size: var(--text-xs);
		font-weight: 500;
		user-select: none;
		list-style: none;
	}
	.thinking-summary::-webkit-details-marker {
		display: none;
	}
	.thinking-summary:hover {
		color: var(--text-strong);
		background: var(--surface-hover);
	}
	:global(.thinking-summary .chevron) {
		margin-left: auto;
		transition: transform 0.18s ease;
	}
	details[open] > .thinking-summary :global(.chevron) {
		transform: rotate(180deg);
	}
	.thinking-live-dot {
		width: 6px;
		height: 6px;
		border-radius: 50%;
		background: var(--accent-bg);
		animation: pulse-glow 1s ease-in-out infinite;
	}
	.thinking-content {
		padding: 8px 12px 10px;
		border-top: 1px solid var(--border);
		color: var(--text-dim);
		font-size: var(--text-xs);
		line-height: 1.55;
		white-space: pre-wrap;
		font-family: var(--font-mono, monospace);
		max-height: 260px;
		overflow-y: auto;
	}
	.tool-calls-container {
		display: flex;
		flex-direction: column;
		gap: 8px;
		margin: 8px 0 10px;
	}
	.tool-call-card {
		border: 1px solid var(--border);
		background: var(--surface-subtle);
		border-radius: 7px;
		font-size: var(--text-xs);
		overflow: hidden;
		transition:
			border-color 0.16s ease,
			background 0.16s ease;
	}
	.tool-call-card:hover {
		border-color: var(--border-strong);
	}
	.tool-call-card.tool-running {
		border-color: color-mix(in srgb, var(--status-working-dot) 45%, transparent);
		background: color-mix(in srgb, var(--surface-3) 40%, var(--surface-subtle));
	}
	.tool-call-card.tool-failed {
		border-color: color-mix(in srgb, var(--danger-text) 35%, transparent);
	}
	.tool-call-summary {
		display: flex;
		align-items: center;
		gap: 8px;
		padding: 7px 11px;
		cursor: pointer;
		user-select: none;
		list-style: none;
		color: var(--text-body);
		font-size: var(--text-xs);
	}
	.tool-call-summary::-webkit-details-marker {
		display: none;
	}
	.tool-call-summary:hover {
		background: var(--surface-hover);
	}
	.tool-call-icon {
		display: grid;
		place-items: center;
		width: 20px;
		height: 20px;
		flex-shrink: 0;
		color: var(--text-dim);
		background: var(--surface-3);
		border-radius: 4px;
	}
	.tool-running .tool-call-icon {
		color: var(--status-working-text);
		background: color-mix(in srgb, var(--status-working-dot) 15%, transparent);
	}
	.tool-call-info {
		display: flex;
		align-items: center;
		gap: 6px;
		flex: 1 1 auto;
		min-width: 0;
		overflow: hidden;
	}
	.tool-call-label {
		font-weight: 600;
		color: var(--text-strong);
		white-space: nowrap;
		flex-shrink: 0;
	}
	.tool-call-query {
		color: var(--text-muted);
		font-style: italic;
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
	}
	.tool-call-status {
		display: flex;
		align-items: center;
		gap: 6px;
		margin-left: auto;
		flex-shrink: 0;
	}
	.tool-status-badge {
		display: inline-flex;
		align-items: center;
		gap: 4px;
		padding: 2px 6px;
		border-radius: 4px;
		font-size: 0.6875rem;
		font-weight: 500;
	}
	.tool-status-badge.running {
		color: var(--status-working-text);
		background: color-mix(in srgb, var(--status-working-dot) 15%, transparent);
	}
	.tool-status-badge.completed {
		color: var(--status-ok-text);
		background: color-mix(in srgb, var(--status-ok-dot) 15%, transparent);
	}
	.tool-status-badge.failed {
		color: var(--danger-text);
		background: color-mix(in srgb, var(--danger-bg) 15%, transparent);
	}
	:global(.tool-chevron) {
		color: var(--text-faint);
		transition: transform 0.18s ease;
	}
	details[open] > .tool-call-summary :global(.tool-chevron) {
		transform: rotate(180deg);
	}
	.tool-call-details {
		padding: 8px 12px 10px;
		border-top: 1px solid var(--border);
		display: flex;
		flex-direction: column;
		gap: 8px;
		background: var(--surface-2);
	}
	.tool-detail-section {
		display: flex;
		flex-direction: column;
		gap: 4px;
	}
	.tool-detail-heading {
		font-size: 0.6875rem;
		font-weight: 600;
		text-transform: uppercase;
		letter-spacing: 0.04em;
		color: var(--text-faint);
	}
	.tool-json {
		margin: 0;
		padding: 6px 8px;
		border-radius: 5px;
		background: var(--surface-3);
		border: 1px solid var(--border);
		color: var(--text-dim);
		font-family: var(--font-mono, monospace);
		font-size: 0.6875rem;
		line-height: 1.4;
		white-space: pre-wrap;
		word-break: break-word;
		max-height: 160px;
		overflow-y: auto;
	}
	.tool-source-chips {
		display: flex;
		flex-wrap: wrap;
		gap: 6px;
	}
	.tool-source-chip {
		display: inline-flex;
		align-items: center;
		gap: 5px;
		padding: 3px 7px;
		border-radius: 5px;
		background: var(--surface-3);
		border: 1px solid var(--border);
		font-size: var(--text-xs);
		color: var(--text-body);
	}
	.tool-source-chip a {
		color: var(--text-strong);
		text-decoration: underline;
		text-underline-offset: 2px;
	}
	.live-tag {
		font-size: var(--text-xs);
		color: var(--text-dim);
		font-style: italic;
		line-height: 1.35;
		word-break: break-word;
	}
	.thinking {
		display: inline-flex;
		align-items: center;
		gap: 8px;
		color: var(--text-muted);
		font-style: italic;
	}
	.pulse-dot {
		width: 7px;
		height: 7px;
		border-radius: 50%;
		background: var(--accent-bg);
		animation: pulse-glow 1.4s ease-in-out infinite;
	}
	@keyframes pulse-glow {
		0%,
		100% {
			opacity: 0.3;
			transform: scale(0.85);
		}
		50% {
			opacity: 1;
			transform: scale(1.2);
		}
	}
	.composer-container {
		position: sticky;
		bottom: 0;
		margin-top: auto;
		padding-top: 24px;
		padding-bottom: 20px;
		background: linear-gradient(to top, var(--bg) 80%, transparent);
		z-index: 15;
	}
	.chat-composer {
		position: relative;
		background: var(--surface);
		border: 1px solid var(--border-strong);
		border-radius: 9px;
		padding: 12px;
		box-shadow: 0 10px 28px var(--shadow-faint);
	}
	.chat-composer > .attachment-list {
		margin: 0 0 8px;
	}
	.chat-composer textarea {
		width: 100%;
		min-height: 45px;
		border: 0;
		outline: 0;
		resize: none;
		font: var(--text-base)/1.5 inherit;
		background: transparent;
	}
	.chat-composer textarea:disabled {
		opacity: 0.6;
		cursor: not-allowed;
	}
	.composer-row {
		display: flex;
		align-items: flex-end;
		justify-content: space-between;
		gap: 8px;
		border-top: 1px solid var(--border);
		padding-top: 10px;
	}
	.composer-tools {
		display: flex;
		align-items: center;
		flex-wrap: wrap;
		gap: 6px;
		flex: 1 1 auto;
		min-width: 0;
	}
	.control {
		display: inline-flex;
		align-items: center;
		gap: 6px;
		min-height: 38px;
		border: 1px solid var(--border);
		border-radius: 6px;
		background: var(--surface-subtle);
		padding: 7px 9px;
		color: var(--text-muted);
		font-size: var(--text-sm);
		transition: 0.18s ease;
	}
	.control:hover {
		color: var(--text-strong);
		border-color: var(--text-faint);
	}
	.thinking-level-control {
		max-width: 138px;
		cursor: pointer;
	}
	.thinking-level-control:disabled {
		opacity: 0.72;
		cursor: not-allowed;
	}
	.send-button {
		display: grid;
		place-items: center;
		width: 38px;
		height: 38px;
		flex: 0 0 38px;
		margin-left: auto;
		align-self: flex-end;
		border: 0;
		border-radius: 8px;
		color: var(--accent-fg);
		background: var(--accent-bg);
		transition: 0.18s ease;
	}
	.send-button:hover {
		background: var(--accent-bg-hover);
	}
	.send-button.stop {
		background: var(--danger-bg);
		color: #ffffff;
	}
	.toast {
		position: fixed;
		bottom: 22px;
		left: 50%;
		transform: translateX(-50%);
		background: var(--accent-bg);
		color: var(--accent-fg);
		font-size: var(--text-sm);
		padding: 8px 13px;
		border-radius: 6px;
		z-index: 50;
	}
	@media (max-width: 760px) {
		.chat-wrap {
			padding: 24px 14px 20px;
		}
		.message {
			grid-template-columns: 1fr;
			gap: 6px;
		}
		.ready {
			float: none;
			display: inline-flex;
		}
		.composer-row {
			gap: 6px;
			padding-top: 8px;
		}
		.composer-tools {
			gap: 5px;
		}
		.control {
			min-height: 34px;
			padding: 5px 8px;
			font-size: var(--text-xs);
		}
		.thinking-level-control {
			max-width: 110px;
		}
		.send-button {
			width: 34px;
			height: 34px;
			flex: 0 0 34px;
		}
	}
	@media (max-width: 420px) {
		.chat-wrap {
			padding-inline: 12px;
		}
		.control {
			min-height: 32px;
			padding: 4px 7px;
		}
		.thinking-level-control {
			max-width: 95px;
		}
	}
</style>
