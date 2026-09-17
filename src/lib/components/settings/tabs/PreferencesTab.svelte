<script lang="ts">
	import { onMount } from 'svelte';
	import { SlidersHorizontal } from '@lucide/svelte';
	import SwitchIndicator from '$lib/components/SwitchIndicator.svelte';
	import { Card } from '$lib/components/ui/card/index.js';
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

<div class="tab-content">
	<PageHeader
		title="Preferences"
		subtitle="Choose how much Mimin shows you while you work. These apply to this browser."
	>
		{#snippet icon()}<SlidersHorizontal size={20} />{/snippet}
	</PageHeader>

	<Card
		shadow="soft"
		class="mt-[var(--space-5)] flex items-start gap-5 p-[18px_20px] max-[760px]:flex-wrap max-[760px]:gap-[14px]"
	>
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
	</Card>
</div>

<style>
	.tab-content {
		padding: 28px var(--space-6) var(--space-7);
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
		margin: var(--space-1) 0 0;
		color: var(--text-muted);
		font-size: var(--text-body-md);
		line-height: var(--text-body-md--line-height);
		letter-spacing: var(--text-body-md--letter-spacing);
	}
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
		font-family: var(--font-body);
		font-size: var(--text-label-lg);
		line-height: var(--text-label-lg--line-height);
		letter-spacing: var(--text-label-lg--letter-spacing);
		font-weight: var(--text-label-lg--font-weight);
		cursor: pointer;
		transition:
			color var(--duration-short3) var(--ease-standard),
			background var(--duration-short3) var(--ease-standard),
			border-color var(--duration-short3) var(--ease-standard);
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
	@media (max-width: 760px) {
		.tab-content {
			padding: 20px var(--space-4) var(--space-7);
		}
		.preference-toggle {
			width: 100%;
			justify-content: space-between;
		}
	}
</style>
