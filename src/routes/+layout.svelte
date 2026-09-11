<script lang="ts">
	import './layout.css';
	import favicon from '$lib/assets/favicon.svg';
	import { afterNavigate } from '$app/navigation';
	import { sidebar } from '$lib/client/sidebar.svelte';
	import { conversationSearch } from '$lib/client/conversations.svelte';
	import ConversationSearchModal from '$lib/components/ConversationSearchModal.svelte';

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
		if (
			(event.metaKey || event.ctrlKey) &&
			(event.key.toLowerCase() === 'o' || (event.shiftKey && event.key.toLowerCase() === 'f'))
		) {
			event.preventDefault();
			conversationSearch.toggle();
			return;
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
<ConversationSearchModal />
<a
	class="source-link"
	href="https://github.com/Fadhil-Sabar/mimin-webui"
	target="_blank"
	rel="noreferrer">Source · AGPL-3.0</a
>
