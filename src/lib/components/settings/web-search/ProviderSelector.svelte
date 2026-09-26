<script lang="ts">
	import { Info } from '@lucide/svelte';
	import type { SearchProviderType } from './types';

	type Props = {
		provider: SearchProviderType;
		searchUrl: string;
	};

	let { provider = $bindable(), searchUrl }: Props = $props();

	const PROVIDER_OPTIONS: Array<{
		id: SearchProviderType;
		name: string;
		desc: string;
		tag?: string;
	}> = [
		{
			id: 'tavily',
			name: 'Tavily Search',
			desc: 'AI-optimized search depth, source extracts, and direct answers.',
			tag: 'Search API'
		},
		{
			id: 'searxng',
			name: 'SearXNG',
			desc: 'Privacy-respecting metasearch engine via JSON endpoint.',
			tag: 'Self-hosted'
		},
		{
			id: 'duckduckgo',
			name: 'DuckDuckGo',
			desc: 'Public web search scraping without needing any API key.',
			tag: 'No API key required'
		},
		{
			id: 'custom',
			name: 'Custom URL / API',
			desc: 'Your own endpoint for web search.'
		}
	];
</script>

<div class="provider-selector-container">
	{#if (provider === 'searxng' || provider === 'custom') && !searchUrl.trim()}
		<div class="provider-warning" role="alert">
			<Info size={14} />
			<span>
				{provider === 'searxng' ? 'SearXNG' : 'A custom provider'} requires a search endpoint URL below.
			</span>
		</div>
	{/if}

	<div class="provider-list-card" role="radiogroup" aria-label="Search providers">
		{#each PROVIDER_OPTIONS as opt (opt.id)}
			<label class="provider-row" class:selected={provider === opt.id}>
				<input
					type="radio"
					name="search-provider"
					value={opt.id}
					checked={provider === opt.id}
					onchange={() => (provider = opt.id)}
					class="sr-only"
				/>
				<span class="custom-radio" class:checked={provider === opt.id} aria-hidden="true">
					{#if provider === opt.id}
						<span class="radio-dot"></span>
					{/if}
				</span>
				<div class="provider-text">
					<div class="provider-title-row">
						<span class="provider-name">{opt.name}</span>
						{#if opt.tag}
							<span class="provider-tag">{opt.tag}</span>
						{/if}
					</div>
					<p class="provider-desc">{opt.desc}</p>
				</div>
			</label>
		{/each}
	</div>
</div>

<style>
	.provider-selector-container {
		display: flex;
		flex-direction: column;
		gap: 12px;
	}
	.provider-warning {
		display: flex;
		align-items: center;
		gap: 8px;
		padding: 8px 12px;
		background: #2b2216;
		border: 1px solid #48361e;
		border-radius: 8px;
		color: #eab308;
		font-size: 12px;
	}
	.provider-list-card {
		display: flex;
		flex-direction: column;
		background: #1d1d20;
		border: 1px solid #2c2c30;
		border-radius: 14px;
		overflow: hidden;
	}
	.provider-row {
		display: flex;
		align-items: flex-start;
		gap: 14px;
		padding: 14px 16px;
		border-bottom: 1px solid #252528;
		cursor: pointer;
		transition: background-color var(--duration-short2) var(--ease-standard);
		user-select: none;
	}
	.provider-row:last-child {
		border-bottom: none;
	}
	.provider-row:hover {
		background: #222226;
	}
	.provider-row.selected {
		background: #212125;
	}
	.custom-radio {
		display: flex;
		align-items: center;
		justify-content: center;
		width: 18px;
		height: 18px;
		border-radius: 50%;
		border: 1.5px solid #4a4a50;
		background: transparent;
		flex-shrink: 0;
		margin-top: 2px;
		transition:
			border-color var(--duration-short2) var(--ease-standard),
			background-color var(--duration-short2) var(--ease-standard);
	}
	.custom-radio.checked {
		border-color: #ececee;
	}
	.radio-dot {
		width: 8px;
		height: 8px;
		border-radius: 50%;
		background: #ececee;
	}
	.provider-text {
		flex: 1;
		min-width: 0;
	}
	.provider-title-row {
		display: flex;
		align-items: center;
		justify-content: space-between;
		gap: 10px;
	}
	.provider-name {
		font-size: 14px;
		font-weight: 500;
		color: #ececee;
	}
	.provider-tag {
		font-size: 11px;
		color: #a1a1aa;
		background: #26262a;
		border: 1px solid #333338;
		border-radius: 6px;
		padding: 2px 8px;
		white-space: nowrap;
	}
	.provider-desc {
		margin: 3px 0 0;
		font-size: 12px;
		color: #71717a;
		line-height: 1.4;
	}
</style>
