<script lang="ts">
	import {
		ChevronRight,
		Eye,
		KeyRound,
		Link as LinkIcon,
		MoreHorizontal,
		Trash2
	} from '@lucide/svelte';
	import { Badge } from '$lib/components/ui/badge/index.js';
	import type { ProviderState } from './provider-types';

	type Props = {
		provider: ProviderState;
		onmanage: (provider: string) => void;
		onremove: (provider: string) => void;
	};

	let { provider, onmanage, onremove }: Props = $props();

	let showMenu = $state(false);
	let showDetails = $state(false);

	let isConnected = $derived(Boolean(provider.configured || provider.fromUser));
	let modelCountText = $derived.by(() => {
		if (provider.customConfig) {
			const count = provider.customConfig.models.length;
			return `${count} model${count === 1 ? '' : 's'}`;
		}
		if (provider.provider === 'openai') return 'GPT models';
		if (provider.provider === 'anthropic') return 'Claude models';
		if (provider.provider === 'google') return 'Gemini models';
		return provider.description;
	});
</script>

<article class="provider-card">
	<div class="provider-main">
		<div class="provider-icon-box">
			{#if isConnected}
				<LinkIcon size={16} />
			{:else if provider.provider === 'openai'}
				<svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
					<path
						d="M22.2819 9.8211a5.9847 5.9847 0 0 0-.5157-4.9108 6.0462 6.0462 0 0 0-6.5098-2.9A6.0651 6.0651 0 0 0 4.9807 4.1818a5.9847 5.9847 0 0 0-3.9977 2.9 6.0462 6.0462 0 0 0 .7427 7.0966 5.98 5.98 0 0 0 .511 4.9107 6.051 6.051 0 0 0 6.5146 2.9001A5.9847 5.9847 0 0 0 13.2599 24a6.0557 6.0557 0 0 0 5.7718-4.2058 5.9894 5.9894 0 0 0 3.9977-2.9001 6.0557 6.0557 0 0 0-.7475-7.0729zm-9.022 12.6081a4.4755 4.4755 0 0 1-2.8764-1.0408l.1419-.0804 4.7783-2.7582a.7948.7948 0 0 0 .3927-.6813v-6.7369l2.02 1.1686a.071.071 0 0 1 .038.052v5.5826a4.5045 4.5045 0 0 1-4.4945 4.4944zm-9.6607-4.1254a4.4708 4.4708 0 0 1-.5346-3.0137l.142.0852 4.783 2.7582a.7712.7712 0 0 0 .7806 0l5.8428-3.3685v2.3324a.0804.0804 0 0 1-.0332.0615L9.74 19.9502a4.4992 4.4992 0 0 1-6.1408-1.6464zM2.3408 7.8956a4.485 4.485 0 0 1 2.3655-1.9728V11.6a.7664.7664 0 0 0 .3879.6765l5.8144 3.3543-2.0201 1.1685a.0757.0757 0 0 1-.071 0l-4.8303-2.7865A4.504 4.504 0 0 1 2.3408 7.8956zm16.597 3.8558L13.1038 8.364 15.1239 7.2a.0757.0757 0 0 1 .071 0l4.8303 2.7913a4.4944 4.4944 0 0 1-.6765 8.1042v-5.6772a.79.79 0 0 0-.411-.6669zm2.0107-3.0231l-.142-.0852-4.7735-2.7818a.7759.7759 0 0 0-.7854 0L9.409 9.2297V6.8974a.0662.0662 0 0 1 .0284-.0615l4.8303-2.7866a4.4992 4.4992 0 0 1 6.6802 4.66zM8.3065 12.863l-2.02-1.1638a.0804.0804 0 0 1-.038-.0567V6.0742a4.4992 4.4992 0 0 1 7.3757-3.4537l-.142.0805L8.704 5.459a.7948.7948 0 0 0-.3927.6813v6.7227zm1.145-2.0728l2.5485-1.4674 2.5485 1.4674v2.9348l-2.5485 1.4674-2.5485-1.4674z"
					/>
				</svg>
			{:else if provider.provider === 'anthropic'}
				<span class="anthropic-logo" aria-hidden="true">AI</span>
			{:else if provider.provider === 'google'}
				<svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
					<path
						d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"
					/>
					<path
						d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
					/>
					<path
						d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.06H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.94l2.85-2.22.81-.63z"
					/>
					<path
						d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.06l3.66 2.84c.87-2.6 3.3-4.52 6.16-4.52z"
					/>
				</svg>
			{:else}
				<KeyRound size={16} />
			{/if}
		</div>

		<div class="provider-info">
			<div class="provider-title-row">
				<span class="provider-name">{provider.name}</span>
			</div>
			<div class="provider-meta-row">
				<span class="provider-subtext">{modelCountText}</span>
			</div>
		</div>
	</div>

	<div class="provider-actions">
		{#if isConnected}
			<div class="status-indicator">
				<span class="status-dot"></span>
				<Badge variant="success">Ready</Badge>
			</div>
			<button type="button" class="manage-btn" onclick={() => onmanage(provider.provider)}>
				Manage
			</button>
			<div class="overflow-menu-container">
				<button
					type="button"
					class="overflow-btn"
					onclick={() => (showMenu = !showMenu)}
					aria-label="Provider options"
					aria-expanded={showMenu}
				>
					<MoreHorizontal size={15} />
				</button>
				{#if showMenu}
					<div class="menu-popover" role="menu">
						<button
							type="button"
							class="menu-item"
							role="menuitem"
							onclick={() => {
								showDetails = !showDetails;
								showMenu = false;
							}}
						>
							<Eye size={13} />
							<span>{showDetails ? 'Hide details' : 'Connection details'}</span>
						</button>
						{#if provider.fromUser || provider.customConfig}
							<button
								type="button"
								class="menu-item destructive"
								role="menuitem"
								onclick={() => {
									showMenu = false;
									onremove(provider.provider);
								}}
							>
								<Trash2 size={13} />
								<span>Remove provider</span>
							</button>
						{/if}
					</div>
				{/if}
			</div>
		{:else}
			<button
				type="button"
				class="manage-btn connect-btn"
				onclick={() => onmanage(provider.provider)}
			>
				<span>Connect</span>
				<ChevronRight size={14} />
			</button>
		{/if}
	</div>
</article>

{#if showDetails}
	<div class="connection-details-panel">
		{#if provider.envVar}
			<div class="detail-line">
				<span class="detail-label">Server variable:</span>
				<span class="detail-mono">{provider.envVar}</span>
			</div>
		{/if}
		{#if provider.fromUser}
			<div class="detail-line">
				<span class="detail-label">API key:</span>
				<span class="detail-mono">{provider.apiKey}</span>
			</div>
		{:else if provider.configured}
			<div class="detail-line">
				<span class="detail-label">Key fallback:</span>
				<span class="detail-mono">Server configured</span>
			</div>
		{/if}
		{#if provider.baseUrl}
			<div class="detail-line">
				<span class="detail-label">Base URL:</span>
				<span class="detail-mono">{provider.baseUrl}</span>
			</div>
		{/if}
	</div>
{/if}

<svelte:window
	onclick={(e) => {
		const target = e.target as HTMLElement | null;
		if (showMenu && target && !target.closest('.overflow-menu-container')) {
			showMenu = false;
		}
	}}
/>

<style>
	.provider-card {
		display: flex;
		align-items: center;
		justify-content: space-between;
		gap: 16px;
		padding: 12px 16px;
		background: #1d1d20;
		border: 1px solid #2c2c30;
		border-radius: 14px;
		transition: border-color var(--duration-short2) var(--ease-standard);
	}
	.provider-card:hover {
		border-color: #38383e;
	}
	.provider-main {
		display: flex;
		align-items: center;
		gap: 14px;
		min-width: 0;
	}
	.provider-icon-box {
		display: flex;
		align-items: center;
		justify-content: center;
		width: 38px;
		height: 38px;
		flex-shrink: 0;
		color: #ececee;
		background: #242428;
		border: 1px solid #2f2f34;
		border-radius: 10px;
	}
	.anthropic-logo {
		font-family: serif;
		font-weight: 700;
		font-size: 15px;
		letter-spacing: -0.05em;
		color: #ececee;
	}
	.provider-info {
		display: flex;
		flex-direction: column;
		gap: 2px;
		min-width: 0;
	}
	.provider-title-row {
		display: flex;
		align-items: center;
		gap: 8px;
	}
	.provider-name {
		font-size: 14px;
		font-weight: 500;
		color: #ececee;
		letter-spacing: -0.01em;
	}
	.provider-meta-row {
		display: flex;
		align-items: center;
		gap: 8px;
	}
	.provider-subtext {
		color: #71717a;
		font-size: 12px;
	}
	.provider-actions {
		display: flex;
		align-items: center;
		gap: 10px;
		flex-shrink: 0;
	}
	.status-indicator {
		display: flex;
		align-items: center;
		gap: 6px;
		margin-right: 4px;
	}
	.status-dot {
		width: 6px;
		height: 6px;
		border-radius: 50%;
		background: #22c55e;
	}
	:global(.provider-actions [data-slot='badge']) {
		background: transparent !important;
		border: 0 !important;
		padding: 0 !important;
		color: #ececee !important;
		font-size: 13px !important;
		font-weight: 400 !important;
	}
	.manage-btn {
		display: inline-flex;
		align-items: center;
		justify-content: center;
		height: 32px;
		padding: 0 14px;
		background: #26262b;
		border: 1px solid #34343a;
		border-radius: 8px;
		color: #ececee;
		font-size: 12px;
		font-weight: 500;
		cursor: pointer;
		transition:
			background-color var(--duration-short2) var(--ease-standard),
			border-color var(--duration-short2) var(--ease-standard);
	}
	.manage-btn:hover {
		background: #2f2f35;
		border-color: #404046;
	}
	.connect-btn {
		gap: 4px;
		padding: 0 10px 0 14px;
		color: #ececee;
	}
	.overflow-menu-container {
		position: relative;
	}
	.overflow-btn {
		display: flex;
		align-items: center;
		justify-content: center;
		width: 32px;
		height: 32px;
		background: transparent;
		border: 0;
		border-radius: 8px;
		color: #71717a;
		cursor: pointer;
		transition:
			background-color var(--duration-short2) var(--ease-standard),
			color var(--duration-short2) var(--ease-standard);
	}
	.overflow-btn:hover {
		background: #26262b;
		color: #ececee;
	}
	.menu-popover {
		position: absolute;
		top: calc(100% + 4px);
		right: 0;
		z-index: 50;
		min-width: 170px;
		padding: 4px;
		background: #1f1f23;
		border: 1px solid #2c2c30;
		border-radius: 10px;
		box-shadow: 0 12px 32px rgba(0, 0, 0, 0.4);
		display: flex;
		flex-direction: column;
		gap: 2px;
	}
	.menu-item {
		display: flex;
		align-items: center;
		gap: 8px;
		width: 100%;
		padding: 6px 10px;
		background: transparent;
		border: 0;
		border-radius: 6px;
		color: #ececee;
		font-size: 12px;
		text-align: left;
		cursor: pointer;
		transition: background-color var(--duration-short2) var(--ease-standard);
	}
	.menu-item:hover {
		background: #2a2a30;
	}
	.menu-item.destructive {
		color: #f87171;
	}
	.menu-item.destructive:hover {
		background: rgba(239, 68, 68, 0.12);
	}
	.connection-details-panel {
		margin-top: 4px;
		padding: 10px 16px;
		background: #17171a;
		border: 1px solid #252528;
		border-radius: 10px;
		display: flex;
		flex-direction: column;
		gap: 6px;
		font-size: 12px;
	}
	.detail-line {
		display: flex;
		align-items: center;
		gap: 8px;
	}
	.detail-label {
		color: #71717a;
		min-width: 95px;
	}
	.detail-mono {
		font-family: var(--font-mono);
		color: #a1a1aa;
	}
	@media (max-width: 760px) {
		.provider-card {
			flex-direction: column;
			align-items: stretch;
			gap: 12px;
		}
		.provider-actions {
			justify-content: space-between;
		}
	}
</style>
