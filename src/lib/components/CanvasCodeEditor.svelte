<script lang="ts">
	import { Check, Copy } from '@lucide/svelte';
	import { Button } from '$lib/components/ui/button/index.js';

	type Draft = { tab: 'html' | 'css' | 'js'; html: string; css: string; js: string };

	type Props = {
		draft: Draft;
		onsave: (html: string, css: string, js: string) => Promise<void>;
	};

	let { draft = $bindable(), onsave }: Props = $props();

	let codeSaving = $state(false);
	let copiedCode = $state(false);

	async function saveCodeChanges() {
		codeSaving = true;
		try {
			await onsave(draft.html, draft.css, draft.js);
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
			<button class="icon-btn" onclick={copyCurrentCode} title="Copy Code">
				{#if copiedCode}<Check size={13} />{:else}<Copy size={13} />{/if}
			</button>
			<Button variant="default" size="sm" onclick={saveCodeChanges} disabled={codeSaving}>
				{codeSaving ? 'Saving...' : 'Apply Code'}
			</Button>
		</div>
	</div>

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
