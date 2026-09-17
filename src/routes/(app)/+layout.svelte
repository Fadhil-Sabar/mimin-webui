<script lang="ts">
	import { goto } from '$app/navigation';
	import { page } from '$app/state';
	import AppShell from '$lib/components/AppShell.svelte';
	import MobileNav from '$lib/components/MobileNav.svelte';
	import SettingsModal from '$lib/components/settings/SettingsModal.svelte';
	import { isSettingsTab, settingsModal } from '$lib/client/settings-modal.svelte';

	let { data, children } = $props();

	$effect(() => {
		const targetTab = page.url.searchParams.get('settings');
		if (targetTab && isSettingsTab(targetTab)) {
			settingsModal.show(targetTab);
			const url = new URL(page.url);
			url.searchParams.delete('settings');
			// eslint-disable-next-line svelte/no-navigation-without-resolve
			void goto(url.pathname + (url.search ? url.search : ''), {
				replaceState: true,
				noScroll: true,
				keepFocus: true
			});
		}
	});
</script>

<AppShell user={data.user}>
	{@render children()}
</AppShell>
<SettingsModal user={data.user} />
<MobileNav user={data.user} />
