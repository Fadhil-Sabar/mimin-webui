<script lang="ts">
	import { onMount } from 'svelte';
	import { resolve } from '$app/paths';
	import {
		KeyRound,
		LogOut,
		MessageSquare,
		FolderKanban,
		Plus,
		Settings,
		Sparkles,
		Trash2
	} from '@lucide/svelte';
	import ThemeToggle from '$lib/components/ThemeToggle.svelte';

	type ProviderState = {
		provider: string;
		name: string;
		description: string;
		envVar: string;
		apiKey: string | null;
		baseUrl: string | null;
		fromUser: boolean;
		configured: boolean;
	};

	const PROVIDERS: Array<{ id: string; name: string; description: string; envVar: string }> = [
		{
			id: 'openai',
			name: 'OpenAI',
			description: 'GPT models via the OpenAI Responses API.',
			envVar: 'OPENAI_API_KEY'
		},
		{
			id: 'anthropic',
			name: 'Anthropic',
			description: 'Claude models via the Messages API.',
			envVar: 'ANTHROPIC_API_KEY'
		},
		{
			id: 'google',
			name: 'Google',
			description: 'Gemini models via the Generative Language API.',
			envVar: 'GOOGLE_API_KEY'
		}
	];

	let user = $state<{ name: string } | null>(null);
	let loading = $state(true);
	let saving = $state(false);
	let toast = $state('');
	let providers = $state<ProviderState[]>([]);
	let editing = $state<string | null>(null);
	let draftKey = $state('');
	let draftBaseUrl = $state('');

	function notify(message: string) {
		toast = message;
		setTimeout(() => (toast = ''), 1800);
	}

	async function loadProviders() {
		const response = await fetch('/api/providers');
		if (!response.ok) throw new Error('Could not load providers');
		const data = await response.json();
		providers = PROVIDERS.map((info) => {
			const stored = (data.providers ?? []).find(
				(p: { provider: string }) => p.provider === info.id
			);
			return {
				provider: info.id,
				name: info.name,
				description: info.description,
				envVar: info.envVar,
				apiKey: stored?.apiKey ?? null,
				baseUrl: stored?.baseUrl ?? null,
				fromUser: Boolean(stored?.fromUser),
				configured: Boolean(stored?.apiKey)
			};
		});
	}

	onMount(async () => {
		try {
			const sessionResponse = await fetch('/api/auth/session');
			if (sessionResponse.ok) user = (await sessionResponse.json()).user ?? null;
		} catch {
			/* ignore */
		}
		try {
			await loadProviders();
		} catch (error) {
			notify(error instanceof Error ? error.message : 'Could not load providers');
		} finally {
			loading = false;
		}
	});

	function openEditor(provider: string) {
		editing = provider;
		const current = providers.find((p) => p.provider === provider);
		draftKey = '';
		draftBaseUrl = current?.baseUrl ?? '';
	}

	async function saveProvider() {
		if (!editing) return;
		const provider = editing;
		if (!draftKey.trim() && !draftBaseUrl.trim()) {
			notify('Enter an API key or a base URL');
			return;
		}
		saving = true;
		try {
			const body: Record<string, string> = {};
			if (draftKey.trim()) body.apiKey = draftKey.trim();
			if (draftBaseUrl.trim()) body.baseUrl = draftBaseUrl.trim();
			const response = await fetch(`/api/providers/${provider}`, {
				method: 'PUT',
				headers: { 'content-type': 'application/json' },
				body: JSON.stringify(body)
			});
			if (!response.ok)
				throw new Error((await response.json()).error?.message ?? 'Could not save provider');
			notify('Provider saved');
			editing = null;
			await loadProviders();
		} catch (error) {
			notify(error instanceof Error ? error.message : 'Could not save provider');
		} finally {
			saving = false;
		}
	}

	async function removeProvider(provider: string) {
		try {
			const response = await fetch(`/api/providers/${provider}`, { method: 'DELETE' });
			if (!response.ok) throw new Error('Could not remove provider');
			notify('Provider key removed');
			await loadProviders();
		} catch (error) {
			notify(error instanceof Error ? error.message : 'Could not remove provider');
		}
	}

	async function logout() {
		await fetch('/api/auth/logout', { method: 'POST' });
		window.location.href = '/login';
	}
</script>

<svelte:head><title>Mimin WebUI | Settings</title></svelte:head>
<div class="app-shell">
	<aside class="sidebar">
		<div class="brand">
			<span class="brand-mark"><Sparkles size={13} /></span><span>solace</span><span
				class="brand-muted">/ agent</span
			>
		</div>
		<a class="new-chat" href={resolve('/chat')}><Plus size={16} /> New chat <kbd>⌘ K</kbd></a>
		<div class="sidebar-scroll">
			<div class="nav-label">Workspace</div>
			<a class="nav-item" href={resolve('/chat')}><MessageSquare size={16} /> Chat</a>
			<a class="nav-item" href={resolve('/projects')}><FolderKanban size={16} /> Projects</a>
			<div class="nav-label projects-label">Preferences</div>
			<a class="nav-item active" href={resolve('/settings')}><Settings size={16} /> Providers</a>
		</div>
		<div class="sidebar-bottom">
			<button class="nav-item" onclick={logout}><LogOut size={16} /> Log out</button>
			<div class="user-row">
				<span class="avatar">{user?.name?.[0]?.toUpperCase() ?? 'F'}</span><span
					><strong>{user?.name ?? 'Fadhil'}</strong><small>Personal workspace</small></span
				>
			</div>
		</div>
	</aside>

	<main class="main-content">
		<header class="topbar">
			<div class="breadcrumb">
				<strong>Settings</strong><span class="crumb-sep">/</span><span>Providers</span>
			</div>
			<div class="top-actions">
				<ThemeToggle /><span class="avatar avatar-top">{user?.name?.[0]?.toUpperCase() ?? 'F'}</span
				>
			</div>
		</header>
		<div class="page-wrap">
			<div class="page-heading">
				<div>
					<div class="eyebrow">AI PROVIDERS</div>
					<h1>Providers</h1>
					<p>
						Add your own API keys. Keys are encrypted and only used to power your conversations.
					</p>
				</div>
			</div>
			{#if loading}
				<div class="empty-state">Loading providers...</div>
			{:else}
				<div class="provider-list">
					{#each providers as provider (provider.provider)}
						<article class="provider-card">
							<div class="provider-main">
								<span class="provider-icon"><KeyRound size={16} /></span>
								<div class="provider-info">
									<div class="provider-name">
										<strong>{provider.name}</strong>
										{#if provider.fromUser}
											<span class="badge ok">Your key</span>
										{:else if provider.configured}
											<span class="badge ok">Server key</span>
										{:else}
											<span class="badge">Not set</span>
										{/if}
									</div>
									<p>{provider.description}</p>
									<div class="provider-meta">
										<span class="mono">{provider.envVar}</span>
										{#if provider.fromUser}
											<span class="mono dim">{provider.apiKey}</span>
										{:else if provider.configured}
											<span class="mono dim">Fallback: server {provider.envVar}</span>
										{/if}
									</div>
								</div>
							</div>
							<div class="provider-actions">
								{#if provider.fromUser}
									<button
										class="button danger"
										onclick={() => removeProvider(provider.provider)}
										aria-label="Remove key"><Trash2 size={14} /> Remove</button
									>
								{/if}
								<button class="button primary" onclick={() => openEditor(provider.provider)}
									>Edit</button
								>
							</div>
						</article>
					{/each}
				</div>
				<p class="footnote">
					Keys are stored encrypted in the database and never sent back to the browser. Without a
					saved key, the server environment variable is used.
				</p>
			{/if}
		</div>
	</main>
</div>

{#if editing}
	<div
		class="modal-backdrop"
		role="presentation"
		onclick={(event) => event.target === event.currentTarget && (editing = null)}
	>
		<form
			class="modal"
			onsubmit={(event) => {
				event.preventDefault();
				saveProvider();
			}}
		>
			<div class="modal-head">
				<div>
					<div class="eyebrow">PROVIDER KEY</div>
					<h2>{providers.find((p) => p.provider === editing)?.name ?? 'Provider'}</h2>
				</div>
				<button
					type="button"
					class="icon-button"
					aria-label="Close"
					onclick={() => (editing = null)}>×</button
				>
			</div>
			<label
				>API key
				<input type="password" bind:value={draftKey} placeholder="sk-..." autocomplete="off" />
			</label>
			<label
				>Base URL <span class="optional">optional</span>
				<input
					type="text"
					bind:value={draftBaseUrl}
					placeholder="https://api.example.com/v1"
					autocomplete="off"
				/>
			</label>
			<div class="modal-actions">
				<button type="button" class="button" onclick={() => (editing = null)}>Cancel</button>
				<button type="submit" class="button primary" disabled={saving}
					>{saving ? 'Saving...' : 'Save provider'}</button
				>
			</div>
		</form>
	</div>
{/if}
{#if toast}<div class="toast">{toast}</div>{/if}

<style>
	.page-wrap {
		max-width: 860px;
		margin: auto;
		padding: 43px 35px 75px;
	}
	.page-heading {
		display: flex;
		align-items: flex-end;
		justify-content: space-between;
		border-bottom: 1px solid var(--border);
		padding-bottom: 28px;
	}
	.page-heading h1 {
		margin: 7px 0 5px;
		font-size: 32px;
		letter-spacing: -0.06em;
	}
	.page-heading p {
		margin: 0;
		color: var(--text-muted);
	}
	.empty-state {
		text-align: center;
		color: var(--text-dim);
		font-size: 13px;
		padding: 40px 0;
	}
	.provider-list {
		display: flex;
		flex-direction: column;
		gap: 11px;
		padding-top: 24px;
	}
	.provider-card {
		display: flex;
		align-items: center;
		justify-content: space-between;
		gap: 18px;
		padding: 17px 19px;
		background: var(--surface);
		border: 1px solid var(--border);
		border-radius: 9px;
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
		width: 35px;
		height: 35px;
		flex: 0 0 auto;
		color: var(--text-muted);
		background: var(--surface-3);
		border: 1px solid var(--border);
		border-radius: 8px;
	}
	.provider-name {
		display: flex;
		align-items: center;
		gap: 9px;
	}
	.provider-name strong {
		font-size: var(--text-lg);
		letter-spacing: -0.02em;
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
		gap: 10px;
	}
	.mono {
		font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
		font-size: var(--text-xs);
		color: var(--text-body);
	}
	.mono.dim {
		color: var(--text-faint);
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
		padding: 8px 11px;
		border-radius: 6px;
		border: 1px solid var(--border-strong);
		background: var(--surface);
		color: var(--text-body);
		font-size: var(--text-sm);
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
		color: #e08a80;
		border-color: color-mix(in srgb, #a8433a 45%, transparent);
	}
	.button.danger:hover {
		color: #f0a49b;
		border-color: #c05a50;
	}
	.footnote {
		margin: 22px 0 0;
		color: var(--text-dim);
		font-size: var(--text-sm);
		line-height: 1.55;
	}
	.crumb-sep {
		color: var(--text-faint);
		margin: 0 3px;
	}
	.modal .optional {
		color: var(--text-faint);
		font-size: var(--text-xs);
		font-weight: 400;
		margin-left: 4px;
	}
	@media (max-width: 700px) {
		.provider-card {
			flex-direction: column;
			align-items: stretch;
		}
		.provider-actions {
			justify-content: flex-end;
		}
	}
</style>
