<script lang="ts">
	import {
		Check,
		ChevronDown,
		FileDown,
		FileText,
		FolderKanban,
		Globe,
		SearchX,
		LayoutTemplate,
		WandSparkles,
		Wrench
	} from '@lucide/svelte';
	import BrowserConsentCard from '$lib/components/BrowserConsentCard.svelte';
	import QuestionCard from '$lib/components/QuestionCard.svelte';
	import { isConsentPending } from '$lib/client/consent-state';
	import {
		BROWSER_BRIDGE_TOOLS,
		formatToolLabel,
		getToolResultSummary,
		getToolSourceList
	} from './chat-format';
	import type { ConsentSubmitHandler, QuestionSubmitHandler, ToolCall } from './chat-types';

	type Props = {
		toolCalls: ToolCall[];
		running?: boolean;
		onquestionsubmit?: QuestionSubmitHandler;
		onconsentsubmit?: ConsentSubmitHandler;
	};

	let { toolCalls, running = false, onquestionsubmit, onconsentsubmit }: Props = $props();

	/**
	 * A search that finished without a single source. It is not a failure, so it used to
	 * keep the green "completed" badge, which made a search backend that answered nothing
	 * look healthy while the model kept retrying it.
	 */
	function hasNoSearchResults(toolCall: ToolCall) {
		return (
			(toolCall.toolName === 'web_search' || toolCall.toolName === 'browser_search') &&
			getToolSourceList(toolCall).length === 0
		);
	}
</script>

<div class="tool-calls-container" aria-label="Tool executions">
	{#each toolCalls as toolCall (toolCall.toolCallId || toolCall.id || toolCall.toolName)}
		{#if toolCall.consent}
			<BrowserConsentCard
				{toolCall}
				active={toolCall.status === 'running' && isConsentPending(toolCall.consent)}
				disabled={!running}
				summary={toolCall.status === 'completed' ? getToolResultSummary(toolCall) : ''}
				onsubmit={(decision) => onconsentsubmit?.(toolCall.toolCallId, decision)}
			/>
		{:else if toolCall.toolName === 'ask_question'}
			<QuestionCard
				{toolCall}
				active={toolCall.status === 'running'}
				disabled={!running}
				onsubmit={(payload) => onquestionsubmit?.(toolCall.toolCallId, payload)}
			/>
		{:else}
			{@const toolMeta = formatToolLabel(toolCall.toolName, toolCall.input)}
			<details
				class="tool-call-card"
				class:tool-running={toolCall.status === 'running'}
				class:tool-failed={toolCall.status === 'failed'}
				class:tool-no-results={toolCall.status === 'completed' && hasNoSearchResults(toolCall)}
			>
				<summary class="tool-call-summary">
					<div class="tool-call-icon">
						{#if toolCall.toolName === 'project_knowledge_search'}
							<FolderKanban size={13} />
						{:else if toolCall.toolName === 'web_fetch'}
							<FileDown size={13} />
						{:else if toolCall.toolName === 'web_search' || BROWSER_BRIDGE_TOOLS.has(toolCall.toolName)}
							<Globe size={13} />
						{:else if toolCall.toolName === 'create_skill'}
							<WandSparkles size={13} />
						{:else if toolCall.toolName.includes('canvas') || toolCall.toolName.includes('scene') || toolCall.toolName === 'update_style_guideline'}
							<LayoutTemplate size={13} />
						{:else}
							<Wrench size={13} />
						{/if}
					</div>
					<div class="tool-call-info">
						<span class="tool-call-label">{toolMeta.label}</span>
						{#if toolMeta.query}
							<span class="tool-call-query">"{toolMeta.query}"</span>
						{/if}
					</div>
					<div class="tool-call-status">
						{#if toolCall.status === 'running'}
							<span class="tool-status-badge running">
								<span class="shimmer-text">{toolCall.preparing ? 'Writing…' : 'Running...'}</span>
							</span>
						{:else if toolCall.status === 'failed'}
							<span class="tool-status-badge failed">Failed</span>
						{:else if hasNoSearchResults(toolCall)}
							<span class="tool-status-badge no-results">
								<SearchX size={11} />
								{getToolResultSummary(toolCall)}
							</span>
						{:else}
							<span class="tool-status-badge completed">
								<Check size={11} />
								{getToolResultSummary(toolCall)}
							</span>
						{/if}
						<ChevronDown size={12} class="tool-chevron" />
					</div>
				</summary>
				<div class="tool-call-details">
					{#if toolCall.input}
						<div class="tool-detail-section">
							<span class="tool-detail-heading">Input Parameters</span>
							<pre class="tool-json">{JSON.stringify(toolCall.input, null, 2)}</pre>
						</div>
					{/if}
					{#if toolCall.output}
						<div class="tool-detail-section">
							<span class="tool-detail-heading">Result</span>
							{#if getToolSourceList(toolCall).length > 0}
								<div class="tool-source-chips">
									{#each getToolSourceList(toolCall) as src (`${src.type ?? ''}|${src.fileId ?? ''}|${src.chunkId ?? ''}|${src.title}|${src.url ?? ''}|${src.page ?? ''}`)}
										<div class="tool-source-chip">
											{#if src.type === 'project_file'}
												<FileText size={12} />
												<span>{src.title}{src.page ? ` (p. ${src.page})` : ''}</span>
											{:else}
												<Globe size={12} />
												<!-- eslint-disable-next-line svelte/no-navigation-without-resolve -->
												<a href={src.url} target="_blank" rel="noopener noreferrer"
													>{src.title || src.url}</a
												>
											{/if}
										</div>
									{/each}
								</div>
							{:else}
								<pre class="tool-json">{typeof toolCall.output === 'string'
										? toolCall.output
										: JSON.stringify(toolCall.output, null, 2)}</pre>
							{/if}
						</div>
					{/if}
				</div>
			</details>
		{/if}
	{/each}
</div>

<style>
	.tool-calls-container {
		display: flex;
		flex-direction: column;
		gap: var(--space-2);
		margin: var(--space-2) 0 10px;
	}
	.tool-call-card {
		border: 1px solid var(--border);
		background: var(--surface-subtle);
		border-radius: var(--radius-md);
		font-size: var(--text-body-sm);
		line-height: var(--text-body-sm--line-height);
		letter-spacing: var(--text-body-sm--letter-spacing);
		overflow: hidden;
		transition:
			border-color var(--duration-short3) var(--ease-standard),
			background var(--duration-short3) var(--ease-standard);
	}
	.tool-call-card:hover {
		border-color: var(--border-strong);
	}
	.tool-call-card.tool-running {
		border-color: color-mix(in srgb, var(--status-working-dot) 45%, transparent);
		background: color-mix(in srgb, var(--surface-3) 40%, var(--surface-subtle));
	}
	.tool-call-card.tool-failed {
		border-color: color-mix(in srgb, var(--danger-text) 35%, transparent);
	}
	.tool-call-card.tool-no-results {
		border-color: color-mix(in srgb, var(--warning-text) 35%, transparent);
	}
	.tool-call-summary {
		display: flex;
		align-items: center;
		gap: var(--space-2);
		padding: 7px 11px;
		cursor: pointer;
		user-select: none;
		list-style: none;
		color: var(--text-body);
		font-size: var(--text-body-sm);
		line-height: var(--text-body-sm--line-height);
		letter-spacing: var(--text-body-sm--letter-spacing);
	}
	.tool-call-summary::-webkit-details-marker {
		display: none;
	}
	.tool-call-summary:hover {
		background: var(--surface-hover);
	}
	.tool-call-icon {
		display: grid;
		place-items: center;
		width: 20px;
		height: 20px;
		flex-shrink: 0;
		color: var(--text-dim);
		background: var(--surface-3);
		border-radius: var(--radius-sm);
	}
	.tool-running .tool-call-icon {
		color: var(--status-working-text);
		background: color-mix(in srgb, var(--status-working-dot) 15%, transparent);
	}
	.tool-call-info {
		display: flex;
		align-items: center;
		gap: 6px;
		flex: 1 1 auto;
		min-width: 0;
		overflow: hidden;
	}
	.tool-call-label {
		font-weight: 500;
		color: var(--text-strong);
		white-space: nowrap;
		flex-shrink: 0;
	}
	.tool-call-query {
		color: var(--text-muted);
		font-style: italic;
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
	}
	.tool-call-status {
		display: flex;
		align-items: center;
		gap: 6px;
		margin-left: auto;
		flex-shrink: 0;
	}
	.tool-status-badge {
		display: inline-flex;
		align-items: center;
		gap: var(--space-1);
		padding: 2px 6px;
		border-radius: var(--radius-sm);
		font-size: var(--text-label-sm);
		line-height: var(--text-label-sm--line-height);
		letter-spacing: var(--text-label-sm--letter-spacing);
		font-weight: 500;
	}
	.tool-status-badge.running {
		color: var(--status-working-text);
		background: color-mix(in srgb, var(--status-working-dot) 15%, transparent);
	}
	.tool-status-badge.completed {
		color: var(--status-ok-text);
		background: color-mix(in srgb, var(--status-ok-dot) 15%, transparent);
	}
	.tool-status-badge.failed {
		color: var(--danger-text);
		background: color-mix(in srgb, var(--danger-bg) 15%, transparent);
	}
	.tool-status-badge.no-results {
		color: var(--warning-text);
		background: color-mix(in srgb, var(--status-working-dot) 15%, transparent);
	}
	:global(.tool-chevron) {
		color: var(--text-faint);
		transition: transform var(--duration-short4) var(--ease-standard);
	}
	details[open] > .tool-call-summary :global(.tool-chevron) {
		transform: rotate(180deg);
	}
	.tool-call-details {
		padding: var(--space-2) var(--space-3) 10px;
		border-top: 1px solid var(--border);
		display: flex;
		flex-direction: column;
		gap: var(--space-2);
		background: var(--surface-2);
	}
	.tool-detail-section {
		display: flex;
		flex-direction: column;
		gap: var(--space-1);
	}
	.tool-detail-heading {
		font-size: var(--text-label-sm);
		line-height: var(--text-label-sm--line-height);
		letter-spacing: var(--text-label-sm--letter-spacing);
		font-weight: 500;
		text-transform: uppercase;
		color: var(--text-faint);
	}
	.tool-json {
		margin: 0;
		padding: 6px var(--space-2);
		border-radius: var(--radius-sm);
		background: var(--surface-3);
		border: 1px solid var(--border);
		color: var(--text-dim);
		font-family: var(--font-mono);
		font-size: var(--text-label-sm);
		line-height: var(--text-label-sm--line-height);
		letter-spacing: var(--text-label-sm--letter-spacing);
		white-space: pre-wrap;
		word-break: break-word;
		max-height: 160px;
		overflow-y: auto;
	}
	.tool-source-chips {
		display: flex;
		flex-wrap: wrap;
		gap: 6px;
	}
	.tool-source-chip {
		display: inline-flex;
		align-items: center;
		gap: 5px;
		padding: 3px 7px;
		border-radius: var(--radius-sm);
		background: var(--surface-3);
		border: 1px solid var(--border);
		font-size: var(--text-body-sm);
		line-height: var(--text-body-sm--line-height);
		letter-spacing: var(--text-body-sm--letter-spacing);
		color: var(--text-body);
	}
	.tool-source-chip a {
		color: var(--text-strong);
		text-decoration: underline;
		text-underline-offset: 2px;
	}
	.tool-status-badge.running .shimmer-text {
		--shimmer-peak: var(--status-working-dot);
	}
</style>
