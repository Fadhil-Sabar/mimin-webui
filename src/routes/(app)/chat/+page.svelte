<script lang="ts">
	import { SvelteFlowProvider } from '@xyflow/svelte';
	import { onDestroy, onMount, tick } from 'svelte';
	import { ArrowDown } from '@lucide/svelte';
	import { toast } from 'svelte-sonner';
	import {
		answerBrowserConsent,
		answerQuestion,
		deleteConversation,
		updateConversation,
		type BrowserConsentDecision
	} from '$lib/client/api';
	import ConfirmDialog from '$lib/components/ConfirmDialog.svelte';
	import Skeleton from '$lib/components/Skeleton.svelte';
	import {
		conversationSearch,
		conversationsState,
		type ConversationSummary
	} from '$lib/client/conversations.svelte';
	import { isBrowserBridgeEnabled } from '$lib/client/browser-bridge';
	import { displayPreferences } from '$lib/client/display-preferences.svelte';
	import { shell } from '$lib/client/shell.svelte';
	import { setConversationDraft } from '$lib/client/drafts';
	import { MODELS_CHANGED_EVENT } from '$lib/client/models-cache';
	import { peekNavigationHandoff, consumeNavigationHandoff } from '$lib/client/navigation-handoff';
	import { Button } from '$lib/components/ui/button/index.js';
	import * as Tabs from '$lib/components/ui/tabs/index.js';
	import ChatComposer from './ChatComposer.svelte';
	import ChatHeader from './ChatHeader.svelte';
	import ChatInlineError from './ChatInlineError.svelte';
	import ChatTurnNotice from './ChatTurnNotice.svelte';
	import ChatMessage from './ChatMessage.svelte';
	import { createChatSettings } from './chat-settings.svelte';
	import { createChatCanvas } from './chat-canvas.svelte';
	import { createChatStream } from './chat-stream.svelte';
	import { createChatNavigation } from './chat-navigation.svelte';
	import {
		buildRowContext,
		contentText,
		isImageFile,
		MAX_IMAGE_ATTACHMENT_BYTES,
		normalizeAttachmentFile
	} from './chat-format';
	import type { Conversation, QuestionPayload } from './chat-types';

	let { data } = $props();

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
	/**
	 * Whether a message mounted right now should rise in. Bulk transcript changes —
	 * opening a conversation, paging in older history — put messages on screen that
	 * were not just sent, so they must arrive still; only messages appended to a
	 * settled transcript animate. `ChatMessage` snapshots this at mount, so disarming
	 * across a swap and re-arming afterwards cannot restart anything already rendered.
	 */
	let enterMotionArmed = $state(true);

	function suppressEnterMotion() {
		enterMotionArmed = false;
		void tick().then(() => (enterMotionArmed = true));
	}

	// Canvas workspace state, split view, and scene CRUD live in their own module.
	const canvas = createChatCanvas({
		getActiveId: () => activeId,
		getActiveConversation: () => activeConversation,
		notify
	});

	// The workspace (and the flow/canvas editor it pulls in) loads only when the
	// pane is actually opened, keeping it out of the chat page's initial bundle.
	type WorkspaceComponent = typeof import('$lib/components/CanvasWorkspace.svelte').default;
	let Workspace = $state<WorkspaceComponent | null>(null);
	$effect(() => {
		if (!canvas.canvasOpen || Workspace) return;
		void import('$lib/components/CanvasWorkspace.svelte').then((module) => {
			Workspace = module.default;
		});
	});

	let navigation = $state(null as unknown as ReturnType<typeof createChatNavigation>);

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
		loadConversations: () => navigation.loadConversations(),
		loadConversation: (id, replaceUrl, preserveLiveState) =>
			navigation.loadConversation(id, replaceUrl, preserveLiveState),
		loadSkills: () => settings.loadSkills(),
		onCanvasEvent: canvas.handleCanvasSseEvent
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

	navigation = createChatNavigation({
		getUserId: () => data.user?.id,
		notify,
		suppressEnterMotion,
		getConversations: () => conversations,
		setConversations: (value) => {
			conversations = value;
		},
		getActiveId: () => activeId,
		setActiveId: (value) => {
			activeId = value;
		},
		getActiveConversation: () => activeConversation,
		setActiveConversation: (value) => {
			activeConversation = value;
		},
		getDraft: () => message,
		setDraft: (value) => {
			message = value;
		},
		getPendingAttachments: () => pendingAttachments,
		setPendingAttachments: (value) => {
			pendingAttachments = value;
		},
		isEmptyConversation: () =>
			stream.messages.length === 0 && !stream.running && !!activeConversation,
		getConversationLoading: () => conversationLoading,
		setConversationLoading: (value) => {
			conversationLoading = value;
		},
		getConversationLoadToken: () => conversationLoadToken,
		bumpConversationLoadToken: () => {
			conversationLoadToken += 1;
		},
		bumpConversationNavigationToken: () => {
			conversationNavigationToken += 1;
		},
		getScrollEl: () => scrollEl,
		setUserAtBottom: (value) => {
			userAtBottom = value;
		},
		setNewResponseWhileReading: (value) => {
			newResponseWhileReading = value;
		},
		getStream: () => stream,
		getSettings: () => settings,
		getCanvas: () => canvas
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
		const refreshModels = () => void settings.loadModels({ force: true });
		window.addEventListener(MODELS_CHANGED_EVENT, refreshModels);
		void settings.loadSkills();
		window.addEventListener('focus', settings.loadSkills);
		return () => {
			window.removeEventListener('storage', handleSync);
			window.removeEventListener('focus', handleSync);
			window.removeEventListener(MODELS_CHANGED_EVENT, refreshModels);
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
				if (!stream.running) void navigation.startNewConversation();
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
		if (userAtBottom) newResponseWhileReading = false;
	}

	function scrollToBottom() {
		if (!scrollEl) return;
		scrollEl.scrollTop = scrollEl.scrollHeight;
	}

	function jumpToLatest() {
		userAtBottom = true;
		newResponseWhileReading = false;
		if (!scrollEl) return;
		scrollEl.scrollTo({ top: scrollEl.scrollHeight, behavior: 'smooth' });
	}

	let newResponseWhileReading = $state(false);
	let lastObservedAssistantText = '';
	let scrollActionLabel = $derived(newResponseWhileReading ? 'New response' : 'Jump to latest');

	$effect(() => {
		// Subscribe to reactive changes
		const latestAssistant = stream.messages.findLast((message) => message.role === 'assistant');
		const assistantText = latestAssistant
			? `${latestAssistant.id}:${contentText(latestAssistant.content)}`
			: '';
		if (assistantText !== lastObservedAssistantText) {
			if (!userAtBottom && latestAssistant?.isStreaming && contentText(latestAssistant.content))
				newResponseWhileReading = true;
			lastObservedAssistantText = assistantText;
		}

		if (userAtBottom) {
			tick().then(scrollToBottom);
		}
	});

	function notify(value: string) {
		toast(value);
	}

	$effect(() => {
		if (activeId) setConversationDraft(data.user?.id, activeId, message);
	});

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
					await navigation.loadConversation(conversations[0].id, false);
				} else {
					await navigation.startNewConversation(true);
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
			void navigation.loadConversation(id);
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
			onSelectChat: (id) => void navigation.loadConversation(id),
			onStartRename: startRename,
			onPromptDelete: promptDelete,
			onSaveRename: saveRename,
			onCancelRename: cancelRename
		});

		void (async () => {
			await Promise.all([
				settings.loadModels(),
				navigation.loadConversations(),
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
					await navigation.loadConversation(requested, true);
				} catch {
					if (conversations.length > 0) {
						await navigation.loadConversation(conversations[0].id, true);
					} else {
						await navigation.startNewConversation(true);
					}
				}
			} else if (isNew) {
				await navigation.startNewConversation(true);
			} else if (conversations.length > 0) {
				await navigation.loadConversation(conversations[0].id, true);
			} else {
				await navigation.startNewConversation(true);
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

	/**
	 * Per-row chat context (skill, answered-turn files, sources, continuation) is
	 * resolved once per messages version instead of by every rendered row: the stream
	 * rewrites the array on each animation frame, so per-row backward scans and source
	 * collection are O(rows x turn) per frame.
	 */
	const rowContext = $derived(buildRowContext(stream.messages));

	function addAttachments(selected: File[] | FileList | null) {
		if (!selected) return false;
		const incoming = Array.from(selected);
		if (incoming.length === 0) return false;
		const accepted: File[] = [];
		for (const raw of incoming) {
			// Pasted images often have no usable name, so normalize before validating.
			const file = normalizeAttachmentFile(raw);
			if (!file) {
				notify(`${raw.name || 'That file'}: file type is not supported`);
				continue;
			}
			if (file.size > 25 * 1024 * 1024) {
				notify(`${file.name}: file exceeds 25 MB`);
				continue;
			}
			if (isImageFile(file) && file.size > MAX_IMAGE_ATTACHMENT_BYTES) {
				notify(`${file.name}: image exceeds 8 MB`);
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

	async function branchFrom(messageId: string) {
		if (!activeId || stream.running) return;
		try {
			const response = await fetch(`/api/conversations/${activeId}/branch`, {
				method: 'POST',
				headers: { 'content-type': 'application/json' },
				body: JSON.stringify({
					throughMessageId: messageId,
					historyRevision: activeConversation?.historyRevision ?? 1
				})
			});
			if (!response.ok)
				throw new Error(
					(await response.json().catch(() => null))?.error?.message ?? 'Could not create branch'
				);
			const data = await response.json();
			await navigation.loadConversations();
			await navigation.loadConversation(data.conversation.id);
		} catch (error) {
			notify(error instanceof Error ? error.message : 'Could not create branch');
		}
	}
</script>

<svelte:head><title>Mimin WebUI | Chat</title></svelte:head>
<svelte:window onpopstate={navigation.handlePopState} onkeydown={handleWindowKeydown} />
<div class="chat-main">
	<ChatHeader
		conversation={activeConversation}
		canvasOpen={canvas.canvasOpen}
		hasCanvas={!!canvas.activeCanvas}
		canvasLoading={canvas.canvasLoading}
		ontogglecanvas={canvas.handleToggleCanvas}
	/>

	<!-- Mobile Tab Switcher when Canvas is open on narrow screens -->
	{#if canvas.canvasOpen && canvas.activeCanvas}
		<Tabs.Root value={canvas.mobileTab} onValueChange={canvas.selectMobileTab} class="mobile-tabs">
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
		class:canvas-visible={canvas.canvasOpen && !!canvas.activeCanvas}
		style:grid-template-columns={canvas.canvasOpen && !!canvas.activeCanvas
			? `minmax(0, ${canvas.splitRatio}fr) 6px minmax(0, ${100 - canvas.splitRatio}fr)`
			: 'minmax(0, 1fr)'}
		bind:this={canvas.splitEl}
	>
		<!-- Left/Top: Chat Column -->
		<div
			class="split-pane chat-pane"
			class:mobile-hidden={canvas.canvasOpen &&
				!!canvas.activeCanvas &&
				canvas.mobileTab === 'canvas'}
			bind:this={scrollEl}
			onscroll={handleScroll}
		>
			{#if !userAtBottom && stream.messages.length > 0}
				<button
					type="button"
					class="scroll-to-latest"
					onclick={jumpToLatest}
					aria-label={scrollActionLabel}
				>
					<ArrowDown size={14} aria-hidden="true" />
					<span>{scrollActionLabel}</span>
				</button>
			{/if}
			<div class="chat-wrap">
				{#if busy}
					<div class="loading-thread" role="status" aria-label="Loading conversation">
						{#each [1, 2, 3] as i (i)}
							<div class="loading-turn" class:from-user={i % 2 === 0}>
								<Skeleton width="104px" height="12px" />
								<Skeleton
									width={i % 2 === 0 ? '58%' : '82%'}
									height={i % 2 === 0 ? '52px' : '76px'}
									radius="var(--radius-lg)"
								/>
							</div>
						{/each}
					</div>
				{:else if stream.messages.length === 0}
					<div class="empty-state">Ask something to start a conversation.</div>
				{/if}
				{#if navigation.hasEarlierMessages}
					<div class="history-loader">
						<Button
							variant="ghost"
							size="sm"
							onclick={navigation.loadEarlierMessages}
							disabled={navigation.loadingEarlier}
						>
							{navigation.loadingEarlier ? 'Loading earlier messages…' : 'Load earlier messages'}
						</Button>
					</div>
				{/if}
				{#each stream.messages as msg, i (msg.id)}
					<ChatMessage
						message={msg}
						skill={rowContext.get(msg.id)?.skill ?? null}
						continuation={rowContext.get(msg.id)?.continuation ?? false}
						sources={rowContext.get(msg.id)?.sources ?? []}
						isLast={i === stream.messages.length - 1}
						canRetry={stream.canRetry}
						running={stream.running}
						{retryDisabled}
						onretry={stream.retry}
						{canRegenerate}
						regenerateDisabled={retryDisabled}
						onregenerate={stream.retry}
						onedit={stream.edit}
						onbranch={branchFrom}
						onquestionsubmit={handleQuestionSubmit}
						onconsentsubmit={handleConsentSubmit}
						contextAttachments={rowContext.get(msg.id)?.attachments ?? []}
						projectName={activeConversation?.projectName ?? null}
						showContext={displayPreferences.showMessageContext}
						enterMotion={enterMotionArmed}
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
		{#if canvas.canvasOpen && !!canvas.activeCanvas}
			<button
				type="button"
				class="split-divider"
				aria-label="Resize split panes"
				onpointerdown={canvas.handleSplitPointerDown}
				onpointermove={canvas.handleSplitPointerMove}
				onpointerup={canvas.handleSplitPointerUp}
				onpointercancel={canvas.handleSplitPointerUp}
				onkeydown={(event) => {
					if (event.key === 'ArrowLeft') canvas.splitRatio = Math.max(20, canvas.splitRatio - 5);
					if (event.key === 'ArrowRight') canvas.splitRatio = Math.min(80, canvas.splitRatio + 5);
				}}
			>
				<span class="split-handle"></span>
			</button>

			<!-- Right/Bottom: Canvas Workspace Column -->
			<div
				class="split-pane canvas-pane"
				class:mobile-hidden={canvas.canvasOpen &&
					!!canvas.activeCanvas &&
					canvas.mobileTab === 'chat'}
			>
				<SvelteFlowProvider
					>{#if Workspace}
						<Workspace
							canvas={canvas.activeCanvas}
							userId={data.user?.id}
							onupdatescene={canvas.handleUpdateScene}
							oncreatescene={canvas.handleCreateScene}
							ondeletescene={canvas.handleDeleteScene}
							oncreateconnection={canvas.handleCreateConnection}
							ondeleteconnection={canvas.handleDeleteConnection}
							onupdateguideline={canvas.handleUpdateGuideline}
							onrefresh={() => canvas.loadCanvasForConversation(canvas.activeCanvas?.id)}
						/>{/if}
				</SvelteFlowProvider>
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
		position: relative;
	}

	.scroll-to-latest {
		position: absolute;
		z-index: 20;
		right: max(18px, calc((100% - 832px) / 2));
		bottom: 112px;
		display: inline-flex;
		align-items: center;
		gap: 6px;
		border: 1px solid var(--border-strong);
		border-radius: 999px;
		padding: 7px 11px;
		background: var(--surface);
		color: var(--text-strong);
		font-size: var(--text-body-sm);
		line-height: var(--text-body-sm--line-height);
		letter-spacing: var(--text-body-sm--letter-spacing);
		box-shadow: 0 6px 18px var(--shadow-soft);
		transition:
			background var(--duration-short3) var(--ease-standard),
			border-color var(--duration-short3) var(--ease-standard),
			transform var(--duration-short3) var(--ease-standard);
	}
	.scroll-to-latest:hover {
		border-color: var(--focus);
		background: var(--surface-hover);
		transform: translateY(-1px);
	}
	.scroll-to-latest:focus-visible {
		outline: 2px solid var(--focus);
		outline-offset: 2px;
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
		transition: background var(--duration-short3) var(--ease-standard);
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
		border-radius: var(--radius-sm);
	}

	/* `mobile-tabs` is the Tabs.Root element, so its class is passed to a child component
	   and the selector has to be global for Svelte not to prune it. */
	:global(.mobile-tabs) {
		display: none;
		background: var(--surface);
		border-bottom: 1px solid var(--border);
		padding: var(--space-1) var(--space-3);
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

	/* Placeholder transcript: alternating turn shapes, sized to the bubbles they
	 * stand in for so the composer does not jump when the real messages land. */
	.loading-thread {
		display: flex;
		flex-direction: column;
		gap: 28px;
		padding: 6px 0 10px;
	}
	.loading-turn {
		display: flex;
		flex-direction: column;
		align-items: flex-start;
		gap: 8px;
	}
	.loading-turn.from-user {
		align-items: flex-end;
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
		padding: 0 0 var(--space-2);
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
			padding: var(--space-5) var(--space-4) 20px;
		}
	}

	@media (max-width: 560px) {
		.scroll-to-latest {
			right: 12px;
			bottom: 104px;
		}
		.chat-wrap {
			padding-inline: var(--space-3);
		}
	}
</style>
