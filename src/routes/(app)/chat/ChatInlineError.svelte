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
		background: color-mix(in srgb, var(--danger-bg) 12%, transparent);
		border: 1px solid color-mix(in srgb, var(--danger-bg) 40%, transparent);
		color: var(--danger-text);
		border-radius: var(--radius-md);
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
		background: color-mix(in srgb, var(--danger-bg) 14%, transparent);
		border: 1px solid color-mix(in srgb, var(--danger-bg) 45%, transparent);
		border-radius: 5px;
		cursor: pointer;
		transition:
			background-color var(--duration-short3) var(--ease-standard),
			border-color var(--duration-short3) var(--ease-standard);
	}
	.inline-error-retry:hover:not(:disabled) {
		background: color-mix(in srgb, var(--danger-bg) 24%, transparent);
		border-color: color-mix(in srgb, var(--danger-bg) 65%, transparent);
	}
	.inline-error-retry:disabled {
		opacity: 0.5;
		cursor: not-allowed;
	}
</style>
