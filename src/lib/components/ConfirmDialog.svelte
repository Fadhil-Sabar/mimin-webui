<script lang="ts">
	import type { Snippet } from 'svelte';
	import { X } from '@lucide/svelte';
	import * as AlertDialog from '$lib/components/ui/alert-dialog/index.js';

	type Props = {
		open: boolean;
		title: string;
		description?: Snippet;
		confirmLabel?: string;
		loadingLabel?: string;
		cancelLabel?: string;
		destructive?: boolean;
		loading?: boolean;
		onconfirm?: () => void;
		oncancel?: () => void;
	};

	let {
		open,
		title,
		description,
		confirmLabel = 'Delete',
		loadingLabel = 'Deleting...',
		cancelLabel = 'Cancel',
		destructive = true,
		loading = false,
		onconfirm,
		oncancel
	}: Props = $props();

	// AlertDialog.Action closes the dialog before the async work settles, which would
	// unmount it mid-flight. Remember that the action caused the close and swallow it.
	let viaAction = false;
	let cancelButton = $state<HTMLButtonElement | null>(null);

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

<AlertDialog.Root {open} onOpenChange={handleOpenChange}>
	<AlertDialog.Content
		class="w-[min(470px,100%)] max-w-none! gap-0 border border-[var(--border-strong)] p-6 shadow-[0_20px_50px_var(--shadow)] ring-0"
		onOpenAutoFocus={(event) => {
			event.preventDefault();
			cancelButton?.focus();
		}}
	>
		<AlertDialog.Header class="flex items-start justify-between gap-4 text-left">
			<AlertDialog.Title
				class="ui-text-lg font-semibold tracking-[-0.015em] text-[var(--text-strong)]"
			>
				{title}
			</AlertDialog.Title>
			<AlertDialog.Cancel
				variant="ghost"
				size="icon-sm"
				disabled={loading}
				aria-label="Close dialog"
			>
				<X size={16} />
			</AlertDialog.Cancel>
		</AlertDialog.Header>
		{#if description}
			<AlertDialog.Description class="ui-text-sm mt-[18px] text-[var(--text-body)]">
				{@render description()}
			</AlertDialog.Description>
		{/if}
		<AlertDialog.Footer
			class="mx-0 mt-[22px] mb-0 flex flex-row justify-end gap-2 rounded-none border-t-0 bg-transparent p-0"
		>
			<AlertDialog.Cancel variant="outline" disabled={loading} bind:ref={cancelButton}>
				{cancelLabel}
			</AlertDialog.Cancel>
			<AlertDialog.Action
				variant={destructive ? 'destructive' : 'default'}
				disabled={loading}
				onclick={handleAction}
			>
				{loading ? loadingLabel : confirmLabel}
			</AlertDialog.Action>
		</AlertDialog.Footer>
	</AlertDialog.Content>
</AlertDialog.Root>
