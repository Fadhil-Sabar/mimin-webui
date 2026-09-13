<script lang="ts">
	import { KeyRound, Trash2 } from '@lucide/svelte';
	import type { ProviderState } from './provider-types';

	type Props = {
		provider: ProviderState;
		onmanage: (provider: string) => void;
		onremove: (provider: string) => void;
	};

	let { provider, onmanage, onremove }: Props = $props();
</script>

<article class="provider-card">
	<div class="provider-main">
		<span class="provider-icon"><KeyRound size={16} /></span>
		<div class="provider-info">
			<div class="provider-name">
				<strong>{provider.name}</strong>
				{#if provider.fromUser}
					<span class="badge ok">Ready</span>
				{:else if provider.configured}
					<span class="badge ok">Ready</span>
				{:else}
					<span class="badge">Not connected</span>
				{/if}
			</div>
			<p>{provider.description}</p>
			<details class="provider-meta">
				<summary>Connection details</summary>
				{#if provider.envVar}<span class="mono">{provider.envVar}</span>{/if}
				{#if provider.fromUser}
					<span class="mono dim">{provider.apiKey}</span>
				{:else if provider.configured}
					<span class="mono dim">Fallback: server {provider.envVar}</span>
				{/if}
				{#if provider.baseUrl}
					<span class="mono dim base-url">{provider.baseUrl}</span>
				{/if}
			</details>
		</div>
	</div>
	<div class="provider-actions">
		{#if provider.fromUser || provider.customConfig}
			<button
				class="button danger"
				onclick={() => onremove(provider.provider)}
				aria-label="Remove key"><Trash2 size={14} /> Remove</button
			>
		{/if}
		<button class="button primary" onclick={() => onmanage(provider.provider)}
			>{provider.configured || provider.fromUser ? 'Manage' : 'Connect'}</button
		>
	</div>
</article>

<style>
	.provider-card {
		display: flex;
		align-items: center;
		justify-content: space-between;
		gap: 18px;
		padding: 16px 18px;
		background: var(--surface);
		border: 1px solid var(--border);
		border-radius: 10px;
		transition: 0.18s ease;
	}
	.provider-card:hover {
		border-color: var(--text-dim);
	}
	.provider-main {
		display: flex;
		align-items: flex-start;
		gap: 14px;
		min-width: 0;
	}
	.provider-icon {
		display: grid;
		place-items: center;
		width: 36px;
		height: 36px;
		flex: 0 0 36px;
		color: var(--text-muted);
		background: var(--surface-2);
		border: 1px solid var(--border);
		border-radius: 8px;
	}
	.provider-name {
		display: flex;
		align-items: center;
		gap: 9px;
	}
	.provider-name strong {
		font-family: var(--font-body);
		font-size: var(--text-base);
		font-weight: 600;
		letter-spacing: -0.015em;
		color: var(--text-strong);
	}
	.badge {
		color: var(--text-dim);
		border: 1px solid var(--border-strong);
		border-radius: 5px;
		padding: 2px 7px;
		font-size: var(--text-xs);
	}
	.badge.ok {
		color: var(--status-ok-text);
		border-color: color-mix(in srgb, var(--status-ok-dot) 40%, transparent);
	}
	.provider-info p {
		margin: 5px 0 8px;
		color: var(--text-muted);
		font-size: var(--text-sm);
	}
	.provider-meta {
		display: flex;
		align-items: center;
		flex-wrap: wrap;
		gap: 10px;
	}
	.provider-meta summary {
		width: 100%;
		color: var(--text-dim);
		cursor: pointer;
		font-size: var(--text-xs);
		list-style: none;
	}
	.provider-meta summary::-webkit-details-marker {
		display: none;
	}
	.provider-meta summary::before {
		content: '+';
		display: inline-block;
		width: 12px;
		color: var(--text-faint);
	}
	.provider-meta[open] summary::before {
		content: '−';
	}
	.mono {
		font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
		font-size: var(--text-xs);
		color: var(--text-body);
	}
	.mono.dim {
		color: var(--text-faint);
	}
	.base-url {
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
		max-width: 220px;
		color: var(--text-dim);
	}
	.provider-actions {
		display: flex;
		align-items: center;
		gap: 8px;
		flex: 0 0 auto;
	}
	.button {
		display: inline-flex;
		align-items: center;
		gap: 7px;
		min-height: 40px;
		padding: 8px 11px;
		border-radius: 6px;
		border: 1px solid var(--border-strong);
		background: var(--surface);
		color: var(--text-body);
		font-size: var(--text-sm);
		transition: 0.18s ease;
	}
	.button:hover {
		color: var(--text);
		border-color: var(--text-dim);
	}
	.button.primary {
		color: var(--accent-fg);
		background: var(--accent-bg);
		border-color: var(--accent-bg);
	}
	.button.primary:hover {
		background: var(--accent-bg-hover);
	}
	.button.danger {
		color: var(--danger-text);
		border-color: color-mix(in srgb, #a8433a 45%, transparent);
	}
	.button.danger:hover {
		color: var(--danger-text);
		border-color: var(--danger-text);
	}
	@media (max-width: 700px) {
		.provider-card {
			flex-direction: column;
			align-items: stretch;
		}
		.provider-actions {
			justify-content: flex-end;
			flex-wrap: wrap;
		}
		.provider-actions .button {
			flex: 1;
			justify-content: center;
		}
	}
</style>
