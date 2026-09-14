<script lang="ts">
	import { tick, onMount } from 'svelte';
	import { Check, Info, X } from '@lucide/svelte';
	import ToolGrid from './ToolGrid.svelte';
	import TriggerPhraseEditor from './TriggerPhraseEditor.svelte';
	import { MAX_DESCRIPTION, MAX_INSTRUCTIONS, MAX_NAME } from './skills-constants';
	import { focusModalPrimary, trapModalFocus } from './skills-focus';
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

	let formElement = $state<HTMLFormElement>();
	let opener: HTMLElement | null = null;

	onMount(() => {
		opener = document.activeElement instanceof HTMLElement ? document.activeElement : null;
	});

	async function close() {
		onclose();
		await tick();
		opener?.focus();
	}

	$effect(() => {
		const element = formElement;
		if (element) void focusModalPrimary(element);
	});
</script>

<div
	class="modal-backdrop"
	role="dialog"
	aria-modal="true"
	aria-labelledby="skill-editor-title"
	tabindex="-1"
	onclick={(event) => event.target === event.currentTarget && void close()}
	onkeydown={(event) => {
		if (event.key === 'Escape') void close();
		trapModalFocus(event, formElement);
	}}
>
	<form
		class="modal editor-modal"
		bind:this={formElement}
		onsubmit={(event) => {
			event.preventDefault();
			void onsave();
		}}
	>
		<div class="modal-head">
			<div>
				<h2 id="skill-editor-title">{skill ? 'Edit skill' : 'Create a skill'}</h2>
			</div>
			<button
				type="button"
				class="icon-button"
				onclick={() => void close()}
				aria-label="Close dialog"><X size={18} /></button
			>
		</div>
		<div class="editor-grid">
			<label class="field full"
				>Name <span class="field-count">{name.length}/{MAX_NAME}</span><input
					bind:value={name}
					data-modal-primary
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
				><small>Project skills are only available inside their project conversations.</small></label
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
		<div class="modal-actions">
			<button type="button" class="button" onclick={() => void close()} disabled={saving}
				>Cancel</button
			><button type="submit" class="button primary" disabled={saving}
				>{#if saving}Saving...{:else}<Check size={15} />
					{skill ? 'Save changes' : 'Create skill'}{/if}</button
			>
		</div>
	</form>
</div>

<style>
	.modal-backdrop {
		position: fixed;
		inset: 0;
		z-index: 40;
		display: grid;
		place-items: center;
		padding: 20px;
		background: var(--overlay);
	}
	.modal {
		width: min(660px, 100%);
		max-height: min(850px, calc(100dvh - 40px));
		overflow: auto;
		padding: 24px;
		color: var(--text);
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
		margin: 0;
		color: var(--text-strong);
		font-family: var(--font-body);
		font-size: var(--text-lg);
		font-weight: 600;
		line-height: 1.3;
		letter-spacing: -0.015em;
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
		font-size: var(--text-xs);
		font-weight: 550;
	}
	.field.full {
		grid-column: 1 / -1;
	}
	.field-count {
		float: right;
		color: var(--text-faint);
		font-size: 10px;
		font-variant-numeric: tabular-nums;
		font-weight: 450;
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
		font-size: var(--text-sm);
		line-height: 1.45;
	}
	.field textarea {
		min-height: 150px;
		resize: vertical;
		line-height: 1.6;
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
		font-size: 10px;
		font-weight: 450;
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
		font-size: var(--text-xs);
		line-height: 1.45;
	}
	.modal-actions {
		display: flex;
		justify-content: flex-end;
		gap: 8px;
		margin-top: 22px;
	}
	.icon-button {
		display: grid;
		place-items: center;
		width: 32px;
		height: 32px;
		padding: 0;
		color: var(--text-muted);
		background: transparent;
		border: 0;
		border-radius: 5px;
		transition: 0.15s ease;
	}
	.button {
		display: inline-flex;
		align-items: center;
		gap: 8px;
		min-height: 38px;
		padding: 8px 13px;
		border-radius: 6px;
		border: 1px solid var(--border-strong);
		background: var(--surface);
		color: var(--text-body);
		font-family: var(--font-body);
		font-size: var(--text-sm);
		font-weight: 500;
		transition: 0.18s ease;
	}
	.button:hover:not(:disabled) {
		color: var(--text-strong);
		background: var(--surface-hover);
		border-color: var(--text-dim);
	}
	.button.primary {
		color: var(--accent-fg);
		background: var(--accent-bg);
		border-color: var(--accent-bg);
	}
	.button.primary:hover:not(:disabled) {
		background: var(--accent-bg-hover);
		border-color: var(--accent-bg-hover);
	}
	.button:disabled {
		opacity: 0.6;
		cursor: wait;
	}
	@media (max-width: 560px) {
		.editor-grid {
			grid-template-columns: 1fr;
		}
		.field.full {
			grid-column: auto;
		}
		.modal {
			padding: 19px;
		}
	}
</style>
