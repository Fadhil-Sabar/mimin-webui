<script lang="ts">
	import { onMount } from 'svelte';
	import { SlidersHorizontal } from '@lucide/svelte';
	import SwitchIndicator from '$lib/components/SwitchIndicator.svelte';
	import Topbar from '$lib/components/Topbar.svelte';
	import Page from '$lib/components/Page.svelte';
	import PageHeader from '$lib/components/PageHeader.svelte';
	import { displayPreferences } from '$lib/client/display-preferences.svelte';

	/** Stored preferences are read from the browser, so the control waits for hydration. */
	let hydrated = $state(false);

	onMount(() => {
		hydrated = true;
	});

	function toggleShowMessageContext() {
		if (!hydrated) return;
		displayPreferences.showMessageContext = !displayPreferences.showMessageContext;
	}
</script>

<svelte:head>
	<title>Preferences · Mimin</title>
</svelte:head>

<Topbar breadcrumbs={[{ label: 'Settings' }, { label: 'Preferences' }]} />

<Page>
	<PageHeader
		title="Preferences"
		subtitle="Choose how much Mimin shows you while you work. These apply to this browser."
	>
		{#snippet icon()}<SlidersHorizontal size={20} />{/snippet}
	</PageHeader>

	<section class="preference-card">
		<div class="preference-text">
			<strong>Show answer context</strong>
			<p>
				Adds a compact line to each finished answer with the tokens it used, how long it took, the
				estimated tokens per second, and how many sources and tool calls it drew on. Turn it off for
				a plainer transcript.
			</p>
		</div>
		<button
			type="button"
			class="preference-toggle"
			aria-pressed={displayPreferences.showMessageContext}
			disabled={!hydrated}
			onclick={toggleShowMessageContext}
		>
			<SwitchIndicator checked={displayPreferences.showMessageContext} />
			<span>{displayPreferences.showMessageContext ? 'Shown' : 'Hidden'}</span>
		</button>
	</section>
</Page>

<style>
	.preference-card {
		display: flex;
		align-items: flex-start;
		gap: 20px;
		margin-top: 24px;
		padding: 18px 20px;
		background: var(--surface);
		border: 1px solid var(--border);
		border-radius: 10px;
		box-shadow: 0 5px 20px var(--shadow-softer);
	}
	.preference-text {
		min-width: 0;
		flex: 1;
	}
	.preference-text strong {
		display: block;
		color: var(--text-strong);
		font-size: var(--text-body-lg);
		line-height: var(--text-body-lg--line-height);
		letter-spacing: var(--text-body-lg--letter-spacing);
		font-weight: 500;
	}
	.preference-text p {
		margin: 4px 0 0;
		color: var(--text-muted);
		font-size: var(--text-body-md);
		line-height: var(--text-body-md--line-height);
		letter-spacing: var(--text-body-md--letter-spacing);
	}
	/* The pill and its label are one control, so the whole thing is the toggle. */
	.preference-toggle {
		display: inline-flex;
		align-items: center;
		gap: 9px;
		flex: 0 0 auto;
		padding: 5px 10px 5px 7px;
		color: var(--text-muted);
		background: transparent;
		border: 1px solid var(--border);
		border-radius: 999px;
		font-size: var(--text-label-lg);
		line-height: var(--text-label-lg--line-height);
		letter-spacing: var(--text-label-lg--letter-spacing);
		font-weight: var(--text-label-lg--font-weight);
		cursor: pointer;
		transition:
			color 0.15s ease,
			background 0.15s ease,
			border-color 0.15s ease;
	}
	.preference-toggle:hover:not(:disabled) {
		color: var(--text);
		background: var(--surface-2);
		border-color: var(--border-strong);
	}
	.preference-toggle[aria-pressed='true'] {
		color: var(--text);
		border-color: var(--border-strong);
	}
	.preference-toggle:disabled {
		opacity: 0.6;
		cursor: not-allowed;
	}
	.preference-toggle:focus-visible {
		outline: 2px solid var(--focus);
		outline-offset: 2px;
	}
	@media (max-width: 720px) {
		.preference-card {
			flex-wrap: wrap;
			gap: 14px;
		}
		.preference-toggle {
			width: 100%;
			justify-content: space-between;
		}
	}
</style>
