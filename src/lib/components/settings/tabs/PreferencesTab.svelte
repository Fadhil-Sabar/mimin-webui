<script lang="ts">
	import { onMount } from 'svelte';
	import { Switch } from '$lib/components/ui/switch/index.js';
	import { displayPreferences } from '$lib/client/display-preferences.svelte';

	/** Stored preferences are read from the browser, so the control waits for hydration. */
	let hydrated = $state(false);

	onMount(() => {
		hydrated = true;
	});

	function setAnswerContext(checked: boolean) {
		if (!hydrated) return;
		displayPreferences.showMessageContext = checked;
	}
</script>

<div class="tab-pane">
	<div class="view-header">
		<h1 class="view-title">Preferences</h1>
		<p class="view-subtitle">Make your workspace feel right.</p>
	</div>

	<div class="section-label">SAVED IN THIS BROWSER</div>

	<div class="preference-row">
		<div class="preference-info">
			<strong class="preference-title">Show answer context</strong>
			<p class="preference-desc">
				Show token usage, response time, speed,
				<br />
				and source and tool counts below answers.
				<br />
				Turn off for a cleaner conversation.
			</p>
		</div>
		<div class="toggle-group">
			<Switch
				checked={displayPreferences.showMessageContext}
				disabled={!hydrated}
				onCheckedChange={setAnswerContext}
				aria-label="Toggle show answer context"
			/>
			<span class="toggle-label">
				{displayPreferences.showMessageContext ? 'Shown' : 'Hidden'}
			</span>
		</div>
	</div>

	<div class="footer-note">Changes save automatically.</div>
</div>

<style>
	.tab-pane {
		display: flex;
		flex-direction: column;
		min-height: 100%;
		padding: 28px 32px 36px;
		color: #ececee;
		font-family: var(--font-body);
	}
	.view-header {
		margin-bottom: 24px;
		padding-right: 40px;
	}
	.view-title {
		margin: 0;
		font-size: 22px;
		font-weight: 600;
		color: #ececee;
		letter-spacing: -0.01em;
	}
	.view-subtitle {
		margin: 4px 0 0;
		font-size: 13px;
		color: #a1a1aa;
	}
	.section-label {
		font-size: 11px;
		font-weight: 600;
		letter-spacing: 0.05em;
		color: #71717a;
		text-transform: uppercase;
		border-bottom: 1px solid #242428;
		padding-bottom: 8px;
		margin-bottom: 16px;
	}
	.preference-row {
		display: flex;
		align-items: flex-start;
		justify-content: space-between;
		gap: 24px;
		padding: 6px 0;
	}
	.preference-info {
		flex: 1;
		min-width: 0;
	}
	.preference-title {
		display: block;
		font-size: 14px;
		font-weight: 500;
		color: #ececee;
	}
	.preference-desc {
		margin: 6px 0 0;
		font-size: 12.5px;
		line-height: 1.5;
		color: #71717a;
	}
	.toggle-group {
		display: flex;
		align-items: center;
		gap: 10px;
		flex-shrink: 0;
		padding-top: 2px;
	}
	.toggle-label {
		font-size: 13px;
		color: #ececee;
		font-weight: 400;
		min-width: 44px;
	}
	.footer-note {
		margin-top: auto;
		padding-top: 36px;
		font-size: 12px;
		color: #71717a;
	}
	@media (max-width: 760px) {
		.tab-pane {
			padding: 16px;
		}
		.view-header {
			padding-right: 0;
		}
		.preference-row {
			flex-direction: column;
			gap: 14px;
		}
	}
</style>
