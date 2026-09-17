<script lang="ts">
	import { Info } from '@lucide/svelte';
	import type { SearchProviderType } from './types';

	type Props = {
		provider: SearchProviderType;
		searchUrl: string;
	};

	let { provider = $bindable(), searchUrl }: Props = $props();
</script>

<div class="form-section">
	<h2 class="section-title">Search Engine Provider</h2>
	<p class="section-desc">Select the search backend used by the web search agent tool.</p>

	{#if (provider === 'searxng' || provider === 'custom') && !searchUrl.trim()}
		<p class="provider-warning">
			<Info size={14} />
			<span>
				{provider === 'searxng' ? 'SearXNG' : 'A custom provider'} needs a search URL. Without one, searches
				use the shared public instance searx.be, which does not serve the JSON API and will fail; every
				search then falls back to DuckDuckGo or Wikipedia. Set the URL below.
			</span>
		</p>
	{/if}

	<div class="provider-grid">
		<!-- Tavily -->
		<label class="provider-option" class:selected={provider === 'tavily'}>
			<input type="radio" name="provider" value="tavily" bind:group={provider} />
			<div class="option-body">
				<div class="option-header">
					<strong>Tavily Search</strong>
					<span class="badge-mini">Recommended</span>
				</div>
				<p>AI-optimized search depth, source extracts, and direct answers.</p>
			</div>
		</label>

		<!-- SearXNG -->
		<label class="provider-option" class:selected={provider === 'searxng'}>
			<input type="radio" name="provider" value="searxng" bind:group={provider} />
			<div class="option-body">
				<div class="option-header">
					<strong>SearXNG</strong>
					<span class="badge-mini">Self-hosted</span>
				</div>
				<p>Privacy-respecting metasearch engine via JSON endpoint.</p>
			</div>
		</label>

		<!-- DuckDuckGo -->
		<label class="provider-option" class:selected={provider === 'duckduckgo'}>
			<input type="radio" name="provider" value="duckduckgo" bind:group={provider} />
			<div class="option-body">
				<div class="option-header">
					<strong>DuckDuckGo</strong>
					<span class="badge-mini">Free</span>
				</div>
				<p>Public web search scraping without needing any API key.</p>
			</div>
		</label>

		<!-- Custom -->
		<label class="provider-option" class:selected={provider === 'custom'}>
			<input type="radio" name="provider" value="custom" bind:group={provider} />
			<div class="option-body">
				<div class="option-header">
					<strong>Custom URL / API</strong>
				</div>
				<p>Custom search proxy, REST JSON endpoint, or template URL.</p>
			</div>
		</label>
	</div>
</div>

<style>
	.form-section {
		display: flex;
		flex-direction: column;
	}
	.section-title {
		font-family: var(--font-body);
		font-size: var(--text-body-lg);
		line-height: var(--text-body-lg--line-height);
		letter-spacing: var(--text-body-lg--letter-spacing);
		font-weight: 500;
		color: var(--text-strong);
		margin: 0 0 4px;
	}
	.section-desc {
		color: var(--text-muted);
		font-size: var(--text-body-md);
		line-height: var(--text-body-md--line-height);
		letter-spacing: var(--text-body-md--letter-spacing);
		margin: 0 0 14px;
	}

	.provider-grid {
		display: grid;
		grid-template-columns: repeat(auto-fit, minmax(240px, 1fr));
		gap: 12px;
	}
	.provider-option {
		display: flex;
		align-items: flex-start;
		gap: 12px;
		padding: 14px 16px;
		background: var(--surface-subtle);
		border: 1px solid var(--border);
		border-radius: 8px;
		cursor: pointer;
		transition: var(--duration-short3) var(--ease-standard);
	}
	.provider-option:hover {
		border-color: var(--border-strong);
		background: var(--surface-hover);
	}
	.provider-option.selected {
		border-color: var(--text-strong);
		background: var(--surface-2);
	}
	.provider-option input[type='radio'] {
		margin-top: 3px;
		cursor: pointer;
	}
	.option-body {
		flex: 1;
	}
	.option-header {
		display: flex;
		align-items: center;
		justify-content: space-between;
		margin-bottom: 4px;
	}
	.option-header strong {
		font-family: var(--font-body);
		font-size: var(--text-body-md);
		line-height: var(--text-body-md--line-height);
		letter-spacing: var(--text-body-md--letter-spacing);
		font-weight: 500;
		color: var(--text-strong);
	}
	.option-body p {
		margin: 0;
		font-size: var(--text-body-sm);
		line-height: var(--text-body-sm--line-height);
		letter-spacing: var(--text-body-sm--letter-spacing);
		color: var(--text-muted);
	}
	.badge-mini {
		font-family: var(--font-body);
		font-size: var(--text-label-sm);
		padding: 1px 6px;
		border-radius: 4px;
		background: var(--surface-3);
		border: 1px solid var(--border);
		color: var(--text-dim);
		line-height: var(--text-label-sm--line-height);
		letter-spacing: var(--text-label-sm--letter-spacing);
		font-weight: 500;
	}

	.provider-warning {
		display: flex;
		align-items: flex-start;
		gap: 8px;
		margin: 12px 0 0;
		padding: 10px 14px;
		background: color-mix(in srgb, var(--warning-bg) 16%, transparent);
		border: 1px solid color-mix(in srgb, var(--border) 70%, transparent);
		border-radius: var(--radius-lg);
		color: var(--warning-text);
		font-size: var(--text-body-md);
		line-height: var(--text-body-md--line-height);
		letter-spacing: var(--text-body-md--letter-spacing);
	}
</style>
