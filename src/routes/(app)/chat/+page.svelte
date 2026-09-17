<script lang="ts">
	import { SvelteFlowProvider } from '@xyflow/svelte';
	import { onDestroy, onMount, tick } from 'svelte';
	import { toast } from 'svelte-sonner';
	import {
		answerBrowserConsent,
		answerQuestion,
		createConversation,
		deleteConversation,
		updateConversation,
		fetchConversationPage,
		fetchCanvas,
		createCanvasApi,
		updateCanvasApi,
		addCanvasSceneApi,
		updateCanvasSceneApi,
		deleteCanvasSceneApi,
		createCanvasConnectionApi,
		deleteCanvasConnectionApi,
		type BrowserConsentDecision
	} from '$lib/client/api';
	import type { CanvasDetail, CanvasScene, StyleGuideline, ViewportDevice } from '$lib/canvas';
	import CanvasWorkspace from '$lib/components/CanvasWorkspace.svelte';
	import ConfirmDialog from '$lib/components/ConfirmDialog.svelte';
	import {
		conversationSearch,
		conversationsState,
		getLastUsedModel,
		setLastUsedModel,
		type ConversationSummary
	} from '$lib/client/conversations.svelte';
	import { isBrowserBridgeEnabled } from '$lib/client/browser-bridge';
	import { shell } from '$lib/client/shell.svelte';
	import { getConversationDraft, setConversationDraft } from '$lib/client/drafts';
	import { peekNavigationHandoff, consumeNavigationHandoff } from '$lib/client/navigation-handoff';
	import type { SkillSummary } from '$lib/skills';
	import { Button } from '$lib/components/ui/button/index.js';
	import * as Tabs from '$lib/components/ui/tabs/index.js';
	import ChatComposer from './ChatComposer.svelte';
	import ChatHeader from './ChatHeader.svelte';
	import ChatInlineError from './ChatInlineError.svelte';
	import ChatTurnNotice from './ChatTurnNotice.svelte';
	import ChatMessage from './ChatMessage.svelte';
	import { createChatSettings } from './chat-settings.svelte';
	import { createChatStream } from './chat-stream.svelte';
	import { getTurnSources, contentText } from './chat-format';
	import type { Conversation, ConversationMessage, QuestionPayload } from './chat-types';

	let busy = $state(true);
	let message = $state('');
	let conversations = $state<Conversation[]>(
		conversationsState.items.map((conversation) => ({
			id: conversation.id,
			activeSkill: conversation.activeSkill ?? null,
			title: conversation.title,
			model: conversation.model ?? 'openai/gpt-4o-mini',
			enabledTools: ['web_search', 'web_fetch', 'ask_question', 'create_skill'],
			createdAt: conversation.createdAt ?? new Date().toISOString(),
			updatedAt: conversation.updatedAt ?? new Date().toISOString(),
			projectId: conversation.projectId,
			projectName: conversation.projectName
		}))
	);
	let activeId = $state('');
	let activeConversation = $state<Conversation | null>(null);
	let pendingAttachments = $state<File[]>([]);
	let editingId = $state<string | null>(null);
	let deletingConversation = $state<ConversationSummary | null>(null);
	let deleteLoading = $state(false);
	let scrollEl: HTMLElement | undefined;
	let userAtBottom = $state(true);
	let conversationLoadToken = 0;
	let conversationNavigationToken = 0;
	let conversationLoading = $state(false);
	let browserBridgeEnabled = $state(false);
	/** Cursor for the page of messages immediately above the loaded transcript. */
	let olderCursor = $state<string | null>(null);
	let hasEarlierMessages = $state(false);
	let loadingEarlier = $state(false);
	/** How many older pages the reader paged in, so a reload does not reset the cursor. */
	let earlierPagesLoaded = 0;

	// Canvas workspace state
	let activeCanvas = $state<CanvasDetail | null>(null);
	let canvasLoading = $state(false);
	let canvasOpen = $state(false);
	let mobileTab = $state<'chat' | 'canvas'>('chat');
	let splitRatio = $state(50); // percentage for chat in split view
	let isDraggingSplit = $state(false);
	let splitEl: HTMLDivElement | undefined;

	function handleSplitPointerDown(event: PointerEvent) {
		if (!splitEl || !(event.currentTarget instanceof HTMLElement)) return;
		isDraggingSplit = true;
		event.currentTarget.setPointerCapture(event.pointerId);
	}

	function handleSplitPointerMove(event: PointerEvent) {
		if (!isDraggingSplit || !splitEl) return;
		const bounds = splitEl.getBoundingClientRect();
		const availableWidth = bounds.width - 6;
		if (availableWidth <= 0) return;
		const localX = event.clientX - bounds.left - 3;
		splitRatio = Math.round(Math.max(20, Math.min(80, (localX / availableWidth) * 100)));
	}

	function handleSplitPointerUp(event: PointerEvent) {
		isDraggingSplit = false;
		if (
			event.currentTarget instanceof HTMLElement &&
			event.currentTarget.hasPointerCapture(event.pointerId)
		) {
			event.currentTarget.releasePointerCapture(event.pointerId);
		}
	}

	// Tabs.Root speaks `string`; narrow it back to the union the panes are keyed on.
	function selectMobileTab(value: string) {
		if (value === 'chat' || value === 'canvas') mobileTab = value;
	}

	async function loadCanvasForConversation(canvasId?: string | null) {
		const targetId = canvasId ?? activeConversation?.canvasId;
		if (!targetId) {
			activeCanvas = null;
			return;
		}
		canvasLoading = true;
		try {
			activeCanvas = await fetchCanvas(targetId);
		} catch (error) {
			console.error('Failed to load canvas:', error);
			activeCanvas = null;
		} finally {
			canvasLoading = false;
		}
	}

	async function handleToggleCanvas() {
		if (activeCanvas) {
			canvasOpen = !canvasOpen;
			if (canvasOpen && mobileTab === 'chat') mobileTab = 'canvas';
			return;
		}
		// If no canvas exists for this conversation yet, create one
		if (!activeId) return;
		canvasLoading = true;
		try {
			const created = await createCanvasApi({
				title: `${activeConversation?.title ?? 'Chat'} Mockup`,
				conversationId: activeId,
				projectId: activeConversation?.projectId ?? null
			});
			activeCanvas = created;
			canvasOpen = true;
			mobileTab = 'canvas';
			if (activeConversation) {
				activeConversation.canvasId = created.id;
			}
			notify('Canvas workspace created!');
		} catch (error) {
			notify(error instanceof Error ? error.message : 'Could not create canvas');
		} finally {
			canvasLoading = false;
		}
	}

	async function handleUpdateScene(sceneId: string, updates: Partial<CanvasScene>) {
		if (!activeCanvas) return;
		try {
			activeCanvas = await updateCanvasSceneApi(activeCanvas.id, sceneId, updates);
		} catch (error) {
			notify(error instanceof Error ? error.message : 'Could not update scene');
		}
	}

	async function handleCreateScene(scene: {
		name: string;
		viewport: ViewportDevice;
		positionX?: number;
		positionY?: number;
		html?: string;
		css?: string;
	}) {
		if (!activeCanvas) return;
		try {
			const res = await addCanvasSceneApi(activeCanvas.id, scene);
			activeCanvas = res.canvas;
			notify(`Scene "${scene.name}" created!`);
		} catch (error) {
			notify(error instanceof Error ? error.message : 'Could not create scene');
		}
	}

	async function handleDeleteScene(sceneId: string) {
		if (!activeCanvas) return;
		try {
			activeCanvas = await deleteCanvasSceneApi(activeCanvas.id, sceneId);
			notify('Scene deleted');
		} catch (error) {
			notify(error instanceof Error ? error.message : 'Could not delete scene');
		}
	}

	async function handleCreateConnection(sourceSceneId: string, targetSceneId: string) {
		if (!activeCanvas) return;
		try {
			activeCanvas = (
				await createCanvasConnectionApi(activeCanvas.id, { sourceSceneId, targetSceneId })
			).canvas;
		} catch (error) {
			notify(error instanceof Error ? error.message : 'Could not create connection');
		}
	}

	async function handleDeleteConnection(connectionId: string) {
		if (!activeCanvas) return;
		try {
			activeCanvas = await deleteCanvasConnectionApi(activeCanvas.id, connectionId);
		} catch (error) {
			notify(error instanceof Error ? error.message : 'Could not delete connection');
		}
	}

	async function handleUpdateGuideline(guideline: StyleGuideline) {
		if (!activeCanvas) return;
		try {
			activeCanvas = await updateCanvasApi(activeCanvas.id, { styleGuideline: guideline });
			notify('Style guideline updated');
		} catch (error) {
			notify(error instanceof Error ? error.message : 'Could not update style guideline');
		}
	}

	function handleCanvasSseEvent(event: { type: string; [key: string]: unknown }) {
		if (!activeCanvas || !event.canvasId || event.canvasId !== activeCanvas.id) return;
		// Refresh canvas from server on any agent update
		void loadCanvasForConversation(activeCanvas.id);
	}

	/**
	 * The transcript and SSE state machine of the active conversation. One
	 * instance per page load, created here so its state belongs to this page.
	 */
	const stream = createChatStream({
		notify,
		getActiveId: () => activeId,
		getActiveConversation: () => activeConversation,
		getDraft: () => message,
		setDraft: (value) => {
			message = value;
		},
		getAttachments: () => pendingAttachments,
		setAttachments: (files) => {
			pendingAttachments = files;
		},
		getConversationLoadToken: () => conversationLoadToken,
		bumpConversationLoadToken: () => {
			conversationLoadToken += 1;
		},
		isBlocked: () =>
			conversationLoading || settings.skillSaving || settings.toolsSaving || settings.modelSaving,
		setUserAtBottom: (value) => {
			userAtBottom = value;
		},
		loadConversations,
		loadConversation,
		loadSkills: () => settings.loadSkills(),
		onCanvasEvent: handleCanvasSseEvent
	});

	/** Model, thinking level, skill and tool preferences of the active conversation. */
	const settings = createChatSettings({
		notify,
		getActiveId: () => activeId,
		getActiveConversation: () => activeConversation,
		setActiveConversation: (conversation) => {
			activeConversation = conversation;
		},
		getConversations: () => conversations,
		setConversations: (update) => {
			conversations = conversations.map(update);
		},
		getConversationLoading: () => conversationLoading,
		setConversationLoading: (value) => {
			conversationLoading = value;
		},
		getConversationLoadToken: () => conversationLoadToken,
		bumpConversationLoadToken: () => {
			conversationLoadToken += 1;
		},
		getConversationNavigationToken: () => conversationNavigationToken,
		getDraft: () => message,
		getBrowserBridgeEnabled: () => browserBridgeEnabled
	});

	onDestroy(() => stream.dispose());

	$effect(() => {
		if (typeof window === 'undefined') return;
		browserBridgeEnabled = isBrowserBridgeEnabled();
		const handleSync = () => {
			browserBridgeEnabled = isBrowserBridgeEnabled();
		};
		window.addEventListener('storage', handleSync);
		window.addEventListener('focus', handleSync);
		void settings.loadSkills();
		window.addEventListener('focus', settings.loadSkills);
		return () => {
			window.removeEventListener('storage', handleSync);
			window.removeEventListener('focus', handleSync);
			window.removeEventListener('focus', settings.loadSkills);
		};
	});

	let isNewConversationEmpty = $derived(
		stream.messages.length === 0 && !stream.running && !!activeConversation
	);
	let newChatDisabled = $derived(
		isNewConversationEmpty ||
			stream.running ||
			conversationLoading ||
			settings.skillSaving ||
			settings.toolsSaving ||
			settings.modelSaving
	);
	let retryDisabled = $derived(
		stream.running ||
			conversationLoading ||
			settings.skillSaving ||
			settings.toolsSaving ||
			settings.modelSaving
	);

	// Publish the sidebar's New-chat button state to the shell; the shell owns the
	// markup, so the page keeps it in sync instead of passing props.
	$effect(() => {
		shell.registerNewChat({
			newChat: () => {
				if (!stream.running) void startNewConversation();
			},
			newChatDisabled,
			newChatEmpty: isNewConversationEmpty
		});
	});

	let canRegenerate = $derived.by(() => {
		const latest = stream.messages.at(-1);
		if (
			!latest ||
			latest.role !== 'assistant' ||
			latest.isStreaming ||
			!contentText(latest.content)
		) {
			return false;
		}
		return stream.messages.slice(0, -1).some((item) => item.role === 'user');
	});

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
		void stream.messages;

		if (userAtBottom) {
			tick().then(scrollToBottom);
		}
	});

	function notify(value: string) {
		toast(value);
	}

	$effect(() => {
		if (activeId) setConversationDraft(activeId, message);
	});

	async function loadConversations() {
		try {
			const response = await fetch('/api/conversations');
			if (!response.ok) throw new Error('Could not load conversations');
			const data = await response.json();
			conversations = data.conversations ?? [];
			conversationsState.setItems(conversations);
			if (!getLastUsedModel() && conversations[0]?.model) {
				setLastUsedModel(conversations[0].model);
			}
		} catch (error) {
			notify(error instanceof Error ? error.message : 'Could not load conversations');
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
		conversationLoading = true;
		const switching = id !== activeId;
		if (switching) {
			setConversationDraft(activeId, message);
			conversationNavigationToken += 1;
			stream.reset();
			pendingAttachments = [];
			settings.resetTools();
		}
		activeId = id;
		message = getConversationDraft(id);
		activeConversation = conversations.find((c) => c.id === id) ?? null;
		if (!preserveLiveState) {
			stream.resetLiveState();
		}
		updateChatUrl(id, replaceUrl);
		try {
			// The endpoint returns the newest page: a long conversation has to open on its
			// latest turn, not on the first 50 messages ever sent.
			const page = await fetchConversationPage<ConversationMessage>(id);
			if (loadToken !== conversationLoadToken || activeId !== id) return;
			activeConversation = (page.conversation as Conversation | null) ?? activeConversation;
			if (activeConversation?.model) {
				setLastUsedModel(activeConversation.model);
			}
			const transcript = page.messages.filter(
				(message) => message.role === 'user' || message.role === 'assistant'
			);
			if (switching) {
				stream.setMessages(transcript);
				earlierPagesLoaded = 0;
			} else {
				// Merging keeps earlier pages the reader already loaded; replacing the
				// transcript here is what used to lose them after every turn.
				stream.mergeMessages(transcript);
			}
			// Once the reader has paged back, the newest page no longer describes the
			// oldest loaded message, so its cursor must not overwrite the current one.
			if (switching || earlierPagesLoaded === 0) {
				olderCursor = page.olderCursor;
				hasEarlierMessages = page.hasMore;
			}
			if (activeConversation?.projectId) void settings.loadTools(activeConversation.projectId);
			else void settings.loadTools(null);
			void loadCanvasForConversation(activeConversation?.canvasId);
		} catch (error) {
			if (loadToken !== conversationLoadToken || activeId !== id) return;
			notify(error instanceof Error ? error.message : 'Could not load conversation');
			throw error;
		} finally {
			if (loadToken === conversationLoadToken) conversationLoading = false;
		}
	}

	/**
	 * Page backwards through history. The transcript grows above the viewport, so the
	 * scroll offset is restored afterwards to keep the reader on the same message.
	 */
	async function loadEarlierMessages() {
		const id = activeId;
		const cursor = olderCursor;
		if (!id || !cursor || loadingEarlier) return;
		const loadToken = conversationLoadToken;
		const before = scrollEl ? { height: scrollEl.scrollHeight, top: scrollEl.scrollTop } : null;
		loadingEarlier = true;
		try {
			const page = await fetchConversationPage<ConversationMessage>(id, { before: cursor });
			if (id !== activeId || loadToken !== conversationLoadToken) return;
			stream.mergeMessages(
				page.messages.filter((message) => message.role === 'user' || message.role === 'assistant')
			);
			olderCursor = page.olderCursor;
			hasEarlierMessages = page.hasMore;
			earlierPagesLoaded += 1;
			await tick();
			if (scrollEl && before) {
				scrollEl.scrollTop = scrollEl.scrollHeight - before.height + before.top;
			}
		} catch (error) {
			notify(error instanceof Error ? error.message : 'Could not load earlier messages');
		} finally {
			loadingEarlier = false;
		}
	}

	async function startNewConversation(force = false) {
		if (!force && isNewConversationEmpty) return;
		pendingAttachments = [];
		try {
			const model = settings.defaultModel();
			const conversation = await createConversation({
				model: model ?? undefined,
				enabledTools: ['web_search', 'web_fetch', 'ask_question', 'create_skill']
			});
			if (conversation.model) {
				setLastUsedModel(conversation.model);
			}
			await loadConversations();
			await loadConversation(conversation.id, false);
		} catch (error) {
			notify(error instanceof Error ? error.message : 'Backend unavailable');
		}
	}

	function startRename(conversation: ConversationSummary) {
		editingId = conversation.id;
	}

	function cancelRename() {
		editingId = null;
	}

	async function saveRename(id: string, newTitle: string) {
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

	/** Local Esc handling only: the global app shortcuts live in the root layout. */
	function handleWindowKeydown(event: KeyboardEvent) {
		if (event.key === 'Escape') {
			if (conversationSearch.isOpen) {
				conversationSearch.close();
				return;
			}
			if (deletingConversation) cancelDelete();
			if (editingId) cancelRename();
		}
	}

	onMount(() => {
		conversationSearch.registerSelectHandler((id) => {
			void loadConversation(id);
		});
		shell.registerChats({
			get conversations() {
				return conversations;
			},
			get activeId() {
				return activeId;
			},
			get editingId() {
				return editingId;
			},
			onSelectChat: (id) => void loadConversation(id),
			onStartRename: startRename,
			onPromptDelete: promptDelete,
			onSaveRename: saveRename,
			onCancelRename: cancelRename
		});

		void (async () => {
			await Promise.all([
				settings.loadModels(),
				loadConversations(),
				settings.loadThinkingPreferences()
			]);
			const params = new URL(window.location.href).searchParams;
			const requested = params.get('id');
			const handoff = peekNavigationHandoff();
			const handoffPrompt = handoff?.returnTo === `/chat?id=${requested}` ? handoff.prompt : '';
			if (handoffPrompt) consumeNavigationHandoff();
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
			if (handoffPrompt) {
				message = handoffPrompt;
				await stream.send();
			}
		})();

		return () => {
			conversationSearch.unregisterSelectHandler();
			shell.clear();
		};
	});

	function messageSkill(index: number): SkillSummary | null {
		const messages = stream.messages;
		for (let i = index; i >= 0; i--) {
			if (messages[i].role === 'user') return messages[i].skill ?? null;
		}
		return null;
	}

	/** Filenames attached to the user message that this assistant turn answers. */
	function turnAttachments(index: number): string[] {
		const messages = stream.messages;
		for (let i = index; i >= 0; i--) {
			if (messages[i].role === 'user') {
				return (messages[i].attachments ?? []).map((attachment) => attachment.filename);
			}
		}
		return [];
	}

	function addAttachments(selected: FileList | null) {
		if (!selected || selected.length === 0) return false;
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
			return false;
		}
		if (combined.reduce((total, file) => total + file.size, 0) > 25 * 1024 * 1024) {
			notify('Attachments must total 25 MB or less');
			return false;
		}
		pendingAttachments = combined;
		return true;
	}

	function removeAttachment(index: number) {
		pendingAttachments = pendingAttachments.filter((_, itemIndex) => itemIndex !== index);
	}

	async function handleQuestionSubmit(toolCallId: string | undefined, payload: QuestionPayload) {
		if (!activeId || !toolCallId) return;
		await answerQuestion(activeId, toolCallId, payload.answers, payload.skipped);
	}

	/** Send a follow-up prompt for a turn that ended without an answer. */
	function continueTurn() {
		if (stream.running || retryDisabled) return;
		message = 'continue';
		stream.dismissTurnNotice();
		void stream.send();
	}

	async function handleConsentSubmit(
		toolCallId: string | undefined,
		decision: BrowserConsentDecision
	) {
		if (!activeId || !toolCallId) return;
		await answerBrowserConsent(activeId, toolCallId, decision);
		stream.applyConsent(toolCallId, decision);
	}

	function applySkillSuggestion() {
		const skill = settings.suggestion;
		if (skill) void settings.selectSkill(skill.id);
	}
</script>

<svelte:head><title>Mimin WebUI | Chat</title></svelte:head>
<svelte:window onpopstate={handlePopState} onkeydown={handleWindowKeydown} />
<div class="chat-main">
	<ChatHeader
		conversation={activeConversation}
		{canvasOpen}
		hasCanvas={!!activeCanvas}
		{canvasLoading}
		ontogglecanvas={handleToggleCanvas}
	/>

	<!-- Mobile Tab Switcher when Canvas is open on narrow screens -->
	{#if canvasOpen && activeCanvas}
		<Tabs.Root value={mobileTab} onValueChange={selectMobileTab} class="mobile-tabs">
			<Tabs.List class="h-auto! w-full gap-1.5 rounded-none bg-transparent p-0">
				<Tabs.Trigger
					value="chat"
					class="mobile-tab h-auto! flex-1 rounded-md border-0 bg-[var(--surface-2)] px-3 py-1.5 text-[var(--text-muted)] transition-none hover:text-[var(--text-muted)]! focus-visible:ring-0! data-[state=active]:bg-[var(--surface-3)]! data-[state=active]:text-[var(--text-strong)]!"
				>
					Chat
				</Tabs.Trigger>
				<Tabs.Trigger
					value="canvas"
					class="mobile-tab h-auto! flex-1 rounded-md border-0 bg-[var(--surface-2)] px-3 py-1.5 text-[var(--text-muted)] transition-none hover:text-[var(--text-muted)]! focus-visible:ring-0! data-[state=active]:bg-[var(--surface-3)]! data-[state=active]:text-[var(--text-strong)]!"
				>
					Canvas Mockup
				</Tabs.Trigger>
			</Tabs.List>
		</Tabs.Root>
	{/if}

	<div
		class="workspace-split"
		class:canvas-visible={canvasOpen && !!activeCanvas}
		style:grid-template-columns={canvasOpen && !!activeCanvas
			? `minmax(0, ${splitRatio}fr) 6px minmax(0, ${100 - splitRatio}fr)`
			: 'minmax(0, 1fr)'}
		bind:this={splitEl}
	>
		<!-- Left/Top: Chat Column -->
		<div
			class="split-pane chat-pane"
			class:mobile-hidden={canvasOpen && !!activeCanvas && mobileTab === 'canvas'}
			bind:this={scrollEl}
			onscroll={handleScroll}
		>
			<div class="chat-wrap">
				{#if busy}
					<div class="empty-state" role="status">Loading conversations...</div>
				{:else if stream.messages.length === 0}
					<div class="empty-state">Ask something to start a conversation.</div>
				{/if}
				{#if hasEarlierMessages}
					<div class="history-loader">
						<Button
							variant="ghost"
							size="sm"
							onclick={loadEarlierMessages}
							disabled={loadingEarlier}
						>
							{loadingEarlier ? 'Loading earlier messages…' : 'Load earlier messages'}
						</Button>
					</div>
				{/if}
				{#each stream.messages as msg, i (msg.id)}
					<ChatMessage
						message={msg}
						skill={messageSkill(i)}
						sources={getTurnSources(stream.messages, i)}
						isLast={i === stream.messages.length - 1}
						canRetry={stream.canRetry}
						running={stream.running}
						{retryDisabled}
						onretry={stream.retry}
						{canRegenerate}
						regenerateDisabled={retryDisabled}
						onregenerate={stream.retry}
						onquestionsubmit={handleQuestionSubmit}
						onconsentsubmit={handleConsentSubmit}
						contextAttachments={turnAttachments(i)}
						projectName={activeConversation?.projectName ?? null}
					/>
				{/each}
				<ChatInlineError
					error={stream.liveError}
					canRetry={stream.canRetry}
					{retryDisabled}
					onretry={stream.retry}
				/>
				<ChatTurnNotice
					notice={stream.turnNotice}
					continueDisabled={retryDisabled}
					oncontinue={continueTurn}
					ondismiss={stream.dismissTurnNotice}
				/>
				<ChatComposer
					bind:message
					attachments={pendingAttachments}
					running={stream.running}
					{conversationLoading}
					skillSaving={settings.skillSaving}
					toolsSaving={settings.toolsSaving}
					modelSaving={settings.modelSaving}
					thinkingSaving={settings.thinkingSaving}
					hasActiveId={!!activeId}
					conversation={activeConversation}
					models={settings.pickerModels}
					modelsLoading={settings.modelsLoading}
					modelLoadError={settings.modelLoadError}
					configuredModels={settings.configuredModels}
					thinkingLevels={settings.availableThinkingLevels}
					thinkingLevel={settings.selectedThinkingLevel}
					skills={settings.eligibleSkills}
					skillsLoading={settings.skillsLoading}
					tools={settings.displayTools}
					toolsLoading={settings.toolsLoading}
					suggestion={settings.suggestion}
					suggestionDismissed={settings.suggestionDismissed}
					onattach={addAttachments}
					onremoveattachment={removeAttachment}
					onsend={stream.send}
					onstop={stream.stop}
					onremoveskill={() => settings.selectSkill(null)}
					onapplysuggestion={applySkillSuggestion}
					ondisksuggestion={settings.dismissSuggestion}
					onselectmodel={settings.selectModel}
					onselectthinkinglevel={settings.selectThinkingLevel}
					ontoggleskill={settings.toggleSkill}
					ontoggletool={settings.toggleTool}
				/>
			</div>
		</div>

		<!-- Splitter Divider -->
		{#if canvasOpen && !!activeCanvas}
			<button
				type="button"
				class="split-divider"
				aria-label="Resize split panes"
				onpointerdown={handleSplitPointerDown}
				onpointermove={handleSplitPointerMove}
				onpointerup={handleSplitPointerUp}
				onpointercancel={handleSplitPointerUp}
				onkeydown={(event) => {
					if (event.key === 'ArrowLeft') splitRatio = Math.max(20, splitRatio - 5);
					if (event.key === 'ArrowRight') splitRatio = Math.min(80, splitRatio + 5);
				}}
			>
				<span class="split-handle"></span>
			</button>

			<!-- Right/Bottom: Canvas Workspace Column -->
			<div
				class="split-pane canvas-pane"
				class:mobile-hidden={canvasOpen && !!activeCanvas && mobileTab === 'chat'}
			>
				<SvelteFlowProvider
					><CanvasWorkspace
						canvas={activeCanvas}
						onupdatescene={handleUpdateScene}
						oncreatescene={handleCreateScene}
						ondeletescene={handleDeleteScene}
						oncreateconnection={handleCreateConnection}
						ondeleteconnection={handleDeleteConnection}
						onupdateguideline={handleUpdateGuideline}
						onrefresh={() => loadCanvasForConversation(activeCanvas?.id)}
					/></SvelteFlowProvider
				>
			</div>
		{/if}
	</div>
</div>
<ConfirmDialog
	open={deletingConversation !== null}
	title="Delete chat"
	loading={deleteLoading}
	onconfirm={confirmDelete}
	oncancel={cancelDelete}
>
	{#snippet description()}
		Are you sure you want to delete <strong>"{deletingConversation?.title}"</strong>? This will
		permanently remove all messages in this conversation.
	{/snippet}
</ConfirmDialog>

<style>
	.chat-main {
		display: flex;
		flex-direction: column;
		height: 100%;
		overflow: hidden;
	}

	.workspace-split {
		display: grid;
		flex: 1;
		height: calc(100dvh - var(--topbar-h) - var(--mobile-nav-h));
		overflow: hidden;
		position: relative;
		min-width: 0;
	}

	.split-pane {
		overflow-y: auto;
		height: 100%;
		display: flex;
		flex-direction: column;
		min-width: 0;
	}

	.chat-pane {
		min-width: 0;
	}

	.canvas-pane {
		min-width: 0;
		background: var(--bg);
	}

	.split-divider {
		width: 6px;
		background: var(--border);
		cursor: col-resize;
		position: relative;
		flex-shrink: 0;
		padding: 0;
		border: 0;
		touch-action: none;
		transition: background 0.15s;
	}

	.split-divider:hover {
		background: var(--focus);
	}

	.split-handle {
		position: absolute;
		top: 50%;
		left: 50%;
		transform: translate(-50%, -50%);
		width: 2px;
		height: 24px;
		background: var(--border-strong);
		border-radius: 2px;
	}

	/* `mobile-tabs` is the Tabs.Root element, so its class is passed to a child component
	   and the selector has to be global for Svelte not to prune it. */
	:global(.mobile-tabs) {
		display: none;
		background: var(--surface);
		border-bottom: 1px solid var(--border);
		padding: 4px 12px;
		gap: 6px;
		flex-shrink: 0;
	}

	/* Tabs.Trigger renders a <button>, and the project's unlayered
	   `button {font: inherit;}` reset (layout.css) outranks every layered Tailwind font
	   utility, so the tab's type is declared here — the same values the old `.mobile-tab`
	   rule used. The active weight has to live here for the same reason:
	   `data-[state=active]:font-medium` would never apply. */
	:global(.mobile-tab) {
		font-size: var(--text-body-sm);
		line-height: var(--text-body-sm--line-height);
		letter-spacing: var(--text-body-sm--letter-spacing);
		font-weight: 500;
	}

	:global(.mobile-tab[data-state='active']) {
		font-weight: 500;
	}

	.chat-wrap {
		width: 100%;
		max-width: 920px;
		margin-inline: auto;
		min-width: 0;
		min-height: 0;
		flex: 1 0 auto;
		display: flex;
		flex-direction: column;
		padding: 34px 44px 20px;
	}

	.empty-state {
		flex: 1;
		display: flex;
		align-items: center;
		justify-content: center;
		text-align: center;
		color: var(--text-dim);
		font-size: var(--text-body-md);
		line-height: var(--text-body-md--line-height);
		letter-spacing: var(--text-body-md--letter-spacing);
		padding: 42px 0 10px;
	}

	/* Sits above the first message and pages older history in beneath itself. */
	.history-loader {
		display: flex;
		justify-content: center;
		padding: 0 0 8px;
	}

	@media (max-width: 900px) {
		:global(.mobile-tabs) {
			display: flex;
		}

		.workspace-split.canvas-visible {
			grid-template-columns: minmax(0, 1fr) !important;
		}

		.split-divider {
			display: none;
		}

		.split-pane {
			width: 100%;
		}

		.mobile-hidden {
			display: none !important;
		}

		.chat-wrap {
			padding: 24px 16px 20px;
		}
	}

	@media (max-width: 420px) {
		.chat-wrap {
			padding-inline: 12px;
		}
	}
</style>
