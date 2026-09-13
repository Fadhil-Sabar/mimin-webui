<script lang="ts">
	import { ExternalLink, Info, Loader2, Play, Search } from '@lucide/svelte';
	import type { TestResult } from './types';

	type Props = {
		query: string;
		testing: boolean;
		error: string | null;
		result: TestResult | null;
		ontest: () => void;
	};

	let { query = $bindable(), testing, error, result, ontest }: Props = $props();
</script>

<div class="test-card">
	<div class="test-header">
		<div>
			<h3>Test Search Configuration</h3>
			<p>
				Run a live test query with your current draft settings to verify connectivity and search
				responses.
			</p>
		</div>
	</div>

	<div class="test-input-row">
		<div class="search-input-wrapper">
			<Search size={16} class="search-icon" />
			<input
				type="text"
				bind:value={query}
				placeholder="Enter a test query..."
				onkeydown={(e) => e.key === 'Enter' && ontest()}
			/>
		</div>
		<button type="button" class="button primary test-run-btn" onclick={ontest} disabled={testing}>
			{#if testing}
				<Loader2 size={15} class="spin" /> Testing...
			{:else}
				<Play size={15} /> Run test
			{/if}
		</button>
	</div>

	{#if error}
		<div class="test-error-box">
			<strong>Search Test Failed:</strong>
			{error}
		</div>
	{/if}

	{#if result}
		<div class="test-result-box">
			{#if result.notice}
				<div class="test-notice-box">
					<Info size={14} />
					<span>{result.notice}</span>
				</div>
			{/if}
			{#if result.answer}
				<div class="answer-box">
					<span class="answer-label">Direct Synthesized Answer:</span>
					<p>{result.answer}</p>
				</div>
			{/if}

			<div class="sources-box">
				<span class="sources-label">Sources Retrieved ({result.sources.length}):</span>
				{#if result.sources.length === 0}
					<p class="no-sources">No sources found for this query.</p>
				{:else}
					<ul class="sources-list">
						{#each result.sources as source, i (source.url + i)}
							<li class="source-item">
								<div class="source-header">
									<span class="source-num">[{i + 1}]</span>
									<!-- eslint-disable svelte/no-navigation-without-resolve -->
									<a
										href={source.url}
										target="_blank"
										rel="noopener noreferrer"
										class="source-link"
									>
										{source.title}
										<ExternalLink size={12} />
									</a>
									<!-- eslint-enable svelte/no-navigation-without-resolve -->
								</div>
								<span class="source-url-text">{source.url}</span>
								{#if source.snippet}
									<p class="source-snippet">{source.snippet}</p>
								{/if}
							</li>
						{/each}
					</ul>
				{/if}
			</div>
		</div>
	{/if}
</div>

<style>
	input[type='text'] {
		width: 100%;
		min-height: 40px;
		padding: 8px 12px;
		background: var(--surface);
		border: 1px solid var(--input-border);
		border-radius: 6px;
		color: var(--text-strong);
		font-size: var(--text-sm);
		outline: none;
		transition: border-color 0.15s ease;
	}
	input[type='text']:focus {
		border-color: var(--focus);
	}

	.test-card {
		background: var(--surface);
		border: 1px solid var(--border);
		border-radius: 10px;
		padding: 24px;
	}
	.test-header h3 {
		margin: 0 0 4px;
		font-size: var(--text-base);
		font-weight: 600;
		color: var(--text-strong);
	}
	.test-header p {
		margin: 0 0 16px;
		color: var(--text-muted);
		font-size: var(--text-sm);
	}
	.test-input-row {
		display: flex;
		gap: 10px;
		align-items: center;
	}
	.search-input-wrapper {
		position: relative;
		flex: 1;
		display: flex;
		align-items: center;
	}
	:global(.search-icon) {
		position: absolute;
		left: 12px;
		color: var(--text-dim);
		pointer-events: none;
	}
	.search-input-wrapper input {
		padding-left: 36px;
	}
	.test-run-btn {
		flex: 0 0 auto;
	}

	.test-error-box {
		margin-top: 16px;
		padding: 12px 16px;
		background: color-mix(in srgb, var(--danger-bg) 10%, transparent);
		border: 1px solid color-mix(in srgb, var(--danger-bg) 40%, transparent);
		border-radius: 8px;
		color: var(--danger-text);
		font-size: var(--text-sm);
	}

	.test-notice-box {
		display: flex;
		align-items: flex-start;
		gap: 8px;
		margin-bottom: 16px;
		padding: 10px 14px;
		background: color-mix(in srgb, var(--warning-bg, var(--bg-tertiary)) 16%, transparent);
		border: 1px solid color-mix(in srgb, var(--border) 70%, transparent);
		border-radius: 8px;
		color: var(--text-secondary);
		font-size: var(--text-sm);
	}

	.test-result-box {
		margin-top: 20px;
		border-top: 1px solid var(--border);
		padding-top: 18px;
		display: flex;
		flex-direction: column;
		gap: 16px;
	}
	.answer-box {
		background: var(--surface-2);
		border: 1px solid var(--border);
		border-radius: 8px;
		padding: 14px 16px;
	}
	.answer-label {
		display: block;
		font-size: var(--text-xs);
		font-weight: 600;
		color: var(--text-muted);
		margin-bottom: 6px;
		text-transform: uppercase;
		letter-spacing: 0.05em;
	}
	.answer-box p {
		margin: 0;
		font-size: var(--text-sm);
		color: var(--text-strong);
		line-height: 1.5;
	}

	.sources-label {
		display: block;
		font-size: var(--text-xs);
		font-weight: 600;
		color: var(--text-muted);
		margin-bottom: 10px;
		text-transform: uppercase;
		letter-spacing: 0.05em;
	}
	.sources-list {
		list-style: none;
		padding: 0;
		margin: 0;
		display: flex;
		flex-direction: column;
		gap: 12px;
	}
	.source-item {
		padding: 12px 14px;
		background: var(--surface-subtle);
		border: 1px solid var(--border);
		border-radius: 8px;
	}
	.source-header {
		display: flex;
		align-items: center;
		gap: 8px;
	}
	.source-num {
		font-size: var(--text-xs);
		color: var(--text-dim);
		font-weight: 600;
	}
	.source-link {
		font-size: var(--text-sm);
		font-weight: 600;
		color: var(--text-strong);
		text-decoration: none;
		display: inline-flex;
		align-items: center;
		gap: 4px;
	}
	.source-link:hover {
		text-decoration: underline;
		color: var(--focus);
	}
	.source-url-text {
		display: block;
		font-size: var(--text-xs);
		color: var(--text-dim);
		font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
		margin: 2px 0 6px;
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
	}
	.source-snippet {
		margin: 0;
		font-size: var(--text-xs);
		color: var(--text-body);
		line-height: 1.45;
	}
	.no-sources {
		color: var(--text-dim);
		font-size: var(--text-sm);
		margin: 0;
	}
</style>
