<script lang="ts">
	import { Plus, X } from '@lucide/svelte';
	import { MAX_TRIGGER_LENGTH, MAX_TRIGGERS } from './skills-constants';

	let {
		phrases,
		value = $bindable(''),
		onadd,
		onremove
	}: {
		phrases: string[];
		value?: string;
		onadd: () => void;
		onremove: (index: number) => void;
	} = $props();
</script>

<section class="trigger-section">
	<div class="section-label-row">
		<div>
			<h3>Trigger phrases</h3>
			<p>Suggest this skill when a draft contains one of these phrases.</p>
		</div>
		<span>{phrases.length}/{MAX_TRIGGERS}</span>
	</div>
	<div class="trigger-input">
		<input
			bind:value
			maxlength={MAX_TRIGGER_LENGTH}
			aria-label="Add a trigger phrase"
			placeholder="e.g. Plan this launch"
			onkeydown={(event) => {
				if (event.key === 'Enter') {
					event.preventDefault();
					onadd();
				}
			}}
		/><button type="button" class="button" onclick={onadd} disabled={phrases.length >= MAX_TRIGGERS}
			><Plus size={14} /> Add</button
		>
	</div>
	{#if phrases.length > 0}<div class="trigger-list">
			{#each phrases as phrase, index (phrase)}<span class="trigger-chip"
					>{phrase}<button
						type="button"
						aria-label={`Remove ${phrase}`}
						onclick={() => onremove(index)}><X size={12} /></button
					></span
				>{/each}
		</div>{/if}
</section>

<style>
	.trigger-section {
		margin-top: 22px;
		padding-top: 18px;
		border-top: 1px solid var(--border);
	}
	.section-label-row {
		display: flex;
		align-items: flex-start;
		justify-content: space-between;
		gap: 15px;
	}
	.section-label-row h3 {
		margin: 0 0 3px;
		color: var(--text-strong);
		font-size: var(--text-sm);
		font-weight: 650;
	}
	.section-label-row p {
		margin: 0;
		color: var(--text-muted);
		font-size: var(--text-xs);
		line-height: 1.4;
	}
	.section-label-row > span {
		flex: 0 0 auto;
		color: var(--text-faint);
		font-size: 10px;
	}
	.trigger-input {
		display: flex;
		gap: 8px;
		margin-top: 12px;
	}
	.trigger-input input {
		min-width: 0;
		flex: 1;
		padding: 9px 11px;
		color: var(--text-strong);
		background: var(--surface-subtle);
		border: 1px solid var(--input-border);
		border-radius: 6px;
		outline: 0;
		font-size: var(--text-sm);
	}
	.trigger-input input:focus {
		border-color: var(--focus);
	}
	.trigger-list {
		display: flex;
		flex-wrap: wrap;
		gap: 7px;
		margin-top: 10px;
	}
	.trigger-chip {
		display: inline-flex;
		align-items: center;
		gap: 6px;
		max-width: 100%;
		padding: 5px 7px 5px 9px;
		color: var(--text-body);
		background: var(--surface-2);
		border: 1px solid var(--border);
		border-radius: 5px;
		font-size: var(--text-xs);
	}
	.trigger-chip button {
		display: grid;
		place-items: center;
		width: 17px;
		height: 17px;
		padding: 0;
		color: var(--text-dim);
		background: transparent;
		border: 0;
		border-radius: 3px;
	}
	.trigger-chip button:hover {
		color: var(--danger-text);
		background: var(--surface-hover);
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
	.button:disabled {
		opacity: 0.6;
		cursor: wait;
	}
</style>
