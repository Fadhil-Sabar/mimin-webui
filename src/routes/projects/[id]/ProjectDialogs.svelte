<script lang="ts">
	import { tick } from 'svelte';
	import { X } from '@lucide/svelte';
	import { focusModalPrimary, trapModalFocus } from '../../skills/skills-focus';
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

	let activeModal = $state<HTMLElement>();
	let previousDialog: 'edit' | 'delete-project' | 'delete-file' | null = null;
	let restoreFocusTo: HTMLElement | null = null;
	let openDialog: 'edit' | 'delete-project' | 'delete-file' | null = $derived(
		editingProject
			? 'edit'
			: deletingProject && project
				? 'delete-project'
				: deletingFile
					? 'delete-file'
					: null
	);

	$effect(() => {
		const dialog = openDialog;
		if (dialog && dialog !== previousDialog) {
			if (!previousDialog && document.activeElement instanceof HTMLElement) {
				restoreFocusTo = document.activeElement;
			}
			void focusModalPrimary(activeModal);
		} else if (!dialog && previousDialog) {
			void tick().then(() => {
				restoreFocusTo?.focus();
				restoreFocusTo = null;
			});
		}
		previousDialog = dialog;
	});
</script>

{#if editingProject}
	<div
		class="modal-backdrop"
		role="dialog"
		aria-modal="true"
		aria-labelledby="edit-project-title"
		tabindex="-1"
		bind:this={activeModal}
		onclick={(event) => event.target === event.currentTarget && oncloseedit()}
		onkeydown={(event) => {
			if (event.key === 'Escape') oncloseedit();
			else trapModalFocus(event, activeModal);
		}}
	>
		<form
			class="modal"
			onsubmit={(event) => {
				event.preventDefault();
				void onsaveedit();
			}}
		>
			<div class="modal-head">
				<h2 id="edit-project-title">Edit project</h2>
				<button type="button" class="icon-button" onclick={oncloseedit} aria-label="Close dialog"
					><X size={16} /></button
				>
			</div>
			<label
				>Project name<input
					bind:value={editName}
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
				<button type="button" class="button" onclick={oncloseedit} disabled={savingProject}
					>Cancel</button
				>
				<button type="submit" class="button primary" disabled={savingProject}
					>{savingProject ? 'Saving...' : 'Save changes'}</button
				>
			</div>
		</form>
	</div>
{/if}
{#if deletingProject && project}
	<div
		class="modal-backdrop"
		role="dialog"
		aria-modal="true"
		aria-labelledby="delete-project-title"
		tabindex="-1"
		bind:this={activeModal}
		onclick={(event) => event.target === event.currentTarget && onclosedeleteproject()}
		onkeydown={(event) => {
			if (event.key === 'Escape') onclosedeleteproject();
			else trapModalFocus(event, activeModal);
		}}
	>
		<div class="modal" role="document">
			<div class="modal-head">
				<h2 id="delete-project-title">Delete project</h2>
				<button class="icon-button" onclick={onclosedeleteproject} aria-label="Close dialog"
					><X size={16} /></button
				>
			</div>
			<p class="modal-text">
				Delete <strong>“{project.name}”</strong>? This permanently removes the project and its
				knowledge files. Its conversations will remain available as standalone chats.
			</p>
			<div class="modal-actions">
				<button
					class="button"
					onclick={onclosedeleteproject}
					disabled={deleteProjectLoading}
					data-modal-primary>Cancel</button
				>
				<button
					class="button danger"
					onclick={() => void onconfirmdeleteproject()}
					disabled={deleteProjectLoading}
					>{deleteProjectLoading ? 'Deleting...' : 'Delete project'}</button
				>
			</div>
		</div>
	</div>
{/if}
{#if deletingFile}
	<div
		class="modal-backdrop"
		role="dialog"
		aria-modal="true"
		aria-labelledby="delete-file-title"
		tabindex="-1"
		bind:this={activeModal}
		onclick={(event) => event.target === event.currentTarget && onclosedeletefile()}
		onkeydown={(event) => {
			if (event.key === 'Escape') onclosedeletefile();
			else trapModalFocus(event, activeModal);
		}}
	>
		<div class="modal" role="document">
			<div class="modal-head">
				<h2 id="delete-file-title">Delete knowledge file</h2>
				<button class="icon-button" onclick={onclosedeletefile} aria-label="Close dialog"
					><X size={16} /></button
				>
			</div>
			<p class="modal-text">
				Remove <strong>“{deletingFile.filename}”</strong> from this project? The agent will no longer
				be able to use it.
			</p>
			<div class="modal-actions">
				<button
					class="button"
					onclick={onclosedeletefile}
					disabled={deleteFileLoading}
					data-modal-primary>Cancel</button
				>
				<button
					class="button danger"
					onclick={() => void onconfirmdeletefile()}
					disabled={deleteFileLoading}>{deleteFileLoading ? 'Deleting...' : 'Delete file'}</button
				>
			</div>
		</div>
	</div>
{/if}

<style>
	.modal-backdrop {
		position: fixed;
		inset: 0;
		display: grid;
		place-items: center;
		padding: 20px;
		background: var(--overlay);
		z-index: 10;
	}
	.modal {
		width: min(480px, 100%);
		max-height: min(680px, calc(100dvh - 40px));
		overflow: auto;
		padding: 24px;
		background: var(--surface);
		border: 1px solid var(--border-strong);
		border-radius: 12px;
		box-shadow: 0 20px 50px var(--shadow);
	}
	.modal-head {
		display: flex;
		align-items: flex-start;
		justify-content: space-between;
		gap: 16px;
	}
	.modal h2 {
		margin: 0 0 16px;
		font-family: var(--font-body);
		font-size: var(--text-lg);
		font-weight: 600;
		line-height: 1.3;
		letter-spacing: -0.015em;
		color: var(--text-strong);
	}
	.modal label {
		display: block;
		margin-top: 14px;
		color: var(--text-muted);
		font-size: var(--text-xs);
		font-weight: 500;
	}
	.modal input,
	.modal textarea {
		display: block;
		width: 100%;
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
	.modal input:focus,
	.modal textarea:focus {
		border-color: var(--focus);
	}
	.modal textarea {
		min-height: 80px;
		resize: vertical;
	}
	.modal-text {
		margin: 0 0 16px;
		color: var(--text-body);
		font-size: var(--text-sm);
		line-height: 1.55;
	}
	.modal-actions {
		display: flex;
		justify-content: flex-end;
		gap: 8px;
		margin-top: 22px;
	}
	.button {
		display: inline-flex;
		align-items: center;
		justify-content: center;
		gap: 7px;
		min-height: 36px;
		padding: 7px 12px;
		border-radius: 6px;
		border: 1px solid var(--border-strong);
		background: var(--surface);
		color: var(--text-body);
		font-family: var(--font-body);
		font-size: var(--text-sm);
		font-weight: 500;
		line-height: 1;
		white-space: nowrap;
		transition: 0.15s ease;
	}
	.button:hover {
		color: var(--text-strong);
		border-color: var(--text-dim);
		background: var(--surface-hover);
	}
	.button.primary {
		color: var(--accent-fg);
		background: var(--accent-bg);
		border-color: var(--accent-bg);
	}
	.button.primary:hover {
		background: var(--accent-bg-hover);
		border-color: var(--accent-bg-hover);
	}
	.button.danger {
		color: var(--danger-text);
		border-color: color-mix(in srgb, var(--danger-text) 30%, transparent);
		background: transparent;
	}
	.button.danger:hover {
		background: color-mix(in srgb, var(--danger-text) 10%, transparent);
		border-color: var(--danger-text);
		color: var(--danger-text);
	}
</style>
