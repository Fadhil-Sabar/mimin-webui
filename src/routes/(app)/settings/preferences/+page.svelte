<script lang="ts">
	import { onMount } from 'svelte';
	import { SlidersHorizontal } from '@lucide/svelte';
	import { Switch } from '$lib/components/ui/switch/index.js';
	import Topbar from '$lib/components/Topbar.svelte';
	import Page from '$lib/components/Page.svelte';
	import PageHeader from '$lib/components/PageHeader.svelte';
	import { displayPreferences } from '$lib/client/display-preferences.svelte';

	/** Stored preferences are read from the browser, so the control waits for hydration. */
	let hydrated = $state(false);

	onMount(() => {
		hydrated = true;
	});

	function setShowMessageContext(value: boolean) {
		displayPreferences.showMessageContext = value;
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
				Adds a compact line to each finished answer with the tokens it used, how long it took, and
				how many sources and tool calls it drew on. Turn it off for a plainer transcript.
			</p>
		</div>
		<label class="switch-row">
			<Switch
				checked={displayPreferences.showMessageContext}
				disabled={!hydrated}
				onCheckedChange={(value) => setShowMessageContext(value)}
			/>
			<b>{displayPreferences.showMessageContext ? 'Shown' : 'Hidden'}</b>
		</label>
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
	.switch-row {
		display: flex;
		align-items: center;
		gap: 9px;
		flex: 0 0 auto;
		color: var(--text-muted);
		font-size: var(--text-body-sm);
		line-height: var(--text-body-sm--line-height);
		letter-spacing: var(--text-body-sm--letter-spacing);
	}
	@media (max-width: 720px) {
		.preference-card {
			flex-wrap: wrap;
			gap: 14px;
		}
		.switch-row {
			width: 100%;
		}
	}
</style>
