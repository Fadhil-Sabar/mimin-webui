import {
	conversationsState,
	getLastUsedModel,
	setLastUsedModel
} from '$lib/client/conversations.svelte';
import { tick } from 'svelte';
import { SvelteURL } from 'svelte/reactivity';
import { getConversationDraft, setConversationDraft } from '$lib/client/drafts';
import { createConversation, fetchConversationPage } from '$lib/client/api';
import type { Conversation, ConversationMessage } from './chat-types';

type StreamNavigation = {
	reset: () => void;
	resetLiveState: () => void;
	setMessages: (messages: ConversationMessage[]) => void;
	mergeMessages: (messages: ConversationMessage[]) => void;
	reconnect: (conversationId: string) => Promise<void>;
};

type SettingsNavigation = {
	resetTools: () => void;
	loadTools: (projectId?: string | null) => Promise<void>;
	defaultModel: () => string | undefined;
};

type CanvasNavigation = {
	loadCanvasForConversation: (canvasId?: string | null) => Promise<void>;
};

export type ChatNavigationDeps = {
	getUserId: () => string | null | undefined;
	notify: (value: string) => void;
	suppressEnterMotion: () => void;
	getConversations: () => Conversation[];
	setConversations: (value: Conversation[]) => void;
	getActiveId: () => string;
	setActiveId: (value: string) => void;
	getActiveConversation: () => Conversation | null;
	setActiveConversation: (value: Conversation | null) => void;
	getDraft: () => string;
	setDraft: (value: string) => void;
	getPendingAttachments: () => File[];
	setPendingAttachments: (value: File[]) => void;
	isEmptyConversation: () => boolean;
	getConversationLoading: () => boolean;
	setConversationLoading: (value: boolean) => void;
	getConversationLoadToken: () => number;
	bumpConversationLoadToken: () => void;
	bumpConversationNavigationToken: () => void;
	getScrollEl: () => HTMLElement | undefined;
	setUserAtBottom: (value: boolean) => void;
	setNewResponseWhileReading: (value: boolean) => void;
	getStream: () => StreamNavigation;
	getSettings: () => SettingsNavigation;
	getCanvas: () => CanvasNavigation;
};

/**
 * Owns URL navigation and transcript paging for one chat page instance.
 * Stream, settings, and canvas stay injectable so this module does not own their
 * lifetimes or introduce a second source of truth for the active conversation.
 */
export function createChatNavigation(deps: ChatNavigationDeps) {
	let olderCursor = $state<string | null>(null);
	let hasEarlierMessages = $state(false);
	let loadingEarlier = $state(false);
	let earlierPagesLoaded = $state(0);

	async function loadConversations() {
		try {
			const response = await fetch('/api/conversations');
			if (!response.ok) throw new Error('Could not load conversations');
			const data = await response.json();
			const next = (data.conversations ?? []) as Conversation[];
			deps.setConversations(next);
			conversationsState.setItems(next);
			if (!getLastUsedModel() && next[0]?.model) setLastUsedModel(next[0].model);
		} catch (error) {
			deps.notify(error instanceof Error ? error.message : 'Could not load conversations');
		}
	}

	function updateChatUrl(id: string, replace = false) {
		if (typeof window === 'undefined') return;
		const url = new SvelteURL(window.location.href);
		if (
			url.searchParams.get('id') === id &&
			!url.searchParams.has('prompt') &&
			!url.searchParams.has('new')
		)
			return;
		url.searchParams.set('id', id);
		url.searchParams.delete('prompt');
		url.searchParams.delete('new');
		const target = url.pathname + '?' + url.searchParams.toString();
		if (replace) window.history.replaceState({}, '', target);
		else window.history.pushState({}, '', target);
	}

	async function loadConversation(id: string, replaceUrl = false, preserveLiveState = false) {
		const loadToken = deps.getConversationLoadToken() + 1;
		deps.bumpConversationLoadToken();
		deps.setConversationLoading(true);
		const switching = id !== deps.getActiveId();
		if (switching) {
			setConversationDraft(deps.getUserId(), deps.getActiveId(), deps.getDraft());
			deps.bumpConversationNavigationToken();
			deps.getStream().reset();
			deps.setPendingAttachments([]);
			deps.getSettings().resetTools();
			deps.setUserAtBottom(true);
			deps.setNewResponseWhileReading(false);
			const scrollEl = deps.getScrollEl();
			if (scrollEl) scrollEl.scrollTop = 0;
		}
		deps.setActiveId(id);
		deps.setDraft(getConversationDraft(deps.getUserId(), id));
		deps.setActiveConversation(deps.getConversations().find((c) => c.id === id) ?? null);
		if (!preserveLiveState) deps.getStream().resetLiveState();
		updateChatUrl(id, replaceUrl);
		try {
			const page = await fetchConversationPage<ConversationMessage>(id);
			if (loadToken !== deps.getConversationLoadToken() || deps.getActiveId() !== id) return;
			const loadedConversation =
				(page.conversation as Conversation | null) ?? deps.getActiveConversation();
			deps.setActiveConversation(loadedConversation);
			if (loadedConversation?.model) setLastUsedModel(loadedConversation.model);
			const transcript = page.messages.filter(
				(message) => message.role === 'user' || message.role === 'assistant'
			);
			deps.suppressEnterMotion();
			if (switching) {
				deps.getStream().setMessages(transcript);
				earlierPagesLoaded = 0;
				const scrollEl = deps.getScrollEl();
				await tick();
				if (scrollEl) scrollEl.scrollTop = scrollEl.scrollHeight;
			} else deps.getStream().mergeMessages(transcript);
			if (switching || earlierPagesLoaded === 0) {
				olderCursor = page.olderCursor;
				hasEarlierMessages = page.hasMore;
			}
			if (loadedConversation?.projectId)
				void deps.getSettings().loadTools(loadedConversation.projectId);
			else void deps.getSettings().loadTools(null);
			void deps.getCanvas().loadCanvasForConversation(loadedConversation?.canvasId);
			if (!preserveLiveState) void deps.getStream().reconnect(id);
		} catch (error) {
			if (loadToken !== deps.getConversationLoadToken() || deps.getActiveId() !== id) return;
			deps.notify(error instanceof Error ? error.message : 'Could not load conversation');
			throw error;
		} finally {
			if (loadToken === deps.getConversationLoadToken()) deps.setConversationLoading(false);
		}
	}

	async function loadEarlierMessages() {
		const id = deps.getActiveId();
		const cursor = olderCursor;
		if (!id || !cursor || loadingEarlier) return;
		const loadToken = deps.getConversationLoadToken();
		const scrollEl = deps.getScrollEl();
		const before = scrollEl ? { height: scrollEl.scrollHeight, top: scrollEl.scrollTop } : null;
		loadingEarlier = true;
		try {
			const page = await fetchConversationPage<ConversationMessage>(id, { before: cursor });
			if (id !== deps.getActiveId() || loadToken !== deps.getConversationLoadToken()) return;
			deps.suppressEnterMotion();
			deps
				.getStream()
				.mergeMessages(
					page.messages.filter((message) => message.role === 'user' || message.role === 'assistant')
				);
			olderCursor = page.olderCursor;
			hasEarlierMessages = page.hasMore;
			earlierPagesLoaded += 1;
			await tick();
			if (scrollEl && before)
				scrollEl.scrollTop = scrollEl.scrollHeight - before.height + before.top;
		} catch (error) {
			deps.notify(error instanceof Error ? error.message : 'Could not load earlier messages');
		} finally {
			loadingEarlier = false;
		}
	}

	function handlePopState() {
		const params = new SvelteURL(window.location.href).searchParams;
		const id = params.get('id');
		const isNew = params.get('new') === '1';
		if (id && id !== deps.getActiveId()) void loadConversation(id, true);
		else if (isNew) void startNewConversation(true);
		else if (
			!id &&
			deps.getConversations().length > 0 &&
			deps.getConversations()[0].id !== deps.getActiveId()
		)
			void loadConversation(deps.getConversations()[0].id, true);
	}

	async function startNewConversation(force = false) {
		if (!force && deps.isEmptyConversation()) return;
		deps.setPendingAttachments([]);
		try {
			const conversation = await createConversation({
				model: deps.getSettings().defaultModel(),
				enabledTools: ['web_search', 'web_fetch', 'ask_question', 'create_skill']
			});
			if (conversation.model) setLastUsedModel(conversation.model);
			await loadConversations();
			await loadConversation(conversation.id, false);
		} catch (error) {
			deps.notify(error instanceof Error ? error.message : 'Backend unavailable');
		}
	}

	return {
		get olderCursor() {
			return olderCursor;
		},
		get hasEarlierMessages() {
			return hasEarlierMessages;
		},
		get loadingEarlier() {
			return loadingEarlier;
		},
		loadConversations,
		loadConversation,
		loadEarlierMessages,
		handlePopState,
		startNewConversation,
		updateChatUrl
	};
}
