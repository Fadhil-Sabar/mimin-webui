<script lang="ts">
	import { X } from '@lucide/svelte';
	import type { ConversationSummary } from '$lib/client/conversations.svelte';

	type Props = {
		conversation?: ConversationSummary | null;
		loading?: boolean;
		onconfirm?: () => void;
		oncancel?: () => void;
	};

	let { conversation = null, loading = false, onconfirm, oncancel }: Props = $props();
</script>

{#if conversation}
	<div
		class="modal-backdrop"
		role="dialog"
		aria-modal="true"
		tabindex="-1"
		onclick={(e) => {
			if (e.target === e.currentTarget) oncancel?.();
		}}
		onkeydown={(e) => {
			if (e.key === 'Escape') oncancel?.();
		}}
	>
		<div class="modal" role="document">
			<div class="modal-head">
				<h2>Delete chat</h2>
				<button class="icon-button" onclick={oncancel} aria-label="Close dialog">
					<X size={16} />
				</button>
			</div>
			<p class="modal-text">
				Are you sure you want to delete <strong>"{conversation.title}"</strong>? This will
				permanently remove all messages in this conversation.
			</p>
			<div class="modal-actions">
				<button class="button" onclick={oncancel} disabled={loading}>Cancel</button>
				<button class="button danger" onclick={onconfirm} disabled={loading}>
					{loading ? 'Deleting...' : 'Delete'}
				</button>
			</div>
		</div>
	</div>
{/if}

<style>
	.modal-text {
		margin: 0 0 16px;
		color: var(--text-body);
		font-size: var(--text-sm);
		line-height: 1.5;
	}
</style>
