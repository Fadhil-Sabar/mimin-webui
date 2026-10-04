<script lang="ts">
	import { onDestroy } from 'svelte';
	import { Check, Copy } from '@lucide/svelte';
	import { Button } from '$lib/components/ui/button/index.js';
	import {
		indentAtCursor,
		indentSelection,
		newlineWithIndent,
		outdentSelection
	} from '$lib/client/canvas-code-editing';

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
	let clipboardError = $state('');
	let line = $state(1);
	let column = $state(1);
	let editor: HTMLTextAreaElement;
	let gutter: HTMLDivElement;
	let copyTimer: ReturnType<typeof setTimeout> | undefined;
	let statusTimer: ReturnType<typeof setTimeout> | undefined;
	let escapePressed = false;

	let currentCode = $derived(
		draft.tab === 'html' ? draft.html : draft.tab === 'css' ? draft.css : draft.js
	);
	const lineCount = $derived(currentCode.split('\n').length);
	const saveDisabled = $derived(
		codeSaving || saveState === 'saving' || saveState === 'saved' || conflict
	);

	function updatePosition() {
		if (!editor) return;
		const before = editor.value.slice(0, editor.selectionStart);
		line = before.split('\n').length;
		column = before.length - before.lastIndexOf('\n');
	}

	function syncScroll() {
		if (gutter && editor) gutter.scrollTop = editor.scrollTop;
	}

	async function saveCodeChanges() {
		if (saveDisabled) return;
		codeSaving = true;
		try {
			await onsave(draft.html, draft.css, draft.js);
		} catch {
			// The parent records the failed state and keeps the draft for retry.
		} finally {
			codeSaving = false;
		}
	}

	async function copyCurrentCode() {
		try {
			await navigator.clipboard.writeText(currentCode);
			copiedCode = true;
			clipboardError = '';
			if (copyTimer) clearTimeout(copyTimer);
			copyTimer = setTimeout(() => (copiedCode = false), 1400);
		} catch {
			copiedCode = false;
			clipboardError = 'Could not copy code. Check clipboard permissions and try again.';
			if (statusTimer) clearTimeout(statusTimer);
			statusTimer = setTimeout(() => (clipboardError = ''), 4000);
		}
	}

	function applyEdit(result: { value: string; selectionStart: number; selectionEnd: number }) {
		const original = editor.value;
		const updated = result.value;
		let prefix = 0;
		while (
			prefix < original.length &&
			prefix < updated.length &&
			original[prefix] === updated[prefix]
		) {
			prefix++;
		}
		let suffix = 0;
		while (
			suffix < original.length - prefix &&
			suffix < updated.length - prefix &&
			original[original.length - 1 - suffix] === updated[updated.length - 1 - suffix]
		) {
			suffix++;
		}
		editor.setRangeText(
			updated.slice(prefix, updated.length - suffix),
			prefix,
			original.length - suffix,
			'preserve'
		);
		editor.setSelectionRange(result.selectionStart, result.selectionEnd);
		draft[draft.tab] = editor.value;
		updatePosition();
		syncScroll();
	}

	function handleKeydown(event: KeyboardEvent) {
		if (event.isComposing || event.keyCode === 229) return;
		const leavingWithTab = event.key === 'Tab' && escapePressed;
		if (event.key === 'Escape') {
			escapePressed = true;
			return;
		}
		escapePressed = false;
		if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 's') {
			event.preventDefault();
			void saveCodeChanges();
			return;
		}
		if (event.key === 'Tab' && !leavingWithTab) {
			event.preventDefault();
			const indent = '  ';
			const result = event.shiftKey
				? outdentSelection(editor.value, editor.selectionStart, editor.selectionEnd, indent)
				: editor.selectionStart === editor.selectionEnd
					? indentAtCursor(editor.value, editor.selectionStart, indent)
					: indentSelection(editor.value, editor.selectionStart, editor.selectionEnd, indent);
			applyEdit(result);
		} else if (event.key === 'Enter') {
			event.preventDefault();
			applyEdit(newlineWithIndent(editor.value, editor.selectionStart, editor.selectionEnd));
		}
	}

	onDestroy(() => {
		if (copyTimer) clearTimeout(copyTimer);
		if (statusTimer) clearTimeout(statusTimer);
	});
</script>

<div class="code-editor-area">
	<div class="code-header">
		<div class="code-tabs" aria-label="Code language">
			<button
				type="button"
				class="code-tab"
				class:active={draft.tab === 'html'}
				aria-pressed={draft.tab === 'html'}
				onclick={() => {
					draft.tab = 'html';
					line = 1;
					column = 1;
					if (editor) editor.scrollTop = editor.scrollLeft = 0;
					if (gutter) gutter.scrollTop = 0;
				}}>HTML</button
			>
			<button
				type="button"
				class="code-tab"
				class:active={draft.tab === 'css'}
				aria-pressed={draft.tab === 'css'}
				onclick={() => {
					draft.tab = 'css';
					line = 1;
					column = 1;
					if (editor) editor.scrollTop = editor.scrollLeft = 0;
					if (gutter) gutter.scrollTop = 0;
				}}>CSS</button
			>
			<button
				type="button"
				class="code-tab"
				class:active={draft.tab === 'js'}
				aria-pressed={draft.tab === 'js'}
				onclick={() => {
					draft.tab = 'js';
					line = 1;
					column = 1;
					if (editor) editor.scrollTop = editor.scrollLeft = 0;
					if (gutter) gutter.scrollTop = 0;
				}}>JS</button
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
				{saveState === 'saving' || codeSaving
					? 'Saving…'
					: saveState === 'error'
						? 'Save failed'
						: saveState === 'unsaved'
							? 'Unsaved'
							: 'Saved'}
			</span>
			<button
				type="button"
				class="icon-btn"
				onclick={copyCurrentCode}
				title="Copy code"
				aria-label="Copy current code"
			>
				{#if copiedCode}<Check size={13} />{:else}<Copy size={13} />{/if}
			</button>
			<Button variant="default" size="sm" onclick={saveCodeChanges} disabled={saveDisabled}>
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
		<div class="line-gutter" bind:this={gutter} aria-hidden="true">
			{#each Array.from({ length: lineCount }, (_, index) => index + 1) as number (number)}
				<div>{number}</div>
			{/each}
		</div>
		<textarea
			bind:this={editor}
			class="code-editor-input"
			aria-label="{draft.tab.toUpperCase()} code"
			aria-describedby="code-editor-instructions"
			value={currentCode}
			oninput={(event) => {
				draft[draft.tab] = event.currentTarget.value;
				updatePosition();
			}}
			placeholder={draft.tab === 'html'
				? 'Semantic HTML markup...'
				: draft.tab === 'css'
					? 'CSS rules and token styles...'
					: 'Lightweight behavior JavaScript...'}
			spellcheck="false"
			wrap="off"
			onscroll={syncScroll}
			onkeydown={handleKeydown}
			onkeyup={updatePosition}
			onclick={updatePosition}
			onselect={updatePosition}></textarea>
	</div>
	<footer class="code-footer">
		<span>Line {line}, column {column}</span>
		<span id="code-editor-instructions" class="editor-hint"
			>Escape, then Tab to leave editor · Tab indent · Shift+Tab outdent · Ctrl/Cmd+S apply</span
		>
		{#if clipboardError}<span class="clipboard-error" role="status">{clipboardError}</span>{/if}
	</footer>
</div>

<style>
	.code-editor-area {
		display: flex;
		flex-direction: column;
		height: 100%;
		min-height: 0;
		background: var(--surface);
	}
	.code-header {
		display: flex;
		align-items: center;
		justify-content: space-between;
		gap: var(--space-3);
		padding: var(--space-2) var(--space-4);
		border-bottom: 1px solid var(--border);
		background: var(--surface-2);
		flex-wrap: wrap;
	}
	.code-tabs,
	.code-actions {
		display: flex;
		align-items: center;
		gap: 6px;
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
	}
	.code-tab:hover {
		color: var(--text-strong);
	}
	.code-tab.active {
		background: var(--surface);
		color: var(--text-strong);
		box-shadow: 0 1px 2px var(--shadow-softer);
	}
	:global(.code-editor-area button:focus-visible) {
		outline: 2px solid var(--border-strong);
		outline-offset: 2px;
	}
	.save-state {
		color: var(--text-faint);
		font-size: var(--text-label-sm);
		white-space: nowrap;
	}
	.save-state.state-unsaved {
		color: var(--text-body);
	}
	.save-state.state-saving {
		color: var(--text-muted);
	}
	.save-state.state-error,
	.clipboard-error {
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
		flex-wrap: wrap;
	}
	.conflict-actions {
		display: flex;
		gap: var(--space-2);
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
		display: flex;
		flex: 1;
		min-height: 0;
		overflow: hidden;
		padding: var(--space-3);
	}
	.line-gutter {
		flex: 0 0 auto;
		overflow: hidden;
		padding: var(--space-3) 8px;
		border: 1px solid var(--border);
		border-right: 0;
		border-radius: var(--radius-md) 0 0 var(--radius-md);
		background: var(--surface-subtle);
		color: var(--text-faint);
		text-align: right;
		font-family: var(--font-mono);
		font-size: var(--text-body-sm);
		line-height: var(--text-body-sm--line-height);
		user-select: none;
	}
	.line-gutter div {
		line-height: var(--text-body-sm--line-height);
	}
	.code-editor-input {
		flex: 1;
		min-width: 0;
		min-height: 0;
		height: 100%;
		border: 1px solid var(--border);
		border-radius: 0 var(--radius-md) var(--radius-md) 0;
		padding: var(--space-3);
		font-family: var(--font-mono);
		font-size: var(--text-body-sm);
		line-height: var(--text-body-sm--line-height);
		letter-spacing: var(--text-body-sm--letter-spacing);
		background: var(--surface-subtle);
		color: var(--text);
		resize: none;
		white-space: pre;
		overflow: auto;
	}
	.code-editor-input:focus {
		outline: 2px solid var(--border-strong);
		outline-offset: -2px;
	}
	.code-footer {
		display: flex;
		align-items: center;
		gap: var(--space-3);
		min-width: 0;
		padding: var(--space-2) var(--space-4);
		border-top: 1px solid var(--border);
		color: var(--text-muted);
		font-size: var(--text-label-sm);
		flex-wrap: wrap;
	}
	.editor-hint {
		color: var(--text-faint);
	}
	.clipboard-error {
		overflow-wrap: anywhere;
	}
	.icon-btn {
		display: grid;
		place-items: center;
		width: 28px;
		height: 28px;
		flex: 0 0 auto;
		background: transparent;
		border: 1px solid var(--border);
		border-radius: var(--radius-md);
		padding: 0;
		cursor: pointer;
		color: var(--text-muted);
	}
	.icon-btn:hover:not(:disabled) {
		background: var(--surface-hover);
		color: var(--text-strong);
		border-color: var(--border-strong);
	}
	@media (max-width: 520px) {
		.code-actions {
			flex-wrap: wrap;
			justify-content: flex-end;
		}
		.editor-hint {
			flex-basis: 100%;
		}
	}
</style>
