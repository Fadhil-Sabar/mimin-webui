<script lang="ts">
	type Props = { message: string };

	let { message }: Props = $props();
</script>

<div class="notification-toast" role="alert">
	{message}
</div>

<style>
	.notification-toast {
		padding: 10px 14px;
		margin-bottom: 20px;
		background: var(--surface-2);
		border: 1px solid var(--border-strong);
		border-radius: 8px;
		font-size: var(--text-sm);
		color: var(--text-strong);
	}
</style>
