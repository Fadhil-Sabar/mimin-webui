<script lang="ts">
	import { page } from '$app/state';
	import ErrorState from '$lib/components/ErrorState.svelte';

	/**
	 * Route-level error page for everything outside the `(app)` group — unmatched URLs
	 * and failures in the auth routes. Nothing renders the app shell around this one,
	 * so it owns the whole viewport.
	 *
	 * `(app)/+error.svelte` handles the errors that happen inside the shell; SvelteKit
	 * picks the closest page, so the two do not overlap.
	 */
</script>

<svelte:head><title>Error {page.status} · Mimin</title></svelte:head>

<div class="error-viewport">
	<ErrorState status={page.status} message={page.error?.message} />
</div>

<style>
	.error-viewport {
		display: grid;
		place-items: center;
		min-height: 100dvh;
		background: var(--bg);
		color: var(--text);
	}
</style>
