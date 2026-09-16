<script lang="ts">
	import type { Snippet } from 'svelte';
	import AppSidebar from '$lib/components/AppSidebar.svelte';
	import SidebarBackdrop from '$lib/components/SidebarBackdrop.svelte';
	import { sidebar } from '$lib/client/sidebar.svelte';

	type Props = {
		user?: { name?: string | null; role?: string | null } | null;
		recentChats?: Snippet;
		sidebarExtra?: Snippet;
		onnewchat?: () => void;
		newChatDisabled?: boolean;
		newChatEmpty?: boolean;
		children: Snippet;
	};

	let {
		user = null,
		recentChats,
		sidebarExtra,
		onnewchat,
		newChatDisabled = false,
		newChatEmpty = false,
		children
	}: Props = $props();
</script>

<div
	class="app-shell"
	class:sidebar-collapsed={sidebar.collapsed}
	class:mobile-open={sidebar.mobileOpen}
>
	<SidebarBackdrop />
	<AppSidebar {user} {recentChats} {sidebarExtra} {onnewchat} {newChatDisabled} {newChatEmpty} />
	<main class="main-content">
		{@render children()}
	</main>
</div>
