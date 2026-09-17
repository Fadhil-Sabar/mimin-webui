<script lang="ts">
	import { resolve } from '$app/paths';
	import { page } from '$app/state';
	import { LogOut, PanelLeft, Plus, Sparkles } from '@lucide/svelte';
	import RecentChats from '$lib/components/RecentChats.svelte';
	import { authClient } from '$lib/client/auth';
	import { shell } from '$lib/client/shell.svelte';
	import { sidebar } from '$lib/client/sidebar.svelte';
	import { activeNavKey, visibleNavSections } from '$lib/nav';

	type Props = {
		user?: { name?: string | null; role?: string | null } | null;
	};

	let { user = null }: Props = $props();

	let initial = $derived(user?.name?.[0]?.toUpperCase() ?? 'U');
	let sections = $derived(visibleNavSections(user?.role === 'admin'));
	let activeKey = $derived(activeNavKey(page.url.pathname));

	async function logout() {
		await authClient.signOut();
		window.location.href = '/login';
	}
</script>

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
	{#if shell.newChat}
		<button
			class="new-chat"
			disabled={shell.newChatDisabled}
			title={shell.newChatEmpty ? 'Already on a new conversation' : 'New chat'}
			onclick={() => {
				sidebar.closeMobile();
				shell.newChat?.();
			}}
		>
			<Plus size={16} /> New chat <kbd>⌘ K</kbd>
		</button>
	{:else}
		<a class="new-chat" href={resolve('/chat?new=1')} onclick={() => sidebar.closeMobile()}
			><Plus size={16} /> New chat <kbd>⌘ K</kbd></a
		>
	{/if}
	<div class="sidebar-scroll">
		{#each sections as section, index (section.label)}
			<div class="nav-label" class:nav-label-group={index > 0}>{section.label}</div>
			{#each section.items as item (item.key)}
				<a
					class="nav-item"
					class:active={item.key === activeKey}
					href={resolve(item.href)}
					aria-current={item.key === activeKey ? 'page' : undefined}
				>
					<item.icon size={16} />
					{item.label}
				</a>
			{/each}
		{/each}
		<RecentChats
			conversations={shell.chats?.conversations}
			activeId={shell.chats?.activeId}
			editingId={shell.chats?.editingId}
			onSelectChat={shell.chats?.onSelectChat}
			onStartRename={shell.chats?.onStartRename}
			onPromptDelete={shell.chats?.onPromptDelete}
			onSaveRename={shell.chats?.onSaveRename}
			onCancelRename={shell.chats?.onCancelRename}
		/>
	</div>
	<div class="sidebar-bottom">
		<div class="user-row">
			<span class="avatar">{initial}</span>
			<div class="user-meta">
				<strong>{user?.name ?? 'User'}</strong>
			</div>
			<button class="logout-btn" onclick={logout} title="Log out" aria-label="Log out">
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
