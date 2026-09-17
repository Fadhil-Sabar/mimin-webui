<script lang="ts">
	import { Globe } from '@lucide/svelte';
	import { Badge } from '$lib/components/ui/badge/index.js';
	import type { WebSearchSettingsState } from './types';

	type Props = { settings: WebSearchSettingsState };

	let { settings }: Props = $props();
</script>

<div class="status-card">
	<div class="status-icon"><Globe size={22} /></div>
	<div class="status-content">
		<div class="status-title-row">
			<strong>Active Search Provider</strong>
			{#if settings.fromUser}
				<Badge variant="success">User settings active</Badge>
			{:else if settings.envConfigured}
				<Badge variant="success">Server defaults active</Badge>
			{:else}
				<Badge>DuckDuckGo Fallback</Badge>
			{/if}
		</div>
		<div class="status-details">
			<span>Engine: <b class="capitalize">{settings.provider}</b></span>
			<span>•</span>
			{#if settings.apiKeyFromUser}
				<span>Key: <code class="mono-badge">{settings.apiKey}</code> (encrypted)</span>
			{:else if settings.apiKeyEnvConfigured}
				<span>Key: <code class="mono-badge">WEB_SEARCH_API_KEY</code> (server)</span>
			{:else}
				<span>No API key set (public fallback)</span>
			{/if}
			{#if settings.searchUrl}
				<span>•</span>
				<span class="url-badge" title={settings.searchUrl}>URL: {settings.searchUrl}</span>
			{/if}
		</div>
	</div>
</div>

<style>
	.status-card {
		display: flex;
		align-items: center;
		gap: var(--space-4);
		padding: var(--space-4) 20px;
		background: var(--surface);
		border: 1px solid var(--border);
		border-radius: var(--radius-xl);
		margin-bottom: 28px;
	}
	.status-icon {
		display: grid;
		place-items: center;
		width: 44px;
		height: 44px;
		flex: 0 0 44px;
		color: var(--text-muted);
		background: var(--surface-2);
		border: 1px solid var(--border);
		border-radius: var(--radius-xl);
	}
	.status-content {
		flex: 1;
		min-width: 0;
	}
	.status-title-row {
		display: flex;
		align-items: center;
		gap: 10px;
		margin-bottom: var(--space-1);
	}
	.status-title-row strong {
		font-size: var(--text-body-lg);
		line-height: var(--text-body-lg--line-height);
		letter-spacing: var(--text-body-lg--letter-spacing);
		font-weight: 500;
		color: var(--text-strong);
	}
	.status-details {
		display: flex;
		align-items: center;
		flex-wrap: wrap;
		gap: var(--space-2);
		color: var(--text-muted);
		font-size: var(--text-body-sm);
		line-height: var(--text-body-sm--line-height);
		letter-spacing: var(--text-body-sm--letter-spacing);
	}
	.status-details b {
		font-weight: 500;
	}
	.mono-badge {
		font-family: var(--font-mono);
		font-size: var(--text-label-sm);
		line-height: var(--text-label-sm--line-height);
		letter-spacing: var(--text-label-sm--letter-spacing);
		font-weight: 400;
		background: var(--surface-2);
		padding: 2px 6px;
		border-radius: var(--radius-sm);
		border: 1px solid var(--border);
		color: var(--text-strong);
	}
	.url-badge {
		max-width: 250px;
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
		color: var(--text-dim);
	}
	.capitalize {
		text-transform: capitalize;
	}
</style>
