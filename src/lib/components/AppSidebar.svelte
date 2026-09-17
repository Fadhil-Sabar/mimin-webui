<script lang="ts">
	import { resolve } from '$app/paths';
	import { page } from '$app/state';
	import { LogOut, PanelLeft, Plus, Sparkles } from '@lucide/svelte';
	import RecentChats from '$lib/components/RecentChats.svelte';
	import SettingsMenu from '$lib/components/SettingsMenu.svelte';
	import { Button } from '$lib/components/ui/button/index.js';
	import { authClient } from '$lib/client/auth';
	import { shell } from '$lib/client/shell.svelte';
	import { sidebar } from '$lib/client/sidebar.svelte';
	import { activeNavKey, visibleNavSections } from '$lib/nav';

	type Props = {
		user?: { name?: string | null; role?: string | null } | null;
	};

	let { user = null }: Props = $props();

	let initial = $derived(user?.name?.[0]?.toUpperCase() ?? 'U');
	let sections = $derived(
		visibleNavSections(user?.role === 'admin').filter((section) => section.label !== 'Settings')
	);
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
		<Button
			variant="ghost"
			size="icon-sm"
			class="mb-[var(--space-4)] hover:bg-[var(--surface-hover)] hover:text-[var(--text-strong)]"
			onclick={() => sidebar.toggle()}
			title="Collapse sidebar"
			aria-label="Collapse sidebar"><PanelLeft size={16} /></Button
		>
	</div>
	{#if shell.newChat}
		<Button
			variant="default"
			class="mb-[var(--space-4)] w-full justify-start px-[11px] py-[8px] text-left shadow-[0_2px_8px_var(--shadow-soft)] hover:-translate-y-px active:translate-y-0 active:scale-[0.97]"
			disabled={shell.newChatDisabled}
			title={shell.newChatEmpty ? 'Already on a new conversation' : 'New chat'}
			onclick={() => {
				sidebar.closeMobile();
				shell.newChat?.();
			}}
		>
			<Plus size={16} /> New chat<kbd class="side-kbd">⌘ K</kbd>
		</Button>
	{:else}
		<Button
			variant="default"
			href={resolve('/chat?new=1')}
			class="mb-[var(--space-4)] w-full justify-start px-[11px] py-[8px] text-left shadow-[0_2px_8px_var(--shadow-soft)] hover:-translate-y-px active:translate-y-0 active:scale-[0.97]"
			onclick={() => sidebar.closeMobile()}
			><Plus size={16} /> New chat<kbd class="side-kbd">⌘ K</kbd></Button
		>
	{/if}
	<div class="sidebar-scroll">
		{#each sections as section, index (section.label)}
			<div class="nav-label" class:nav-label-group={index > 0}>{section.label}</div>
			{#each section.items as item (item.key)}
				<a
					class="nav-item state-layer"
					class:active={item.key === activeKey}
					href={resolve(item.href as '/chat')}
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
			<div class="user-actions">
				<SettingsMenu />
				<Button
					variant="ghost"
					size="icon-xs"
					class="hover:bg-[color-mix(in_srgb,var(--danger-text)_10%,transparent)] hover:text-[var(--danger-text)]"
					onclick={logout}
					title="Log out"
					aria-label="Log out"><LogOut size={15} /></Button
				>
			</div>
		</div>
	</div>
</aside>

<style>
	.user-actions {
		display: flex;
		align-items: center;
		gap: 2px;
		margin-left: auto;
	}

	.side-kbd {
		margin-left: auto;
		padding: 1px 5px;
		border-radius: var(--radius-sm);
		background: color-mix(in srgb, var(--accent-fg) 12%, transparent);
		color: var(--accent-fg);
		font-family: var(--font-body);
		font-size: var(--text-label-sm);
		line-height: var(--text-label-sm--line-height);
		letter-spacing: var(--text-label-sm--letter-spacing);
		font-weight: var(--text-label-sm--font-weight);
		opacity: 0.65;
	}
</style>
