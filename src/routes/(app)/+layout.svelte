<script lang="ts">
	import AppShell from '$lib/components/AppShell.svelte';
	import MobileNav from '$lib/components/MobileNav.svelte';

	let { data, children } = $props();
</script>

<AppShell user={data.user}>{@render children()}</AppShell>
<MobileNav user={data.user} />
