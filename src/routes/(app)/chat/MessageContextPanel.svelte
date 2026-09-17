<script lang="ts">
	import { ChevronDown, Gauge } from '@lucide/svelte';
	import type { SkillSummary } from '$lib/skills';
	import type { ConversationMessage } from './chat-types';

	/**
	 * What actually went into one finished answer: the provider's token counts, how
	 * long the turn took, and the context that was attached to it (files, skill,
	 * project). Everything here comes from data the server already recorded, so the
	 * panel stays truthful across reloads.
	 */
	let {
		message,
		skill = null,
		contextAttachments = [],
		projectName = null
	}: {
		message: ConversationMessage;
		skill?: SkillSummary | null;
		contextAttachments?: string[];
		projectName?: string | null;
	} = $props();

	const usage = $derived(message.usage ?? null);

	const tokenRows = $derived.by(() => {
		if (!usage) return [] as Array<{ label: string; value: number }>;
		const rows: Array<{ label: string; value: number }> = [];
		if (usage.input) rows.push({ label: 'Input', value: usage.input });
		if (usage.output) rows.push({ label: 'Output', value: usage.output });
		if (usage.cacheRead) rows.push({ label: 'Cache read', value: usage.cacheRead });
		if (usage.cacheWrite) rows.push({ label: 'Cache write', value: usage.cacheWrite });
		if (usage.reasoning) rows.push({ label: 'Reasoning', value: usage.reasoning });
		return rows;
	});

	const totalTokens = $derived(
		usage?.totalTokens ??
			(tokenRows.length > 0 ? tokenRows.reduce((sum, row) => sum + row.value, 0) : 0)
	);

	const durationSeconds = $derived.by(() => {
		if (!message.completedAt) return null;
		const start = Date.parse(message.createdAt);
		const end = Date.parse(message.completedAt);
		if (!Number.isFinite(start) || !Number.isFinite(end) || end < start) return null;
		return Math.round((end - start) / 1000);
	});

	const showPanel = $derived(
		message.role === 'assistant' &&
			!message.isStreaming &&
			Boolean(
				totalTokens ||
				durationSeconds !== null ||
				contextAttachments.length ||
				skill ||
				projectName ||
				message.citations?.length ||
				message.toolCalls?.length
			)
	);

	function formatTokens(value: number) {
		return value.toLocaleString();
	}

	function formatDuration(seconds: number) {
		if (seconds < 60) return `${seconds}s`;
		return `${Math.floor(seconds / 60)}m ${seconds % 60}s`;
	}
</script>

{#if showPanel}
	<details class="context-block">
		<summary class="context-summary">
			<Gauge size={13} aria-hidden="true" />
			<span>Context</span>
			{#if totalTokens > 0}
				<span class="context-total">{formatTokens(totalTokens)} tokens</span>
			{/if}
			<ChevronDown size={13} class="chevron" aria-hidden="true" />
		</summary>
		<div class="context-body">
			<dl class="context-list">
				{#each tokenRows as row (row.label)}
					<div class="context-row">
						<dt>{row.label}</dt>
						<dd>{formatTokens(row.value)}</dd>
					</div>
				{/each}
				{#if totalTokens > 0}
					<div class="context-row">
						<dt>Total</dt>
						<dd>{formatTokens(totalTokens)}</dd>
					</div>
				{/if}
				{#if durationSeconds !== null}
					<div class="context-row">
						<dt>Duration</dt>
						<dd>{formatDuration(durationSeconds)}</dd>
					</div>
				{/if}
				{#if message.toolCalls?.length}
					<div class="context-row">
						<dt>Tool calls</dt>
						<dd>{message.toolCalls.length}</dd>
					</div>
				{/if}
				{#if message.citations?.length}
					<div class="context-row">
						<dt>Sources</dt>
						<dd>{message.citations.length}</dd>
					</div>
				{/if}
				{#if contextAttachments.length}
					<div class="context-row context-row-wide">
						<dt>Files</dt>
						<dd>{contextAttachments.join(', ')}</dd>
					</div>
				{/if}
				{#if skill}
					<div class="context-row context-row-wide">
						<dt>Skill</dt>
						<dd>{skill.name}</dd>
					</div>
				{/if}
				{#if projectName}
					<div class="context-row context-row-wide">
						<dt>Project</dt>
						<dd>{projectName} knowledge available</dd>
					</div>
				{/if}
			</dl>
			{#if !usage}
				<p class="context-note">This turn did not report token usage.</p>
			{/if}
		</div>
	</details>
{/if}

<style>
	.context-block {
		margin-top: 10px;
		border: 1px solid var(--border);
		border-radius: 8px;
		background: var(--surface-subtle);
	}

	.context-summary {
		display: flex;
		align-items: center;
		gap: 6px;
		padding: 6px 10px;
		color: var(--text-muted);
		font-size: var(--text-label-md);
		line-height: var(--text-label-md--line-height);
		letter-spacing: var(--text-label-md--letter-spacing);
		font-weight: var(--text-label-md--font-weight);
		cursor: pointer;
		list-style: none;
	}

	.context-summary::-webkit-details-marker {
		display: none;
	}

	/* The chevron class is passed to the Lucide component, so its rules have to be
	   global for Svelte not to prune them. */
	:global(.context-summary .chevron) {
		margin-left: 2px;
		transition: transform 0.15s ease;
		flex-shrink: 0;
	}

	details[open] > .context-summary :global(.chevron) {
		transform: rotate(180deg);
	}

	.context-total {
		margin-left: auto;
		color: var(--text-dim);
		font-size: var(--text-body-sm);
		line-height: var(--text-body-sm--line-height);
		letter-spacing: var(--text-body-sm--letter-spacing);
		font-weight: var(--text-body-sm--font-weight);
	}

	.context-body {
		padding: 0 10px 8px;
	}

	.context-list {
		display: grid;
		grid-template-columns: repeat(auto-fit, minmax(120px, 1fr));
		gap: 2px 14px;
		margin: 0;
	}

	.context-row {
		display: flex;
		align-items: baseline;
		justify-content: space-between;
		gap: 8px;
		font-size: var(--text-body-sm);
		line-height: var(--text-body-sm--line-height);
		letter-spacing: var(--text-body-sm--letter-spacing);
		font-weight: var(--text-body-sm--font-weight);
	}

	.context-row-wide {
		grid-column: 1 / -1;
	}

	.context-row dt {
		color: var(--text-dim);
	}

	.context-row dd {
		margin: 0;
		color: var(--text);
		text-align: right;
		overflow-wrap: anywhere;
	}

	.context-note {
		margin: 6px 0 0;
		color: var(--text-dim);
		font-size: var(--text-body-sm);
		line-height: var(--text-body-sm--line-height);
		letter-spacing: var(--text-body-sm--letter-spacing);
		font-weight: var(--text-body-sm--font-weight);
	}
</style>
