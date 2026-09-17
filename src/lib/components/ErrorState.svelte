<script lang="ts">
	import { resolve } from '$app/paths';
	import { Button } from '$lib/components/ui/button/index.js';

	/**
	 * The body of `+error.svelte` at the root and in the `(app)` group. The two routes
	 * differ only in how much of the viewport they own, so the card and its copy live
	 * here and each route decides the surrounding space.
	 *
	 * Copy explains the situation and offers the next step. The raw server message is
	 * kept visible underneath rather than hidden, because for a thrown `load` or an
	 * `error()` call it is often the only clue anyone gets.
	 */
	const TITLES: Record<number, string> = {
		400: 'That request didn’t make sense',
		401: 'Sign in to continue',
		403: 'You don’t have access to this',
		404: 'We couldn’t find that page',
		429: 'Too many requests',
		500: 'Something broke on our side'
	};

	const DETAILS: Record<number, string> = {
		404: 'The link may be out of date, or the page may have moved.',
		429: 'Wait a moment, then try again.',
		500: 'The failure was logged. Retrying is safe.'
	};

	/** SvelteKit's own defaults add nothing next to the copy above, so they stay hidden. */
	const GENERIC_MESSAGES = new Set(['Not Found', 'Internal Error']);

	type Props = {
		status: number;
		/** The server's message, when the error came from a `load` or an `error()` call. */
		message?: string;
	};

	let { status, message = '' }: Props = $props();

	const title = $derived(TITLES[status] ?? 'Something went wrong');
	const detail = $derived(DETAILS[status] ?? '');
	const rawMessage = $derived(GENERIC_MESSAGES.has(message) ? '' : message);
</script>

<div class="error-state">
	<div class="error-card">
		<p class="error-eyebrow">Error {status}</p>
		<h1 class="md-headline-sm">{title}</h1>
		{#if detail}<p class="error-detail">{detail}</p>{/if}
		{#if rawMessage}<p class="error-message">{rawMessage}</p>{/if}
		<div class="error-actions">
			<Button href={resolve('/')} variant="default">Back to home</Button>
			{#if status >= 500}
				<Button variant="outline" onclick={() => location.reload()}>Try again</Button>
			{/if}
		</div>
	</div>
</div>

<style>
	.error-state {
		display: grid;
		place-items: center;
		min-height: 55vh;
		width: 100%;
		padding: var(--space-6) var(--space-5);
	}
	.error-card {
		width: 100%;
		max-width: 440px;
		padding: var(--space-6);
		border: 1px solid var(--border);
		border-radius: var(--radius-xl);
		background: var(--surface);
		box-shadow: 0 8px 24px var(--shadow-soft);
	}
	.error-eyebrow {
		margin: 0 0 var(--space-2);
		color: var(--text-faint);
		font-size: var(--text-label-md);
		line-height: var(--text-label-md--line-height);
		letter-spacing: 0.08em;
		font-weight: 500;
		text-transform: uppercase;
	}
	h1 {
		margin: 0;
		color: var(--text-strong);
	}
	.error-detail {
		margin: var(--space-2) 0 0;
		color: var(--text-muted);
		font-size: var(--text-body-md);
		line-height: var(--text-body-md--line-height);
		letter-spacing: var(--text-body-md--letter-spacing);
	}
	.error-message {
		margin: var(--space-4) 0 0;
		padding: var(--space-3);
		border: 1px solid var(--border);
		border-radius: var(--radius-md);
		background: var(--surface-2);
		color: var(--text-body);
		font-family: var(--font-mono);
		font-size: var(--text-body-sm);
		line-height: var(--text-body-sm--line-height);
		letter-spacing: var(--text-body-sm--letter-spacing);
		word-break: break-word;
	}
	.error-actions {
		display: flex;
		flex-wrap: wrap;
		gap: var(--space-2);
		margin-top: var(--space-5);
	}
</style>
