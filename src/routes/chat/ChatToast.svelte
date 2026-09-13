<script lang="ts">
	type Props = {
		message?: string;
	};

	let { message = '' }: Props = $props();
</script>

{#if message}<div class="toast" role="status" aria-live="polite">{message}</div>{/if}

<style>
	.toast {
		position: fixed;
		bottom: 22px;
		left: 50%;
		transform: translateX(-50%);
		background: var(--accent-bg);
		color: var(--accent-fg);
		font-size: var(--text-sm);
		padding: 8px 13px;
		border-radius: 6px;
		z-index: 50;
	}
</style>
