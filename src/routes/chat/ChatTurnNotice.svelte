<script lang="ts">
	import { ArrowRight, X } from '@lucide/svelte';

	type Props = {
		/** Already-formatted explanation of what happened, from the turn outcome. */
		notice?: string;
		continueDisabled?: boolean;
		oncontinue?: () => void;
		ondismiss?: () => void;
	};

	let { notice = '', continueDisabled = false, oncontinue, ondismiss }: Props = $props();
</script>

{#if notice}
	<div class="turn-notice" role="status">
		<div class="turn-notice-content">
			<strong>Incomplete reply</strong>
			<span class="turn-notice-text">{notice}</span>
		</div>
		<button
			type="button"
			class="turn-notice-continue"
			onclick={oncontinue}
			disabled={continueDisabled}
			title="Ask the model to continue this turn"
		>
			<ArrowRight size={13} aria-hidden="true" />
			<span>Continue</span>
		</button>
		<button
			type="button"
			class="turn-notice-dismiss"
			onclick={ondismiss}
			title="Dismiss"
			aria-label="Dismiss"
		>
			<X size={14} aria-hidden="true" />
		</button>
	</div>
{/if}

<style>
	.turn-notice {
		display: flex;
		align-items: center;
		justify-content: space-between;
		gap: 12px;
		background: rgba(181, 138, 69, 0.09);
		border: 1px solid rgba(181, 138, 69, 0.4);
		color: var(--status-working-text);
		border-radius: 6px;
		padding: 10px 12px;
		margin: 18px 0 0;
		font-size: var(--text-sm);
	}
	.turn-notice-content {
		min-width: 0;
		flex: 1;
	}
	.turn-notice strong {
		display: block;
		font-size: var(--text-sm);
		margin-bottom: 2px;
	}
	.turn-notice-text {
		word-break: break-word;
	}
	.turn-notice-continue {
		display: inline-flex;
		align-items: center;
		gap: 5px;
		border: 1px solid currentColor;
		background: transparent;
		color: inherit;
		border-radius: 4px;
		padding: 4px 9px;
		font: inherit;
		cursor: pointer;
	}
	.turn-notice-continue:hover:not(:disabled) {
		background: rgba(181, 138, 69, 0.14);
	}
	.turn-notice-continue:disabled {
		opacity: 0.5;
		cursor: not-allowed;
	}
	.turn-notice-dismiss {
		display: inline-flex;
		align-items: center;
		justify-content: center;
		width: 24px;
		height: 24px;
		border: none;
		background: transparent;
		color: inherit;
		border-radius: 4px;
		cursor: pointer;
		opacity: 0.75;
	}
	.turn-notice-dismiss:hover {
		opacity: 1;
	}
</style>
