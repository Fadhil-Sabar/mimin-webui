<script lang="ts">
	import './layout.css';
	import favicon from '$lib/assets/favicon.svg';
	import { afterNavigate } from '$app/navigation';
	import { sidebar } from '$lib/client/sidebar.svelte';

	import { resolve } from '$app/paths';
	import { goto } from '$app/navigation';
	import { page } from '$app/state';

	afterNavigate(() => {
		sidebar.closeMobile();
	});

	function handleKeydown(event: KeyboardEvent) {
		if (event.key === 'Escape' && sidebar.mobileOpen) {
			sidebar.closeMobile();
		}
		if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'k') {
			if (page.url.pathname !== '/chat') {
				event.preventDefault();
				void goto(resolve('/chat?new=1'));
			}
		}
	}

	let { children } = $props();
</script>

<svelte:window onkeydown={handleKeydown} />
<svelte:head><link rel="icon" href={favicon} /></svelte:head>
{@render children()}
