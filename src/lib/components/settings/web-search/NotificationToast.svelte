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
		border-radius: var(--radius-lg);
		font-family: var(--font-body);
		font-size: var(--text-body-md);
		line-height: var(--text-body-md--line-height);
		letter-spacing: var(--text-body-md--letter-spacing);
		color: var(--text-strong);
	}
</style>
