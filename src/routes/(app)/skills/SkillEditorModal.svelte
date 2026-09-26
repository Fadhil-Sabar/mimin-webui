<script lang="ts">
	import { Check, Info, Maximize2, Minimize2, WandSparkles, X } from '@lucide/svelte';
	import { Button } from '$lib/components/ui/button/index.js';
	import * as Dialog from '$lib/components/ui/dialog/index.js';
	import * as Tabs from '$lib/components/ui/tabs/index.js';
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
	let tab = $state('details');
	let expanded = $state(false);

	let scopeHelper = $derived(
		projectId
			? `Available in ${projects.find((project) => project.id === projectId)?.name ?? 'its project'}.`
			: 'Available in every chat.'
	);

	function handleOpenChange(open: boolean) {
		if (!open) onclose();
	}
</script>

<Dialog.Root open={true} onOpenChange={handleOpenChange}>
	<Dialog.Content
		showCloseButton={false}
		class="flex h-[min(880px,calc(100dvh_-_2.5rem))] w-[min(820px,calc(100%_-_2.5rem))] max-w-none! flex-col gap-0 overflow-hidden border border-[var(--border-strong)] bg-[var(--surface)] p-6 shadow-[0_20px_50px_var(--shadow)] ring-0 max-[560px]:p-[19px]"
		onOpenAutoFocus={(event) => {
			event.preventDefault();
			nameInput?.focus();
		}}
	>
		<!-- `modal` stays on the form so layout.css's `.modal input` / `.modal label` rules keep
		     reaching the fields, the tool grid and the trigger editor exactly as before. The
		     editor only overrides the box itself (padding/border/width) and the tab chrome. -->
		<form
			class="modal editor-modal"
			onsubmit={(event) => {
				event.preventDefault();
				void onsave();
			}}
		>
			<Dialog.Header class="flex flex-row items-center justify-between gap-4">
				<div class="editor-heading">
					<span class="editor-heading-icon"><WandSparkles size={20} aria-hidden="true" /></span>
					<Dialog.Title class="editor-title text-headline-sm text-[var(--text-strong)]">
						{skill ? 'Edit skill' : 'Create a skill'}
					</Dialog.Title>
				</div>
				<Button
					variant="ghost"
					size="icon-sm"
					type="button"
					onclick={onclose}
					aria-label="Close dialog"
					title="Close dialog"><X size={18} /></Button
				>
			</Dialog.Header>

			<Tabs.Root bind:value={tab} class="editor-tabs">
				<Tabs.List class="editor-tab-list">
					<Tabs.Trigger value="details" class="editor-tab">Details</Tabs.Trigger>
					<Tabs.Trigger value="tools" class="editor-tab"
						>Tools <span class="tab-count">{enabledTools.length}</span></Tabs.Trigger
					>
					<Tabs.Trigger value="triggers" class="editor-tab"
						>Triggers <span class="tab-count">{triggerPhrases.length}</span></Tabs.Trigger
					>
				</Tabs.List>

				<div class="editor-body">
					<Tabs.Content value="details">
						<div class="editor-grid">
							<label class="field"
								>Name<input
									bind:this={nameInput}
									bind:value={name}
									maxlength={MAX_NAME}
									required
									placeholder="e.g. Product strategist"
								/></label
							>
							<label class="field"
								>Scope<select
									value={projectId ?? ''}
									onchange={(event) => onchooseproject(event.currentTarget.value)}
									><option value="">Personal</option>{#each projects as project (project.id)}
										<option value={project.id}>{project.name}</option>{/each}</select
								><small>{scopeHelper}</small></label
							>
							<label class="field full"
								>Description<textarea
									bind:value={description}
									maxlength={MAX_DESCRIPTION}
									rows="2"
									placeholder="A short note about when to use this skill"></textarea></label
							>
							<div class="field full">
								<div class="field-row">
									<label for="skill-instructions">Instructions</label>
									<div class="field-tools">
										<span class="field-format">Markdown</span>
										<button
											type="button"
											class="field-expand"
											aria-pressed={expanded}
											aria-label={expanded
												? 'Collapse instructions editor'
												: 'Expand instructions editor'}
											title={expanded ? 'Collapse editor' : 'Expand editor'}
											onclick={() => (expanded = !expanded)}
										>
											{#if expanded}<Minimize2 size={15} aria-hidden="true" />{:else}<Maximize2
													size={15}
													aria-hidden="true"
												/>{/if}
										</button>
									</div>
								</div>
								<textarea
									id="skill-instructions"
									class:expanded
									bind:value={instructions}
									maxlength={MAX_INSTRUCTIONS}
									rows={expanded ? 26 : 10}
									required
									placeholder="Describe the approach, tone, constraints, and output format this skill should use."
								></textarea>
								<div class="field-count">
									{instructions.length.toLocaleString()} / {MAX_INSTRUCTIONS.toLocaleString()}
								</div>
							</div>
						</div>
					</Tabs.Content>
					<Tabs.Content value="tools">
						<ToolGrid {tools} {enabledTools} {projectId} ontoggle={ontoggletool} />
					</Tabs.Content>
					<Tabs.Content value="triggers">
						<TriggerPhraseEditor
							phrases={triggerPhrases}
							bind:value={triggerDraft}
							onadd={onaddtrigger}
							onremove={onremovetrigger}
						/>
					</Tabs.Content>
				</div>
			</Tabs.Root>

			{#if formError}<div class="form-error" role="alert"><Info size={15} /> {formError}</div>{/if}

			<Dialog.Footer
				class="mx-0 mt-0 mb-0 flex flex-row items-center justify-between gap-4 rounded-none border-t border-[var(--border)] bg-transparent p-0 pt-4 sm:justify-between"
			>
				<p class="footer-note">Changes apply when this skill is used.</p>
				<div class="footer-actions">
					<Button variant="outline" type="button" onclick={onclose} disabled={saving}>Cancel</Button
					><Button variant="default" type="submit" disabled={saving}
						>{#if saving}Saving...{:else}<Check size={15} aria-hidden="true" />
							{skill ? 'Save changes' : 'Create skill'}{/if}</Button
					>
				</div>
			</Dialog.Footer>
		</form>
	</Dialog.Content>
</Dialog.Root>

<style>
	/* Dialog.Content paints the modal box now (width, padding, border, shadow), so the
	   form is the flex column that keeps the footer fixed while the body scrolls.
	   Two things are deliberate:
	   - `modal` stays on the form, because layout.css's `.modal input` / `.modal label`
	     rules still reach the fields, the ToolGrid rows and the TriggerPhraseEditor input.
	   - the box properties are re-declared, because shadcn's Content ships its own
	     padding/background and `.modal` ships a width/border/shadow. */
	:global(.modal.editor-modal) {
		display: flex;
		flex: 1 1 auto;
		flex-direction: column;
		min-height: 0;
		width: 100%;
		padding: 0;
		overflow: hidden;
		color: var(--text);
		font-size: var(--text-body-lg);
		line-height: var(--text-body-lg--line-height);
		letter-spacing: var(--text-body-lg--letter-spacing);
		background: transparent;
		border: 0;
		border-radius: 0;
		box-shadow: none;
	}
	/* `.modal h2` (layout.css) adds a bottom margin that would push the title off the
	   close button's centre line. */
	:global(.modal.editor-modal h2) {
		margin: 0;
	}
	.editor-heading {
		display: flex;
		align-items: center;
		gap: var(--space-3);
		min-width: 0;
	}
	.editor-heading-icon {
		display: grid;
		place-items: center;
		color: var(--text-strong);
	}
	/* Tabs chrome is global because the class is handed to the Tabs components; the
	   unlayered component CSS also outranks the primitives' utility defaults
	   (including the `data-active` underline they never activate for bits-ui). */
	:global(.editor-tabs) {
		display: flex;
		flex: 1 1 auto;
		flex-direction: column;
		min-height: 0;
		gap: 0;
		margin-top: var(--space-5);
	}
	:global(.editor-tab-list) {
		display: flex;
		width: 100%;
		height: auto;
		flex: 0 0 auto;
		align-items: center;
		justify-content: flex-start;
		gap: var(--space-6);
		padding: 0;
		background: transparent;
		border: 0;
		border-bottom: 1px solid var(--border);
		border-radius: 0;
	}
	:global(.editor-tab) {
		position: relative;
		flex: 0 0 auto;
		height: auto;
		padding: 0 0 10px;
		color: var(--text-dim);
		font-family: var(--font-body);
		font-size: var(--text-body-md);
		line-height: var(--text-body-md--line-height);
		letter-spacing: var(--text-body-md--letter-spacing);
		font-weight: 500;
		background: transparent;
		border: 0;
		border-radius: 0;
	}
	:global(.editor-tab::after) {
		display: none;
	}
	:global(.editor-tab[data-state='active']) {
		color: var(--text-strong);
	}
	:global(.editor-tab[data-state='active'])::after {
		display: block;
		position: absolute;
		right: 0;
		bottom: -1px;
		left: 0;
		height: 2px;
		background: var(--text-strong);
		/* The primitive ships `after:opacity-0`; the underline is switched on here. */
		opacity: 1;
		content: '';
	}
	:global(.editor-tab:hover) {
		color: var(--text-strong);
	}
	:global(.editor-tab .tab-count) {
		margin-left: 5px;
		color: var(--text-faint);
		font-variant-numeric: tabular-nums;
	}
	.editor-body {
		flex: 1 1 auto;
		min-height: 0;
		overflow-y: auto;
		padding: var(--space-5) 0 var(--space-4);
	}
	.editor-grid {
		display: grid;
		grid-template-columns: minmax(0, 2fr) minmax(0, 1fr);
		gap: 18px;
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
	/* Spacing comes from the grid gap, not `.modal label`'s margin-top. */
	.editor-grid label.field {
		margin-top: 0;
	}
	.editor-grid .field.full {
		grid-column: 1 / -1;
	}
	.editor-grid .field :is(input, textarea, select) {
		display: block;
		width: 100%;
		margin-top: 6px;
		padding: 9px 11px;
		color: var(--text-strong);
		background: var(--surface-subtle);
		border: 1px solid var(--input-border);
		border-radius: var(--radius-md);
		font-family: var(--font-body);
		font-size: var(--text-body-md);
		line-height: var(--text-body-md--line-height);
		letter-spacing: var(--text-body-md--letter-spacing);
	}
	.editor-grid .field input,
	.editor-grid .field select {
		min-height: 44px;
	}
	.editor-grid .field textarea {
		min-height: 4.5rem;
		resize: vertical;
	}
	.editor-grid .field textarea.expanded {
		min-height: min(52vh, 34rem);
	}
	.editor-grid .field :is(input, textarea, select):focus {
		border-color: var(--focus);
	}
	.editor-grid .field select {
		appearance: auto;
	}
	.editor-grid .field small {
		display: block;
		margin-top: 6px;
		color: var(--text-dim);
		font-size: var(--text-label-sm);
		line-height: var(--text-label-sm--line-height);
		letter-spacing: var(--text-label-sm--letter-spacing);
		font-weight: 400;
	}
	.field-row {
		display: flex;
		align-items: center;
		justify-content: space-between;
		gap: var(--space-3);
	}
	:global(.modal.editor-modal) .field-row label {
		margin-top: 0;
	}
	.field-tools {
		display: flex;
		align-items: center;
		gap: var(--space-2);
	}
	.field-format {
		color: var(--text-faint);
		font-size: var(--text-label-sm);
		line-height: var(--text-label-sm--line-height);
		letter-spacing: var(--text-label-sm--letter-spacing);
		font-weight: 400;
	}
	.field-expand {
		display: grid;
		place-items: center;
		width: 24px;
		height: 24px;
		padding: 0;
		color: var(--text-dim);
		background: transparent;
		border: 0;
		border-radius: var(--radius-sm);
	}
	.field-expand:hover {
		color: var(--text-strong);
		background: var(--surface-hover);
	}
	.field-count {
		margin-top: 6px;
		color: var(--text-faint);
		font-size: var(--text-label-sm);
		line-height: var(--text-label-sm--line-height);
		letter-spacing: var(--text-label-sm--letter-spacing);
		font-weight: 400;
		font-variant-numeric: tabular-nums;
		text-align: right;
	}
	.footer-note {
		margin: 0;
		color: var(--text-dim);
		font-size: var(--text-body-sm);
		line-height: var(--text-body-sm--line-height);
		letter-spacing: var(--text-body-sm--letter-spacing);
	}
	.footer-actions {
		display: flex;
		align-items: center;
		gap: var(--space-2);
		/* Keeps the buttons right-aligned when the note is hidden on narrow screens. */
		margin-left: auto;
	}
	.form-error {
		display: flex;
		align-items: flex-start;
		gap: 7px;
		margin-top: var(--space-3);
		padding: 10px var(--space-3);
		color: var(--danger-text);
		background: color-mix(in srgb, var(--danger-text) 8%, var(--surface));
		border: 1px solid color-mix(in srgb, var(--danger-text) 25%, var(--border));
		border-radius: var(--radius-md);
		font-size: var(--text-body-sm);
		line-height: var(--text-body-sm--line-height);
		letter-spacing: var(--text-body-sm--letter-spacing);
	}
	@media (max-width: 560px) {
		.editor-grid {
			grid-template-columns: 1fr;
		}
		.editor-grid .field.full {
			grid-column: auto;
		}
		.footer-note {
			display: none;
		}
	}
</style>
