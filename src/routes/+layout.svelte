<script lang="ts">
	import './layout.css';
	import favicon from '$lib/assets/favicon.svg';
	import { afterNavigate } from '$app/navigation';
	import { shell } from '$lib/client/shell.svelte';
	import { sidebar } from '$lib/client/sidebar.svelte';
	import { conversationSearch } from '$lib/client/conversations.svelte';
	import ConversationSearchModal from '$lib/components/ConversationSearchModal.svelte';
	import { Toaster } from '$lib/components/ui/sonner/index.js';

	import { resolve } from '$app/paths';
	import { goto } from '$app/navigation';

	afterNavigate(() => {
		sidebar.closeMobile();
	});

	/**
	 * The single owner of global shortcuts. Pages must not register their own
	 * window key handlers for these, or a shortcut runs twice.
	 */
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
			event.preventDefault();
			// The chat room publishes a handler that starts a chat in place;
			// every other page navigates to a fresh one.
			if (shell.newChat) shell.newChat();
			else void goto(resolve('/chat?new=1'));
		}
	}

	let { children } = $props();
</script>

<svelte:window onkeydown={handleKeydown} />
<svelte:head><link rel="icon" href={favicon} /></svelte:head>
{@render children()}
<ConversationSearchModal />
<Toaster />
<a
	class="source-link"
	href="https://github.com/Fadhil-Sabar/mimin-webui"
	target="_blank"
	rel="noreferrer">Source · AGPL-3.0</a
>
