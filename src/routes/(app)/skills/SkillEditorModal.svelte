<script lang="ts">
	import { Check, Info, X } from '@lucide/svelte';
	import { Button } from '$lib/components/ui/button/index.js';
	import * as Dialog from '$lib/components/ui/dialog/index.js';
	import ToolGrid from './ToolGrid.svelte';
	import TriggerPhraseEditor from './TriggerPhraseEditor.svelte';
	import { MAX_DESCRIPTION, MAX_INSTRUCTIONS, MAX_NAME } from './skills-constants';
	import type { Project, Skill, Tool } from './skills-types';

	let {
		skill,
		name = $bindable(''),
		description = $bindable(''),
		instructions = $bindable(''),
		triggerPhrases,
		triggerDraft = $bindable(''),
		projectId,
		projects,
		tools,
		enabledTools,
		saving,
		formError,
		onsave,
		onclose,
		ontoggletool,
		onchooseproject,
		onaddtrigger,
		onremovetrigger
	}: {
		skill: Skill | null;
		name?: string;
		description?: string;
		instructions?: string;
		triggerPhrases: string[];
		triggerDraft?: string;
		projectId: string | null;
		projects: Project[];
		tools: Tool[];
		enabledTools: string[];
		saving: boolean;
		formError: string;
		onsave: () => void;
		onclose: () => void;
		ontoggletool: (name: string) => void;
		onchooseproject: (value: string) => void;
		onaddtrigger: () => void;
		onremovetrigger: (index: number) => void;
	} = $props();

	let nameInput = $state<HTMLInputElement | null>(null);

	function handleOpenChange(open: boolean) {
		if (!open) onclose();
	}
</script>

<Dialog.Root open={true} onOpenChange={handleOpenChange}>
	<Dialog.Content
		showCloseButton={false}
		class="max-h-[min(850px,calc(100dvh_-_40px))] w-[min(660px,calc(100%_-_2.5rem))] max-w-none! gap-0 overflow-auto border border-[var(--border-strong)] bg-[var(--surface)] p-6 shadow-[0_20px_50px_var(--shadow)] ring-0 max-[560px]:p-[19px]"
		onOpenAutoFocus={(event) => {
			event.preventDefault();
			nameInput?.focus();
		}}
	>
		<!-- `modal` stays on the form so layout.css's `.modal input` / `.modal label` rules keep
		     reaching the fields, the tool grid and the trigger editor exactly as before. -->
		<form
			class="modal editor-modal"
			onsubmit={(event) => {
				event.preventDefault();
				void onsave();
			}}
		>
			<Dialog.Header class="flex flex-row items-start justify-between gap-4">
				<Dialog.Title class="text-headline-sm text-[var(--text-strong)]">
					{skill ? 'Edit skill' : 'Create a skill'}
				</Dialog.Title>
				<Button
					variant="ghost"
					size="icon-sm"
					type="button"
					onclick={onclose}
					aria-label="Close dialog"><X size={18} /></Button
				>
			</Dialog.Header>
			<div class="editor-grid">
				<label class="field full"
					>Name <span class="field-count">{name.length}/{MAX_NAME}</span><input
						bind:this={nameInput}
						bind:value={name}
						maxlength={MAX_NAME}
						required
						placeholder="e.g. Product strategist"
					/></label
				>
				<label class="field full"
					>Description <span class="field-count">{description.length}/{MAX_DESCRIPTION}</span><input
						bind:value={description}
						maxlength={MAX_DESCRIPTION}
						placeholder="A short note about when to use this skill"
					/></label
				>
				<label class="field full"
					>Scope<select
						value={projectId ?? ''}
						onchange={(event) => onchooseproject(event.currentTarget.value)}
						><option value="">Personal · available in every chat</option
						>{#each projects as project (project.id)}<option value={project.id}
								>Project · {project.name}</option
							>{/each}</select
					><small>Project skills are only available inside their project conversations.</small
					></label
				>
				<label class="field full"
					>Instructions <span class="field-count"
						>{instructions.length.toLocaleString()}/{MAX_INSTRUCTIONS.toLocaleString()}</span
					><textarea
						bind:value={instructions}
						maxlength={MAX_INSTRUCTIONS}
						rows="8"
						required
						placeholder="Describe the approach, tone, constraints, and output format this skill should use."
					></textarea></label
				>
			</div>
			<ToolGrid {tools} {enabledTools} {projectId} ontoggle={ontoggletool} />
			<TriggerPhraseEditor
				phrases={triggerPhrases}
				bind:value={triggerDraft}
				onadd={onaddtrigger}
				onremove={onremovetrigger}
			/>
			{#if formError}<div class="form-error" role="alert"><Info size={15} /> {formError}</div>{/if}
			<Dialog.Footer
				class="mx-0 mt-[22px] mb-0 flex flex-row justify-end gap-2 rounded-none border-t-0 bg-transparent p-0"
			>
				<Button variant="outline" type="button" onclick={onclose} disabled={saving}>Cancel</Button
				><Button variant="default" type="submit" disabled={saving}
					>{#if saving}Saving...{:else}<Check size={15} />
						{skill ? 'Save changes' : 'Create skill'}{/if}</Button
				>
			</Dialog.Footer>
		</form>
	</Dialog.Content>
</Dialog.Root>

<style>
	/* Dialog.Content paints the modal box now (width, padding, border, shadow, scrolling), so
	   the form is a plain block wrapper. Two things are deliberate:
	   - `modal` stays on the form, because layout.css's `.modal input` / `.modal label` rules
	     still reach the fields, the ToolGrid rows and the TriggerPhraseEditor input. Dropping
	     the class would change those inner spacings.
	   - the type is re-declared, because shadcn's Content ships `text-sm`; without this the
	     `normal` line-height the modal used to inherit from `:root` would become text-sm's
	     ratio (and shift every field label / tool card by a couple of pixels). */
	.modal {
		width: 100%;
		max-height: none;
		overflow: visible;
		padding: 0;
		color: var(--text);
		font-size: var(--text-body-lg);
		line-height: var(--text-body-lg--line-height);
		letter-spacing: var(--text-body-lg--letter-spacing);
		background: transparent;
		border: 0;
		border-radius: 0;
		box-shadow: none;
	}
	.editor-grid {
		display: grid;
		grid-template-columns: 1fr 1fr;
		gap: 15px;
		margin-top: 20px;
	}
	.field {
		display: block;
		min-width: 0;
		color: var(--text-muted);
		font-size: var(--text-body-sm);
		line-height: var(--text-body-sm--line-height);
		letter-spacing: var(--text-body-sm--letter-spacing);
		font-weight: 500;
	}
	.field.full {
		grid-column: 1 / -1;
	}
	.field-count {
		float: right;
		color: var(--text-faint);
		font-size: var(--text-label-sm);
		font-variant-numeric: tabular-nums;
		line-height: var(--text-label-sm--line-height);
		letter-spacing: var(--text-label-sm--letter-spacing);
		font-weight: 400;
	}
	.field input,
	.field textarea,
	.field select {
		display: block;
		width: 100%;
		margin-top: 6px;
		padding: 9px 11px;
		color: var(--text-strong);
		background: var(--surface-subtle);
		border: 1px solid var(--input-border);
		border-radius: 6px;
		outline: 0;
		font-size: var(--text-body-md);
		line-height: var(--text-body-md--line-height);
		letter-spacing: var(--text-body-md--letter-spacing);
	}
	.field textarea {
		min-height: 150px;
		resize: vertical;
		line-height: var(--text-body-md--line-height);
	}
	.field select {
		appearance: auto;
	}
	.field input:focus,
	.field textarea:focus,
	.field select:focus {
		border-color: var(--focus);
		box-shadow: 0 0 0 2px color-mix(in srgb, var(--focus) 17%, transparent);
	}
	.field small {
		display: block;
		margin-top: 5px;
		color: var(--text-dim);
		font-size: var(--text-label-sm);
		line-height: var(--text-label-sm--line-height);
		letter-spacing: var(--text-label-sm--letter-spacing);
		font-weight: 400;
	}
	.form-error {
		display: flex;
		align-items: flex-start;
		gap: 7px;
		margin-top: 16px;
		padding: 10px 12px;
		color: var(--danger-text);
		background: color-mix(in srgb, var(--danger-text) 8%, var(--surface));
		border: 1px solid color-mix(in srgb, var(--danger-text) 25%, var(--border));
		border-radius: 6px;
		font-size: var(--text-body-sm);
		line-height: var(--text-body-sm--line-height);
		letter-spacing: var(--text-body-sm--letter-spacing);
	}
	@media (max-width: 560px) {
		.editor-grid {
			grid-template-columns: 1fr;
		}
		.field.full {
			grid-column: auto;
		}
	}
</style>
