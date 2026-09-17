<script lang="ts">
	import { page } from '$app/state';
	import AppShell from '$lib/components/AppShell.svelte';
	import MobileNav from '$lib/components/MobileNav.svelte';
	import SettingsWorkspace from '$lib/components/SettingsWorkspace.svelte';

	let { data, children } = $props();
	let inSettings = $derived(
		page.url.pathname.startsWith('/settings') || page.url.pathname.startsWith('/admin/users')
	);
</script>

<AppShell user={data.user}>
	{#if inSettings}
		<SettingsWorkspace user={data.user}>{@render children()}</SettingsWorkspace>
	{:else}
		{@render children()}
	{/if}
</AppShell>
<MobileNav user={data.user} />
