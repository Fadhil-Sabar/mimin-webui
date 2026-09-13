<script lang="ts">
	import { onDestroy, onMount, tick } from 'svelte';
	import {
		answerBrowserConsent,
		answerQuestion,
		createConversation,
		deleteConversation,
		updateConversation,
		type BrowserConsentDecision
	} from '$lib/client/api';
	import { authClient } from '$lib/client/auth';
	import { sidebar } from '$lib/client/sidebar.svelte';
	import {
		conversationSearch,
		conversationsState,
		getLastUsedModel,
		setLastUsedModel,
		type ConversationSummary
	} from '$lib/client/conversations.svelte';
	import { isBrowserBridgeEnabled } from '$lib/client/browser-bridge';
	import type { SkillSummary } from '$lib/skills';
	import ChatComposer from './ChatComposer.svelte';
	import ChatHeader from './ChatHeader.svelte';
	import ChatInlineError from './ChatInlineError.svelte';
	import ChatMessage from './ChatMessage.svelte';
	import ChatSidebar from './ChatSidebar.svelte';
	import ChatToast from './ChatToast.svelte';
	import DeleteChatDialog from './DeleteChatDialog.svelte';
	import { createChatSettings } from './chat-settings.svelte';
	import { createChatStream } from './chat-stream.svelte';
	import { getTurnSources } from './chat-format';
	import type { Conversation, ConversationMessage, QuestionPayload } from './chat-types';

	let { data } = $props();
	let user = $derived(data.user);
	let toast = $state('');
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
	let editingTitle = $state('');
	let deletingConversation = $state<ConversationSummary | null>(null);
	let deleteLoading = $state(false);
	let scrollEl: HTMLElement | undefined;
	let userAtBottom = $state(true);
	let conversationLoadToken = 0;
	let conversationNavigationToken = 0;
	let conversationLoading = $state(false);
	let browserBridgeEnabled = $state(false);

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
		loadSkills: () => settings.loadSkills()
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
		toast = value;
		setTimeout(() => (toast = ''), 1800);
	}

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
			conversationNavigationToken += 1;
			stream.reset();
			pendingAttachments = [];
			settings.resetTools();
		}
		activeId = id;
		activeConversation = conversations.find((c) => c.id === id) ?? null;
		if (!preserveLiveState) {
			stream.resetLiveState();
		}
		updateChatUrl(id, replaceUrl);
		try {
			const response = await fetch(`/api/conversations/${id}`);
			if (!response.ok) throw new Error('Could not load conversation');
			const data = await response.json();
			if (loadToken !== conversationLoadToken || activeId !== id) return;
			activeConversation = data.conversation ?? activeConversation;
			if (activeConversation?.model) {
				setLastUsedModel(activeConversation.model);
			}
			stream.setMessages(
				(data.messages ?? []).filter(
					(m: ConversationMessage) => m.role === 'user' || m.role === 'assistant'
				)
			);
			if (activeConversation?.projectId) void settings.loadTools(activeConversation.projectId);
			else void settings.loadTools(null);
		} catch (error) {
			if (loadToken !== conversationLoadToken || activeId !== id) return;
			notify(error instanceof Error ? error.message : 'Could not load conversation');
			throw error;
		} finally {
			if (loadToken === conversationLoadToken) conversationLoading = false;
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
		if (
			(event.metaKey || event.ctrlKey) &&
			(event.key.toLowerCase() === 'o' || (event.shiftKey && event.key.toLowerCase() === 'f'))
		) {
			event.preventDefault();
			conversationSearch.toggle();
			return;
		}
		if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'k') {
			event.preventDefault();
			if (!isNewConversationEmpty && !stream.running) {
				void startNewConversation();
			}
		}
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

		void (async () => {
			await Promise.all([
				settings.loadModels(),
				loadConversations(),
				settings.loadThinkingPreferences()
			]);
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
				await stream.send();
			}
		})();

		return () => {
			conversationSearch.unregisterSelectHandler();
		};
	});

	function messageSkill(index: number): SkillSummary | null {
		const messages = stream.messages;
		for (let i = index; i >= 0; i--) {
			if (messages[i].role === 'user') return messages[i].skill ?? null;
		}
		return null;
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
	<ChatSidebar
		{user}
		{conversations}
		{activeId}
		newChatEmpty={isNewConversationEmpty}
		{newChatDisabled}
		{editingId}
		bind:editingTitle
		onnewchat={startNewConversation}
		onlogout={logout}
		onselectchat={loadConversation}
		onstartrename={startRename}
		onpromptdelete={promptDelete}
		onsaverename={saveRename}
		oncancelrename={cancelRename}
	/>
	<main class="main-content" bind:this={scrollEl} onscroll={handleScroll}>
		<ChatHeader
			conversation={activeConversation}
			running={stream.running}
			activity={stream.activeAgentActivity}
		/>
		<div class="chat-wrap">
			{#if busy}
				<div class="empty-state" role="status">Loading conversations...</div>
			{:else if stream.messages.length === 0}
				<div class="empty-state">Ask something to start a conversation.</div>
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
					onquestionsubmit={handleQuestionSubmit}
					onconsentsubmit={handleConsentSubmit}
				/>
			{/each}
			<ChatInlineError
				error={stream.liveError}
				canRetry={stream.canRetry}
				{retryDisabled}
				onretry={stream.retry}
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
	</main>
</div>
<DeleteChatDialog
	conversation={deletingConversation}
	loading={deleteLoading}
	onconfirm={confirmDelete}
	oncancel={cancelDelete}
/>
<ChatToast message={toast} />

<style>
	.chat-wrap {
		width: 100%;
		min-height: calc(100dvh - 66px);
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
		font-size: var(--text-sm);
		padding: 42px 0 10px;
	}
	@media (max-width: 760px) {
		.chat-wrap {
			padding: 24px 14px 20px;
		}
	}
	@media (max-width: 420px) {
		.chat-wrap {
			padding-inline: 12px;
		}
	}
</style>
