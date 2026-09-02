<script lang="ts">
	import './layout.css';
	import favicon from '$lib/assets/favicon.svg';
	import { afterNavigate } from '$app/navigation';
	import { sidebar } from '$lib/client/sidebar.svelte';

	afterNavigate(() => {
		sidebar.closeMobile();
	});

	function handleKeydown(event: KeyboardEvent) {
		if (event.key === 'Escape' && sidebar.mobileOpen) {
			sidebar.closeMobile();
		}
	}

	let { children } = $props();
</script>

<svelte:window onkeydown={handleKeydown} />
<svelte:head><link rel="icon" href={favicon} /></svelte:head>
{@render children()}
