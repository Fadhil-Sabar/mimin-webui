import type { ConversationSummary } from '$lib/client/conversations.svelte';

/**
 * Conversation-list behaviour a page hands to the sidebar.
 *
 * The shell is declared once by `(app)/+layout.svelte`, so a page cannot pass
 * props up to it. The chat room publishes this binding on mount and clears it on
 * destroy; the sidebar reads it reactively. The fields are getters so reads stay
 * live against the page's own `$state`.
 */
export type SidebarChats = {
	readonly conversations: ConversationSummary[];
	readonly activeId: string;
	readonly editingId: string | null;
	onSelectChat: (id: string) => void;
	onStartRename: (conversation: ConversationSummary) => void;
	onPromptDelete: (conversation: ConversationSummary) => void;
	onSaveRename: (id: string, title: string) => void;
	onCancelRename: () => void;
};

class ShellState {
	/** Starts a fresh conversation. Falls back to `/chat?new=1` when unset. */
	newChat = $state<(() => void) | null>(null);
	newChatDisabled = $state(false);
	newChatEmpty = $state(false);
	/** Set only by the chat room; other pages leave it null and get link-based chats. */
	chats = $state.raw<SidebarChats | null>(null);

	registerNewChat(handlers: {
		newChat?: () => void;
		newChatDisabled?: boolean;
		newChatEmpty?: boolean;
	}) {
		this.newChat = handlers.newChat ?? null;
		this.newChatDisabled = handlers.newChatDisabled ?? false;
		this.newChatEmpty = handlers.newChatEmpty ?? false;
	}

	registerChats(chats: SidebarChats) {
		this.chats = chats;
	}

	clear() {
		this.newChat = null;
		this.newChatDisabled = false;
		this.newChatEmpty = false;
		this.chats = null;
	}
}

export const shell = new ShellState();
