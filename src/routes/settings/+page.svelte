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
		Trash2,
		X
	} from '@lucide/svelte';
	import ThemeToggle from '$lib/components/ThemeToggle.svelte';
	import { authClient } from '$lib/client/auth';

	type ProviderState = {
		provider: string;
		name: string;
		description: string;
		envVar: string | null;
		apiKey: string | null;
		baseUrl: string | null;
		fromUser: boolean;
		configured: boolean;
		customConfig: CustomConfig | null;
	};
	type Protocol =
		| 'openai-completions'
		| 'openai-responses'
		| 'anthropic-messages'
		| 'google-generative-ai'
		| 'mistral-conversations'
		| 'pi-messages'
		| 'azure-openai-responses';
	type CustomConfig = {
		name: string;
		protocol: Protocol;
		models: Array<{ id: string; name?: string }>;
	};
	const PROTOCOLS: Array<{ id: Protocol; name: string; description: string }> = [
		{ id: 'openai-completions', name: 'OpenAI compatible', description: 'Chat Completions API' },
		{ id: 'openai-responses', name: 'OpenAI Responses', description: 'Responses API' },
		{ id: 'anthropic-messages', name: 'Anthropic compatible', description: 'Messages API' },
		{ id: 'google-generative-ai', name: 'Google compatible', description: 'Generative AI API' },
		{ id: 'mistral-conversations', name: 'Mistral compatible', description: 'Conversations API' },
		{ id: 'pi-messages', name: 'Pi compatible', description: 'Pi Messages API' },
		{ id: 'azure-openai-responses', name: 'Azure OpenAI', description: 'Azure Responses API' }
	];

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

	let user = $state<{ name: string; role?: string | null } | null>(null);
	let loading = $state(true);
	let saving = $state(false);
	let toast = $state('');
	let providers = $state<ProviderState[]>([]);
	let editing = $state<string | null>(null);
	let draftKey = $state('');
	let draftBaseUrl = $state('');
	let draftName = $state('');
	let draftProtocol = $state<Protocol>('openai-completions');
	let draftModels = $state('');
	let creatingCustom = $state(false);
	let discovering = $state(false);

	function notify(message: string) {
		toast = message;
		setTimeout(() => (toast = ''), 1800);
	}

	async function loadProviders() {
		const response = await fetch('/api/providers');
		if (!response.ok) throw new Error('Could not load providers');
		const data = await response.json();
		const builtIns = PROVIDERS.map((info) => {
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
				configured: Boolean(stored?.apiKey),
				customConfig: null
			};
		});
		const custom = (data.providers ?? [])
			.filter((provider: { customConfig?: CustomConfig }) => provider.customConfig)
			.map(
				(provider: {
					provider: string;
					apiKey: string | null;
					baseUrl: string | null;
					fromUser: boolean;
					customConfig: CustomConfig;
				}) => ({
					...provider,
					name: provider.customConfig.name,
					description: `${PROTOCOLS.find((item) => item.id === provider.customConfig.protocol)?.name ?? provider.customConfig.protocol} · ${provider.customConfig.models.length} model${provider.customConfig.models.length === 1 ? '' : 's'}`,
					envVar: null,
					configured: Boolean(provider.baseUrl)
				})
			);
		providers = [...builtIns, ...custom];
	}

	onMount(async () => {
		try {
			const sessionResponse = await authClient.getSession();
			if (sessionResponse.data) user = sessionResponse.data.user ?? null;
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
		creatingCustom = false;
		editing = provider;
		const current = providers.find((p) => p.provider === provider);
		draftKey = '';
		draftBaseUrl = current?.baseUrl ?? '';
		draftName = current?.customConfig?.name ?? '';
		draftProtocol = current?.customConfig?.protocol ?? 'openai-completions';
		draftModels = current?.customConfig?.models.map((model) => model.id).join('\n') ?? '';
	}

	function openCustomEditor() {
		creatingCustom = true;
		editing = 'new';
		draftKey = '';
		draftBaseUrl = '';
		draftName = '';
		draftProtocol = 'openai-completions';
		draftModels = '';
	}

	async function discoverModels() {
		if (!draftBaseUrl.trim()) {
			notify('Enter a base URL to fetch models');
			return;
		}
		discovering = true;
		try {
			const res = await fetch('/api/providers/discover', {
				method: 'POST',
				headers: { 'content-type': 'application/json' },
				body: JSON.stringify({
					protocol: draftProtocol,
					baseUrl: draftBaseUrl.trim(),
					apiKey: draftKey.trim() || undefined,
					provider: creatingCustom ? undefined : editing ?? undefined
				})
			});
			if (!res.ok) {
				const err = await res.json();
				throw new Error(err.error?.message ?? 'Could not retrieve models');
			}
			const data = await res.json();
			if (!data.models || data.models.length === 0) {
				notify('No models found at endpoint');
			} else {
				draftModels = data.models.map((m: { id: string }) => m.id).join('\n');
				notify(`Retrieved ${data.models.length} model${data.models.length === 1 ? '' : 's'}`);
			}
		} catch (error) {
			notify(error instanceof Error ? error.message : 'Could not retrieve models');
		} finally {
			discovering = false;
		}
	}

	async function saveProvider() {
		if (!editing) return;
		const provider = editing;
		const current = providers.find((p) => p.provider === provider);
		const isCustom = creatingCustom || Boolean(current?.customConfig);
		if (!draftKey.trim() && !draftBaseUrl.trim() && !current?.fromUser) {
			notify('Enter an API key or a base URL');
			return;
		}
		saving = true;
		try {
			const body: Record<string, unknown> = {};
			// An empty key field keeps the saved key; use Remove to delete it.
			if (draftKey.trim()) body.apiKey = draftKey.trim();
			if (draftBaseUrl.trim()) body.baseUrl = draftBaseUrl.trim();
			else if (current?.baseUrl) body.baseUrl = null;
			if (isCustom) {
				const modelIds = [
					...new Set(
						draftModels
							.split(/[\n,]/)
							.map((id) => id.trim())
							.filter(Boolean)
					)
				];
				if (!draftName.trim() || !draftBaseUrl.trim()) {
					notify('Enter a provider name and base URL');
					return;
				}
				body.customConfig = {
					name: draftName.trim(),
					protocol: draftProtocol,
					models: modelIds.map((id) => ({ id }))
				};
			}
			const response = await fetch(
				creatingCustom ? '/api/providers' : `/api/providers/${provider}`,
				{
					method: creatingCustom ? 'POST' : 'PUT',
					headers: { 'content-type': 'application/json' },
					body: JSON.stringify(body)
				}
			);
			if (!response.ok)
				throw new Error((await response.json()).error?.message ?? 'Could not save provider');
			notify('Provider saved');
			editing = null;
			creatingCustom = false;
			await loadProviders();
		} catch (error) {
			notify(error instanceof Error ? error.message : 'Could not save provider');
		} finally {
			saving = false;
		}
	}

	async function removeProvider(provider: string) {
		if (!window.confirm('Remove this provider connection? This cannot be undone.')) return;
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
		await authClient.signOut();
		window.location.href = '/login';
	}
</script>

<svelte:head><title>Mimin WebUI | Settings</title></svelte:head>
<div class="app-shell">
	<aside class="sidebar">
		<div class="brand">
			<span class="brand-mark"><Sparkles size={13} /></span><span>mimin</span><span
				class="brand-muted">/ workbench</span
			>
		</div>
		<a class="new-chat" href={resolve('/chat')}><Plus size={16} /> New chat <kbd>⌘ K</kbd></a>
		<div class="sidebar-scroll">
			<div class="nav-label">Workspace</div>
			<a class="nav-item" href={resolve('/chat')}><MessageSquare size={16} /> Chat</a>
			<a class="nav-item" href={resolve('/projects')}><FolderKanban size={16} /> Projects</a>
			{#if user?.role === 'admin'}<a class="nav-item" href={resolve('/admin/users')}><Settings size={16} /> Users</a>{/if}
			<div class="nav-label projects-label">Preferences</div>
			<a class="nav-item active" href={resolve('/settings')}><Settings size={16} /> Models</a>
		</div>
		<div class="sidebar-bottom">
			<div class="user-row">
				<span class="avatar">{user?.name?.[0]?.toUpperCase() ?? 'F'}</span>
				<div class="user-meta">
					<strong>{user?.name ?? 'Fadhil'}</strong>
					<small>Personal workspace</small>
				</div>
				<button class="logout-btn" onclick={logout} title="Log out" aria-label="Log out">
					<LogOut size={15} />
				</button>
			</div>
		</div>
	</aside>

	<main class="main-content">
		<header class="topbar">
			<div class="breadcrumb">
				<strong>Settings</strong><span class="crumb-sep">/</span><span>Models</span>
			</div>
			<div class="top-actions">
				<ThemeToggle /><span class="avatar avatar-top">{user?.name?.[0]?.toUpperCase() ?? 'F'}</span
				>
			</div>
		</header>
		<div class="page-wrap">
			<div class="page-heading">
				<div>
					<h1>Models & connections</h1>
					<p>
						Connect the models Mimin can use. Your keys are encrypted and only power your
						conversations.
					</p>
				</div>
				<button class="button primary add-provider" onclick={openCustomEditor}
					><Plus size={15} /> Add provider</button
				>
			</div>
			{#if loading}
				<div class="empty-state" role="status">Checking model connections...</div>
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
										onclick={() => removeProvider(provider.provider)}
										aria-label="Remove key"><Trash2 size={14} /> Remove</button
									>
								{/if}
								<button class="button primary" onclick={() => openEditor(provider.provider)}
									>{provider.configured || provider.fromUser ? 'Manage' : 'Connect'}</button
								>
							</div>
						</article>
					{/each}
				</div>
				<p class="footnote">
					Technical connection details stay here. Saved keys are encrypted and never returned to
					your browser.
				</p>
			{/if}
		</div>
	</main>
</div>

{#if editing}
	<div
		class="modal-backdrop"
		role="dialog"
		aria-modal="true"
		aria-labelledby="provider-dialog-title"
		tabindex="-1"
		onclick={(event) => event.target === event.currentTarget && (editing = null)}
		onkeydown={(event) => event.key === 'Escape' && (editing = null)}
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
					<h2 id="provider-dialog-title">
						{creatingCustom
							? 'Add custom provider'
							: (providers.find((p) => p.provider === editing)?.name ?? 'Provider')}
					</h2>
				</div>
				<button
					type="button"
					class="icon-button"
					aria-label="Close"
					title="Close dialog"
					onclick={() => (editing = null)}><X size={18} /></button
				>
			</div>
			{#if creatingCustom || providers.find((p) => p.provider === editing)?.customConfig}
				<label
					>Provider name
					<input bind:value={draftName} placeholder="My local models" autocomplete="off" />
				</label>
				<label
					>API template
					<select bind:value={draftProtocol}>
						{#each PROTOCOLS as protocol}
							<option value={protocol.id}>{protocol.name} — {protocol.description}</option>
						{/each}
					</select>
				</label>
			{/if}
			<label
				>Base URL {#if !creatingCustom && !providers.find((p) => p.provider === editing)?.customConfig}<span
						class="optional">optional</span
					>{/if}
				<input
					type="text"
					bind:value={draftBaseUrl}
					placeholder="https://api.example.com/v1"
					autocomplete="off"
				/>
			</label>
			<label
				>API key {#if creatingCustom || providers.find((p) => p.provider === editing)?.customConfig}<span
						class="optional">optional for keyless servers</span
					>{/if}
				<input type="password" bind:value={draftKey} placeholder="sk-..." autocomplete="off" />
			</label>
			{#if creatingCustom || providers.find((p) => p.provider === editing)?.customConfig}
				<div class="models-label-row">
					<span class="field-title"
						>Model IDs <span class="optional">auto-retrieved if blank</span></span
					>
					<button
						type="button"
						class="fetch-models-btn"
						onclick={discoverModels}
						disabled={discovering}
					>
						{discovering ? 'Fetching...' : 'Fetch models'}
					</button>
				</div>
				<textarea
					bind:value={draftModels}
					rows="4"
					placeholder="Leave blank to retrieve automatically, or enter one per line"></textarea>
			{/if}
			<div class="modal-actions">
				<button type="button" class="button" onclick={() => (editing = null)}>Cancel</button>
				<button type="submit" class="button primary" disabled={saving}
					>{saving ? 'Saving...' : 'Save connection'}</button
				>
			</div>
		</form>
	</div>
{/if}
{#if toast}<div class="toast" role="status" aria-live="polite">{toast}</div>{/if}

<svelte:window onkeydown={(event) => event.key === 'Escape' && (editing = null)} />

<style>
	.page-wrap {
		max-width: 860px;
		margin: auto;
		padding: clamp(32px, 6vh, 56px) 35px 75px;
	}
	.page-heading {
		display: flex;
		align-items: flex-end;
		justify-content: space-between;
		border-bottom: 1px solid var(--border);
		padding-bottom: 28px;
	}
	.page-heading h1 {
		margin: 0 0 7px;
		font-family: var(--font-display);
		font-size: 32px;
		line-height: 1.1;
		letter-spacing: -0.03em;
	}
	.page-heading p {
		margin: 0;
		color: var(--text-muted);
	}
	.add-provider {
		flex: 0 0 auto;
		margin-left: 20px;
	}
	.modal select {
		display: block;
		width: 100%;
		min-height: 44px;
		margin-top: 6px;
		padding: 10px;
		border: 1px solid var(--input-border);
		border-radius: 6px;
		outline: none;
		background: var(--surface);
		color: var(--text);
	}
	.modal select:focus {
		border-color: var(--focus);
	}
	.empty-state {
		text-align: center;
		color: var(--text-dim);
		font-size: 13px;
		padding: 40px 0;
		line-height: 1.5;
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
		border-radius: 12px;
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
	.models-label-row {
		display: flex;
		align-items: center;
		justify-content: space-between;
		margin-top: 14px;
		margin-bottom: 2px;
	}
	.field-title {
		font-size: var(--text-sm);
		font-weight: 500;
		color: var(--text);
	}
	.fetch-models-btn {
		background: var(--surface-subtle, rgba(255, 255, 255, 0.05));
		border: 1px solid var(--border);
		border-radius: 4px;
		color: var(--text-muted);
		font-size: var(--text-xs);
		padding: 3px 9px;
		cursor: pointer;
		transition: 0.15s ease;
	}
	.fetch-models-btn:hover:not(:disabled) {
		color: var(--text);
		border-color: var(--text-dim);
	}
	.fetch-models-btn:disabled {
		opacity: 0.5;
		cursor: not-allowed;
	}
	@media (max-width: 700px) {
		.page-heading {
			align-items: flex-start;
			flex-direction: column;
			gap: 18px;
		}
		.add-provider {
			margin-left: 0;
		}
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
