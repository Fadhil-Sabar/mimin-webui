<script lang="ts">
	import { Check, Copy } from '@lucide/svelte';
	import { Button } from '$lib/components/ui/button/index.js';

	type Draft = { tab: 'html' | 'css' | 'js'; html: string; css: string; js: string };
	type SaveState = 'saved' | 'unsaved' | 'saving' | 'error';

	type Props = {
		draft: Draft;
		onsave: (html: string, css: string, js: string) => Promise<void>;
		saveState?: SaveState;
		conflict?: boolean;
		onkeepdraft?: () => void;
		onloadlatest?: () => void;
	};

	let {
		draft = $bindable(),
		onsave,
		saveState = 'saved',
		conflict = false,
		onkeepdraft,
		onloadlatest
	}: Props = $props();

	let codeSaving = $state(false);
	let copiedCode = $state(false);

	async function saveCodeChanges() {
		codeSaving = true;
		try {
			await onsave(draft.html, draft.css, draft.js);
		} catch {
			// The parent records the failed state and keeps the draft for retry.
		} finally {
			codeSaving = false;
		}
	}

	function copyCurrentCode() {
		const code = draft.tab === 'html' ? draft.html : draft.tab === 'css' ? draft.css : draft.js;
		navigator.clipboard.writeText(code);
		copiedCode = true;
		setTimeout(() => (copiedCode = false), 1400);
	}
</script>

<div class="code-editor-area">
	<div class="code-header">
		<div class="code-tabs">
			<button
				class="code-tab"
				class:active={draft.tab === 'html'}
				onclick={() => (draft.tab = 'html')}>HTML</button
			>
			<button
				class="code-tab"
				class:active={draft.tab === 'css'}
				onclick={() => (draft.tab = 'css')}>CSS</button
			>
			<button class="code-tab" class:active={draft.tab === 'js'} onclick={() => (draft.tab = 'js')}
				>JS</button
			>
		</div>
		<div class="code-actions">
			<span
				class="save-state"
				class:state-unsaved={saveState === 'unsaved'}
				class:state-saving={saveState === 'saving'}
				class:state-error={saveState === 'error'}
				role="status"
			>
				{saveState === 'saving'
					? 'Saving…'
					: saveState === 'error'
						? 'Save failed'
						: saveState === 'unsaved'
							? 'Unsaved'
							: 'Saved'}
			</span>
			<button class="icon-btn" onclick={copyCurrentCode} title="Copy Code">
				{#if copiedCode}<Check size={13} />{:else}<Copy size={13} />{/if}
			</button>
			<Button
				variant="default"
				size="sm"
				onclick={saveCodeChanges}
				disabled={codeSaving || saveState === 'saving'}
			>
				{codeSaving || saveState === 'saving'
					? 'Saving…'
					: saveState === 'error'
						? 'Retry save'
						: 'Apply Code'}
			</Button>
		</div>
	</div>
	{#if conflict}
		<div class="draft-conflict" role="alert">
			<span>This scene changed on the server while you were editing.</span>
			<div class="conflict-actions">
				<button type="button" onclick={onkeepdraft}>Keep edits</button>
				<button type="button" onclick={onloadlatest}>Load latest</button>
			</div>
		</div>
	{/if}

	<div class="code-body">
		{#if draft.tab === 'html'}
			<textarea
				class="code-editor-input"
				bind:value={draft.html}
				placeholder="Semantic HTML markup..."
				spellcheck="false"></textarea>
		{:else if draft.tab === 'css'}
			<textarea
				class="code-editor-input"
				bind:value={draft.css}
				placeholder="CSS rules and token styles..."
				spellcheck="false"></textarea>
		{:else}
			<textarea
				class="code-editor-input"
				bind:value={draft.js}
				placeholder="Lightweight behavior JavaScript..."
				spellcheck="false"></textarea>
		{/if}
	</div>
</div>

<style>
	.code-editor-area {
		display: flex;
		flex-direction: column;
		height: 100%;
		background: var(--surface);
	}
	.code-header {
		display: flex;
		align-items: center;
		justify-content: space-between;
		padding: var(--space-2) var(--space-4);
		border-bottom: 1px solid var(--border);
		background: var(--surface-2);
	}
	.code-tabs {
		display: flex;
		gap: 3px;
	}
	.code-tab {
		padding: var(--space-1) 10px;
		border: none;
		background: transparent;
		font-size: var(--text-body-sm);
		line-height: var(--text-body-sm--line-height);
		letter-spacing: var(--text-body-sm--letter-spacing);
		font-weight: 500;
		color: var(--text-muted);
		border-radius: var(--radius-sm);
		cursor: pointer;
		transition:
			color var(--duration-short3) var(--ease-standard),
			background var(--duration-short3) var(--ease-standard);
	}
	.code-tab:hover {
		color: var(--text-strong);
	}
	.code-tab.active {
		background: var(--surface);
		color: var(--text-strong);
		font-weight: 500;
		box-shadow: 0 1px 2px var(--shadow-softer);
	}
	.code-actions {
		display: flex;
		align-items: center;
		gap: 6px;
	}
	.save-state {
		color: var(--text-faint);
		font-size: var(--text-label-sm);
		line-height: var(--text-label-sm--line-height);
		letter-spacing: var(--text-label-sm--letter-spacing);
		white-space: nowrap;
	}
	.save-state.state-unsaved {
		color: var(--text-body);
	}
	.save-state.state-saving {
		color: var(--text-muted);
	}
	.save-state.state-error {
		color: var(--danger-text);
	}
	.draft-conflict {
		display: flex;
		align-items: center;
		justify-content: space-between;
		gap: var(--space-3);
		padding: 8px var(--space-4);
		border-bottom: 1px solid var(--border);
		background: var(--surface-subtle);
		color: var(--text-body);
		font-size: var(--text-body-sm);
		line-height: var(--text-body-sm--line-height);
	}
	.conflict-actions {
		display: flex;
		gap: var(--space-2);
		flex-shrink: 0;
	}
	.conflict-actions button {
		padding: 4px 8px;
		border: 1px solid var(--border);
		border-radius: var(--radius-sm);
		background: var(--surface);
		color: var(--text-strong);
		font-size: var(--text-body-sm);
		cursor: pointer;
	}
	.conflict-actions button:hover {
		background: var(--surface-hover);
	}
	.code-body {
		flex: 1;
		padding: var(--space-3);
		overflow: hidden;
	}
	.code-editor-input {
		width: 100%;
		height: 100%;
		border: 1px solid var(--border);
		border-radius: var(--radius-md);
		padding: var(--space-3);
		font-family: var(--font-mono);
		font-size: var(--text-body-sm);
		line-height: var(--text-body-sm--line-height);
		letter-spacing: var(--text-body-sm--letter-spacing);
		background: var(--surface-subtle);
		color: var(--text);
		resize: none;
	}
	.code-editor-input:focus {
		border-color: var(--border-strong);
	}
	.icon-btn {
		display: grid;
		place-items: center;
		width: 28px;
		height: 28px;
		background: transparent;
		border: 1px solid var(--border);
		border-radius: var(--radius-md);
		padding: 0;
		cursor: pointer;
		color: var(--text-muted);
		transition:
			color var(--duration-short3) var(--ease-standard),
			background var(--duration-short3) var(--ease-standard),
			border-color var(--duration-short3) var(--ease-standard);
	}
	.icon-btn:hover:not(:disabled) {
		background: var(--surface-hover);
		color: var(--text-strong);
		border-color: var(--border-strong);
	}
</style>
