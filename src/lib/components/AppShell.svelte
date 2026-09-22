<script lang="ts">
	import type { Snippet } from 'svelte';
	import AppSidebar from '$lib/components/AppSidebar.svelte';
	import SidebarBackdrop from '$lib/components/SidebarBackdrop.svelte';
	import { sidebar } from '$lib/client/sidebar.svelte';

	type Props = {
		user?: { id?: string | null; name?: string | null; role?: string | null } | null;
		children: Snippet;
	};

	let { user = null, children }: Props = $props();
</script>

<div
	class="app-shell"
	class:sidebar-collapsed={sidebar.collapsed}
	class:mobile-open={sidebar.mobileOpen}
>
	<SidebarBackdrop />
	<AppSidebar {user} />
	<main class="main-content">
		{@render children()}
	</main>
</div>
