<script lang="ts">
	import { resolve } from '$app/paths';
	import {
		FileText,
		FolderKanban,
		Globe,
		LogOut,
		MessageSquare,
		PanelLeft,
		Plus,
		Puzzle,
		Settings,
		Sparkles,
		User
	} from '@lucide/svelte';
	import RecentChats from '$lib/components/RecentChats.svelte';
	import { sidebar } from '$lib/client/sidebar.svelte';
	import type { ConversationSummary } from '$lib/client/conversations.svelte';
	import type { Conversation } from './chat-types';

	type Props = {
		user?: { name?: string | null; role?: string | null } | null;
		conversations: Conversation[];
		activeId?: string;
		newChatEmpty?: boolean;
		newChatDisabled?: boolean;
		editingId?: string | null;
		editingTitle?: string;
		onnewchat?: () => void;
		onlogout?: () => void;
		onselectchat?: (id: string) => void;
		onstartrename?: (conversation: ConversationSummary) => void;
		onpromptdelete?: (conversation: ConversationSummary) => void;
		onsaverename?: (id: string) => void;
		oncancelrename?: () => void;
	};

	let {
		user = null,
		conversations,
		activeId = '',
		newChatEmpty = false,
		newChatDisabled = false,
		editingId = null,
		editingTitle = $bindable(''),
		onnewchat,
		onlogout,
		onselectchat,
		onstartrename,
		onpromptdelete,
		onsaverename,
		oncancelrename
	}: Props = $props();
</script>

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
		disabled={newChatDisabled}
		title={newChatEmpty ? 'Already on a new conversation' : 'New chat'}
		onclick={() => {
			sidebar.closeMobile();
			onnewchat?.();
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
		<a class="nav-item" href={resolve('/settings/instructions')}
			><FileText size={16} /> Instructions</a
		>
		<a class="nav-item" href={resolve('/skills')}><Sparkles size={16} /> Skills</a>
		<a class="nav-item" href={resolve('/settings/web-search')}><Globe size={16} /> Web Search</a>
		<a class="nav-item" href={resolve('/settings/browser-extension')}
			><Puzzle size={16} /> Browser Extension</a
		>
		<RecentChats
			{conversations}
			{activeId}
			onSelectChat={onselectchat}
			onStartRename={onstartrename}
			onPromptDelete={onpromptdelete}
			{editingId}
			bind:editingTitle
			onSaveRename={onsaverename}
			onCancelRename={oncancelrename}
		/>
	</div>
	<div class="sidebar-bottom">
		<div class="user-row">
			<span class="avatar">{user?.name?.[0]?.toUpperCase() ?? 'U'}</span>
			<div class="user-meta">
				<strong>{user?.name ?? 'User'}</strong>
				<small>Personal workspace</small>
			</div>
			<button class="logout-btn" onclick={onlogout} title="Log out" aria-label="Log out">
				<LogOut size={15} />
			</button>
		</div>
	</div>
</aside>

<style>
	.new-chat:disabled {
		opacity: 0.5;
		cursor: not-allowed;
		transform: none;
		box-shadow: none;
	}
</style>
