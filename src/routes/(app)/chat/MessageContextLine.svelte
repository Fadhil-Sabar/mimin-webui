<script lang="ts">
	import type { MessageContext } from './chat-format';

	/**
	 * The compact context summary at the end of a reply's footer row. The full
	 * breakdown lives in the tooltip so the short form loses nothing.
	 */
	let { context }: { context: MessageContext } = $props();
</script>

<p class="context-line" title={context.detail}>{context.summary}</p>

<style>
	.context-line {
		/* Pushes the summary to the end of the footer row. An auto margin rather than
		   `justify-content: space-between`, which would pull the user message's Retry
		   button off the right edge it is aligned to. */
		margin: 0 0 0 auto;
		min-width: 0;
		color: var(--text-dim);
		font-size: var(--text-body-md);
		line-height: var(--text-body-md--line-height);
		letter-spacing: var(--text-body-md--letter-spacing);
		font-weight: var(--text-body-md--font-weight);
		font-variant-numeric: tabular-nums;
		white-space: nowrap;
		overflow: hidden;
		text-overflow: ellipsis;
	}
</style>
