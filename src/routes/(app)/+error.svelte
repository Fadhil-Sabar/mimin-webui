<script lang="ts">
	import { page } from '$app/state';
	import ErrorState from '$lib/components/ErrorState.svelte';

	/**
	 * Error page for the signed-in app. This sits inside `AppShell`'s content area, so
	 * it must not claim the viewport the way the root `+error.svelte` does — the shell
	 * already provides the sidebar and topbar around it.
	 */
</script>

<svelte:head><title>Error {page.status} · Mimin</title></svelte:head>

<ErrorState status={page.status} message={page.error?.message} />
