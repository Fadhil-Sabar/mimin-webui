<script lang="ts">
	import { Plus, X } from '@lucide/svelte';
	import { Button } from '$lib/components/ui/button/index.js';
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
		/><Button
			variant="outline"
			type="button"
			onclick={onadd}
			disabled={phrases.length >= MAX_TRIGGERS}><Plus size={14} /> Add</Button
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
		font-size: var(--text-body-md);
		line-height: var(--text-body-md--line-height);
		letter-spacing: var(--text-body-md--letter-spacing);
	}
	.section-label-row p {
		margin: 0;
		color: var(--text-muted);
		font-size: var(--text-body-sm);
		line-height: var(--text-body-sm--line-height);
		letter-spacing: var(--text-body-sm--letter-spacing);
	}
	.section-label-row > span {
		flex: 0 0 auto;
		color: var(--text-faint);
		font-size: var(--text-label-sm);
		line-height: var(--text-label-sm--line-height);
		letter-spacing: var(--text-label-sm--letter-spacing);
	}
	.trigger-input {
		display: flex;
		gap: var(--space-2);
		margin-top: var(--space-3);
	}
	.trigger-input input {
		min-width: 0;
		flex: 1;
		padding: 9px 11px;
		color: var(--text-strong);
		background: var(--surface-subtle);
		border: 1px solid var(--input-border);
		border-radius: var(--radius-md);
		font-size: var(--text-body-md);
		line-height: var(--text-body-md--line-height);
		letter-spacing: var(--text-body-md--letter-spacing);
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
		border-radius: var(--radius-sm);
		font-size: var(--text-body-sm);
		line-height: var(--text-body-sm--line-height);
		letter-spacing: var(--text-body-sm--letter-spacing);
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
		border-radius: var(--radius-sm);
	}
	.trigger-chip button:hover {
		color: var(--danger-text);
		background: var(--surface-hover);
	}
</style>
