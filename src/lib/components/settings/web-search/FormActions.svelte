<script lang="ts">
	import { Check, Loader2, RotateCcw } from '@lucide/svelte';
	import { Button } from '$lib/components/ui/button/index.js';

	type Props = {
		saving: boolean;
		showReset: boolean;
		onreset: () => void;
	};

	let { saving, showReset, onreset }: Props = $props();
</script>

<div class="form-actions">
	<Button type="submit" variant="default" disabled={saving}>
		{#if saving}
			<Loader2 size={16} class="spin" /> Saving...
		{:else}
			<Check size={16} /> Save provider
		{/if}
	</Button>

	{#if showReset}
		<Button type="button" variant="destructive" onclick={onreset} disabled={saving}>
			<RotateCcw size={15} /> Reset to default
		</Button>
	{/if}
</div>

<style>
	.form-actions {
		display: flex;
		align-items: center;
		gap: var(--space-3);
		padding-top: var(--space-3);
		border-top: 1px solid var(--border);
	}
</style>
