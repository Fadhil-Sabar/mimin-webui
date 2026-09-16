<script lang="ts">
	import { X } from '@lucide/svelte';
	import * as AlertDialog from '$lib/components/ui/alert-dialog/index.js';
	import type { ConversationSummary } from '$lib/client/conversations.svelte';

	type Props = {
		conversation?: ConversationSummary | null;
		loading?: boolean;
		onconfirm?: () => void;
		oncancel?: () => void;
	};

	let { conversation = null, loading = false, onconfirm, oncancel }: Props = $props();

	let viaAction = false;

	function handleAction() {
		viaAction = true;
		onconfirm?.();
	}

	function handleOpenChange(next: boolean) {
		if (next) return;
		if (viaAction) {
			viaAction = false;
			return;
		}
		if (!loading) oncancel?.();
	}
</script>

<AlertDialog.Root open={Boolean(conversation)} onOpenChange={handleOpenChange}>
	<AlertDialog.Content
		class="w-[min(470px,100%)] max-w-none! gap-0 border border-[var(--border-strong)] p-6 shadow-[0_20px_50px_var(--shadow)] ring-0"
	>
		<AlertDialog.Header class="flex items-start justify-between gap-4 text-left">
			<AlertDialog.Title
				class="ui-text-lg font-semibold tracking-[-0.015em] text-[var(--text-strong)]"
			>
				Delete chat
			</AlertDialog.Title>
			<AlertDialog.Cancel variant="ghost" size="icon-sm" aria-label="Close dialog">
				<X size={16} />
			</AlertDialog.Cancel>
		</AlertDialog.Header>
		<AlertDialog.Description class="ui-text-sm mt-[18px] text-[var(--text-body)]">
			Are you sure you want to delete <strong>"{conversation?.title}"</strong>? This will
			permanently remove all messages in this conversation.
		</AlertDialog.Description>
		<AlertDialog.Footer
			class="mx-0 mt-[22px] mb-0 flex flex-row justify-end gap-2 rounded-none border-t-0 bg-transparent p-0"
		>
			<AlertDialog.Cancel variant="outline" disabled={loading}>Cancel</AlertDialog.Cancel>
			<AlertDialog.Action variant="destructive" disabled={loading} onclick={handleAction}>
				{loading ? 'Deleting...' : 'Delete'}
			</AlertDialog.Action>
		</AlertDialog.Footer>
	</AlertDialog.Content>
</AlertDialog.Root>
