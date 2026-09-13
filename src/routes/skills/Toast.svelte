<script lang="ts">
	let { message = '' }: { message?: string } = $props();
</script>

{#if message}<div class="toast" role="status" aria-live="polite">{message}</div>{/if}

<style>
	.toast {
		position: fixed;
		right: 24px;
		bottom: 24px;
		z-index: 70;
		padding: 10px 14px;
		color: var(--accent-fg);
		background: var(--accent-bg);
		border-radius: 6px;
		box-shadow: 0 8px 24px var(--shadow);
		font-size: var(--text-sm);
		font-weight: 550;
	}
</style>
