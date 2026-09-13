<script lang="ts">
	import { Check, Loader2, RotateCcw } from '@lucide/svelte';

	type Props = {
		saving: boolean;
		showReset: boolean;
		onreset: () => void;
	};

	let { saving, showReset, onreset }: Props = $props();
</script>

<div class="form-actions">
	<button type="submit" class="button primary" disabled={saving}>
		{#if saving}
			<Loader2 size={16} class="spin" /> Saving...
		{:else}
			<Check size={16} /> Save provider
		{/if}
	</button>

	{#if showReset}
		<button type="button" class="button danger" onclick={onreset} disabled={saving}>
			<RotateCcw size={15} /> Reset to default
		</button>
	{/if}
</div>

<style>
	.form-actions {
		display: flex;
		align-items: center;
		gap: 12px;
		padding-top: 12px;
		border-top: 1px solid var(--border);
	}
</style>
