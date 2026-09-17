<script lang="ts">
	import { RotateCcw } from '@lucide/svelte';

	type Props = {
		error?: string;
		canRetry?: boolean;
		retryDisabled?: boolean;
		onretry?: () => void;
	};

	let { error = '', canRetry = false, retryDisabled = false, onretry }: Props = $props();
</script>

{#if error}
	<div class="inline-error" role="alert">
		<div class="inline-error-content">
			<strong>Agent error</strong>
			<span class="inline-error-text">{error}</span>
		</div>
		{#if canRetry}
			<button
				type="button"
				class="inline-error-retry state-layer"
				onclick={onretry}
				disabled={retryDisabled}
				title="Retry last message"
				aria-label="Retry last message"
			>
				<RotateCcw size={13} aria-hidden="true" />
				<span>Retry</span>
			</button>
		{/if}
	</div>
{/if}

<style>
	.inline-error {
		display: flex;
		align-items: center;
		justify-content: space-between;
		gap: 12px;
		background: rgba(141, 47, 38, 0.09);
		border: 1px solid rgba(141, 47, 38, 0.35);
		color: var(--danger-text);
		border-radius: 6px;
		padding: 10px 12px;
		margin: 18px 0 0;
		font-size: var(--text-body-md);
		line-height: var(--text-body-md--line-height);
		letter-spacing: var(--text-body-md--letter-spacing);
		animation: message-in var(--duration-medium1) var(--ease-emphasized-decelerate) backwards;
	}
	.inline-error-content {
		min-width: 0;
		flex: 1;
	}
	.inline-error strong {
		display: block;
		font-size: var(--text-body-md);
		line-height: var(--text-body-md--line-height);
		letter-spacing: var(--text-body-md--letter-spacing);
		margin-bottom: 2px;
	}
	.inline-error-text {
		word-break: break-word;
	}
	.inline-error-retry {
		display: inline-flex;
		align-items: center;
		gap: 6px;
		flex-shrink: 0;
		padding: 6px 12px;
		font-size: var(--text-body-sm);
		line-height: var(--text-body-sm--line-height);
		letter-spacing: var(--text-body-sm--letter-spacing);
		font-weight: 500;
		color: var(--danger-text);
		background: rgba(141, 47, 38, 0.12);
		border: 1px solid rgba(141, 47, 38, 0.4);
		border-radius: 5px;
		cursor: pointer;
		transition:
			background-color var(--duration-short3) var(--ease-standard),
			border-color var(--duration-short3) var(--ease-standard);
	}
	.inline-error-retry:hover:not(:disabled) {
		background: rgba(141, 47, 38, 0.22);
		border-color: rgba(141, 47, 38, 0.6);
	}
	.inline-error-retry:disabled {
		opacity: 0.5;
		cursor: not-allowed;
	}
</style>
