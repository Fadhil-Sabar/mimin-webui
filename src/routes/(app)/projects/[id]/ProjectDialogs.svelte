<script lang="ts">
	import { X } from '@lucide/svelte';
	import ConfirmDialog from '$lib/components/ConfirmDialog.svelte';
	import { Button } from '$lib/components/ui/button/index.js';
	import * as Dialog from '$lib/components/ui/dialog/index.js';
	import type { Project, ProjectFile } from './project-types';

	let {
		project,
		editingProject,
		editName = $bindable(''),
		editDescription = $bindable(''),
		editInstructions = $bindable(''),
		savingProject,
		oncloseedit,
		onsaveedit,
		deletingProject,
		deleteProjectLoading,
		onclosedeleteproject,
		onconfirmdeleteproject,
		deletingFile,
		deleteFileLoading,
		onclosedeletefile,
		onconfirmdeletefile
	}: {
		project: Project | null;
		editingProject: boolean;
		editName?: string;
		editDescription?: string;
		editInstructions?: string;
		savingProject: boolean;
		oncloseedit: () => void;
		onsaveedit: () => void;
		deletingProject: boolean;
		deleteProjectLoading: boolean;
		onclosedeleteproject: () => void;
		onconfirmdeleteproject: () => void;
		deletingFile: ProjectFile | null;
		deleteFileLoading: boolean;
		onclosedeletefile: () => void;
		onconfirmdeletefile: () => void;
	} = $props();

	// At most one dialog is open at a time: the first matching state wins, so we
	// gate every dialog's `open` on the resolved dialog instead of independent flags.
	let openDialog: 'edit' | 'delete-project' | 'delete-file' | null = $derived(
		editingProject
			? 'edit'
			: deletingProject && project
				? 'delete-project'
				: deletingFile
					? 'delete-file'
					: null
	);

	let editNameInput = $state<HTMLInputElement | null>(null);

	function handleEditOpenChange(next: boolean) {
		if (!next) oncloseedit();
	}
</script>

<Dialog.Root open={openDialog === 'edit'} onOpenChange={handleEditOpenChange}>
	<Dialog.Content
		showCloseButton={false}
		class="max-h-[min(680px,calc(100dvh_-_40px))] w-[min(480px,100%)] max-w-none! gap-0 overflow-auto rounded-xl border border-[var(--border-strong)] p-6 shadow-[0_20px_50px_var(--shadow)] ring-0"
		onOpenAutoFocus={(event) => {
			event.preventDefault();
			editNameInput?.focus();
		}}
	>
		<form
			class="dialog-shell"
			onsubmit={(event) => {
				event.preventDefault();
				void onsaveedit();
			}}
		>
			<Dialog.Header class="flex flex-row items-start justify-between gap-4 text-left">
				<Dialog.Title
					id="edit-project-title"
					class="ui-text-lg mb-4 font-semibold tracking-[-0.015em] text-[var(--text-strong)]"
				>
					Edit project
				</Dialog.Title>
				<Button variant="ghost" size="icon" onclick={oncloseedit} aria-label="Close dialog"
					><X size={16} /></Button
				>
			</Dialog.Header>
			<label
				>Project name<input
					bind:value={editName}
					bind:this={editNameInput}
					maxlength="120"
					required
					data-modal-primary
				/></label
			>
			<label>Description<textarea bind:value={editDescription} maxlength="2000"></textarea></label>
			<label
				>Instructions<textarea
					bind:value={editInstructions}
					maxlength="10000"
					placeholder="How should the agent help with this project?"></textarea></label
			>
			<div class="modal-actions">
				<Button variant="outline" onclick={oncloseedit} disabled={savingProject}>Cancel</Button>
				<Button variant="default" type="submit" disabled={savingProject}
					>{savingProject ? 'Saving...' : 'Save changes'}</Button
				>
			</div>
		</form>
	</Dialog.Content>
</Dialog.Root>

<ConfirmDialog
	open={openDialog === 'delete-project'}
	title="Delete project"
	confirmLabel="Delete project"
	loading={deleteProjectLoading}
	onconfirm={onconfirmdeleteproject}
	oncancel={onclosedeleteproject}
>
	{#snippet description()}
		Delete <strong>“{project?.name}”</strong>? This permanently removes the project and its
		knowledge files. Its conversations will remain available as standalone chats.
	{/snippet}
</ConfirmDialog>

<ConfirmDialog
	open={openDialog === 'delete-file'}
	title="Delete knowledge file"
	confirmLabel="Delete file"
	loading={deleteFileLoading}
	onconfirm={onconfirmdeletefile}
	oncancel={onclosedeletefile}
>
	{#snippet description()}
		Remove <strong>“{deletingFile?.filename}”</strong> from this project? The agent will no longer be
		able to use it.
	{/snippet}
</ConfirmDialog>

<style>
	.dialog-shell label {
		display: block;
		margin-top: 14px;
		color: var(--text-muted);
		font-size: var(--text-xs);
		font-weight: 500;
	}
	.dialog-shell input,
	.dialog-shell textarea {
		display: block;
		width: 100%;
		min-height: 44px;
		margin-top: 6px;
		padding: 8px 11px;
		border: 1px solid var(--input-border);
		border-radius: 6px;
		outline: 0;
		color: var(--text-strong);
		background: var(--surface);
		font-family: var(--font-body);
		font-size: var(--text-sm);
		line-height: 1.5;
		transition: border-color 0.15s ease;
	}
	.dialog-shell input:focus,
	.dialog-shell textarea:focus {
		border-color: var(--focus);
	}
	.dialog-shell textarea {
		min-height: 80px;
		resize: vertical;
	}
	.modal-actions {
		display: flex;
		justify-content: flex-end;
		gap: 8px;
		margin-top: 22px;
	}
</style>
