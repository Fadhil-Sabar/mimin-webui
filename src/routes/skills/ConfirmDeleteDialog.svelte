<script lang="ts">
	import { X } from '@lucide/svelte';
	import * as AlertDialog from '$lib/components/ui/alert-dialog/index.js';
	import type { Skill } from './skills-types';

	let {
		skill,
		deleting,
		onclose,
		onconfirm
	}: {
		skill: Skill;
		deleting: boolean;
		onclose: () => void;
		onconfirm: () => void;
	} = $props();

	let viaAction = false;
	let keepButton = $state<HTMLButtonElement | null>(null);

	function handleAction() {
		viaAction = true;
		onconfirm();
	}

	function handleOpenChange(next: boolean) {
		if (next) return;
		if (viaAction) {
			viaAction = false;
			return;
		}
		if (!deleting) onclose();
	}
</script>

<AlertDialog.Root open={true} onOpenChange={handleOpenChange}>
	<AlertDialog.Content
		class="w-[min(470px,100%)] max-w-none! gap-0 border border-[var(--border-strong)] p-6 shadow-[0_20px_50px_var(--shadow)] ring-0"
		onOpenAutoFocus={(event) => {
			event.preventDefault();
			keepButton?.focus();
		}}
	>
		<AlertDialog.Header class="flex items-start justify-between gap-4 text-left">
			<AlertDialog.Title
				class="ui-text-lg font-semibold tracking-[-0.015em] text-[var(--text-strong)]"
			>
				Delete skill?
			</AlertDialog.Title>
			<AlertDialog.Cancel
				variant="ghost"
				size="icon-sm"
				disabled={deleting}
				aria-label="Close dialog"
			>
				<X size={18} />
			</AlertDialog.Cancel>
		</AlertDialog.Header>
		<AlertDialog.Description class="ui-text-sm mt-[18px] text-[var(--text-body)]">
			Delete <strong>&ldquo;{skill.name}&rdquo;</strong>? Existing conversation turns keep their
			saved instructions, while future activations will no longer find this skill.
		</AlertDialog.Description>
		<AlertDialog.Footer
			class="mx-0 mt-[22px] mb-0 flex flex-row justify-end gap-2 rounded-none border-t-0 bg-transparent p-0"
		>
			<AlertDialog.Cancel variant="outline" disabled={deleting} bind:ref={keepButton}>
				Keep skill
			</AlertDialog.Cancel>
			<AlertDialog.Action variant="destructive" disabled={deleting} onclick={handleAction}>
				{deleting ? 'Deleting...' : 'Delete skill'}
			</AlertDialog.Action>
		</AlertDialog.Footer>
	</AlertDialog.Content>
</AlertDialog.Root>
