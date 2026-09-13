<script lang="ts">
	import { Globe } from '@lucide/svelte';
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
				<span class="badge ok">User settings active</span>
			{:else if settings.envConfigured}
				<span class="badge ok">Server defaults active</span>
			{:else}
				<span class="badge">DuckDuckGo Fallback</span>
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
		gap: 16px;
		padding: 16px 20px;
		background: var(--surface);
		border: 1px solid var(--border);
		border-radius: 10px;
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
		border-radius: 10px;
	}
	.status-content {
		flex: 1;
		min-width: 0;
	}
	.status-title-row {
		display: flex;
		align-items: center;
		gap: 10px;
		margin-bottom: 4px;
	}
	.status-title-row strong {
		font-size: var(--text-base);
		font-weight: 600;
		color: var(--text-strong);
	}
	.status-details {
		display: flex;
		align-items: center;
		flex-wrap: wrap;
		gap: 8px;
		color: var(--text-muted);
		font-size: var(--text-xs);
	}
	.mono-badge {
		font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
		background: var(--surface-2);
		padding: 2px 6px;
		border-radius: 4px;
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
