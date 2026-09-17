<script lang="ts">
	import type { LucideIcon } from '@lucide/svelte';
	import type { Snippet } from 'svelte';
	import { Badge } from '$lib/components/ui/badge/index.js';
	import { Button } from '$lib/components/ui/button/index.js';

	type Props = {
		icon: LucideIcon;
		title: string;
		description: string;
		fromUser: boolean;
		envConfigured: boolean;
		noneLabel: string;
		onconnect: () => void;
		details: Snippet;
	};

	let {
		icon: Icon,
		title,
		description,
		fromUser,
		envConfigured,
		noneLabel,
		onconnect,
		details
	}: Props = $props();
</script>

<article class="connection-card">
	<div class="connection-main">
		<span class="connection-icon"><Icon size={16} /></span>
		<div class="connection-info">
			<div class="connection-name">
				<strong>{title}</strong>
				{#if fromUser}
					<Badge variant="success">Connected</Badge>
				{:else if envConfigured}
					<Badge>Server default</Badge>
				{:else}
					<Badge>{noneLabel}</Badge>
				{/if}
			</div>
			<p>{description}</p>
			<details class="connection-meta">
				<summary>Connection details</summary>
				{@render details()}
			</details>
		</div>
	</div>
	<div class="connection-actions">
		{#if fromUser}
			<Button variant="default" class="max-[700px]:w-full" type="button" onclick={onconnect}>
				Manage
			</Button>
		{:else}
			<Button variant="default" class="max-[700px]:w-full" type="button" onclick={onconnect}>
				Connect
			</Button>
		{/if}
	</div>
</article>

<style>
	.connection-card {
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
	.connection-card:hover {
		border-color: var(--text-dim);
	}
	.connection-main {
		display: flex;
		align-items: flex-start;
		gap: 14px;
		min-width: 0;
	}
	.connection-icon {
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
	.connection-info {
		min-width: 0;
	}
	.connection-name {
		display: flex;
		align-items: center;
		gap: 9px;
	}
	.connection-name strong {
		font-size: var(--text-body-lg);
		line-height: var(--text-body-lg--line-height);
		letter-spacing: var(--text-body-lg--letter-spacing);
		font-weight: 500;
		color: var(--text-strong);
	}
	.connection-info p {
		margin: 5px 0 8px;
		color: var(--text-muted);
		font-size: var(--text-body-md);
		line-height: var(--text-body-md--line-height);
		letter-spacing: var(--text-body-md--letter-spacing);
	}
	.connection-meta {
		display: flex;
		align-items: center;
		flex-wrap: wrap;
		gap: 10px;
	}
	.connection-meta summary {
		width: 100%;
		color: var(--text-dim);
		cursor: pointer;
		font-size: var(--text-body-sm);
		line-height: var(--text-body-sm--line-height);
		letter-spacing: var(--text-body-sm--letter-spacing);
		list-style: none;
	}
	.connection-meta summary::-webkit-details-marker {
		display: none;
	}
	.connection-meta summary::before {
		content: '+';
		display: inline-block;
		width: 12px;
		color: var(--text-faint);
	}
	.connection-meta[open] summary::before {
		content: '−';
	}
	.connection-actions {
		display: flex;
		align-items: center;
		gap: 8px;
		flex: 0 0 auto;
	}

	@media (max-width: 700px) {
		.connection-card {
			flex-direction: column;
			align-items: stretch;
		}
		.connection-actions {
			justify-content: flex-end;
		}
	}
</style>
