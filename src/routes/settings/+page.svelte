<script lang="ts">
	import { onMount } from 'svelte';
	import { resolve } from '$app/paths';
	import {
		FolderKanban,
		FileText,
		Globe,
		LogOut,
		MessageSquare,
		PanelLeft,
		Plus,
		Puzzle,
		Settings,
		Sparkles,
		User
	} from '@lucide/svelte';
	import ThemeToggle from '$lib/components/ThemeToggle.svelte';
	import { toast } from 'svelte-sonner';
	import { authClient } from '$lib/client/auth';
	import { sidebar } from '$lib/client/sidebar.svelte';
	import RecentChats from '$lib/components/RecentChats.svelte';
	import SidebarBackdrop from '$lib/components/SidebarBackdrop.svelte';
	import { Button } from '$lib/components/ui/button/index.js';
	import ProviderCard from './ProviderCard.svelte';
	import ProviderFormModal from './ProviderFormModal.svelte';
	import {
		consumeNavigationHandoff,
		createNavigationHandoff
	} from '$lib/client/navigation-handoff';
	import {
		isModelFree,
		PROTOCOLS,
		type CustomConfig,
		type ModelItem,
		type Protocol,
		type ProviderState
	} from './provider-types';

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

	let { data } = $props();
	let user = $derived(data.user);
	let loading = $state(true);
	let saving = $state(false);
	let providers = $state<ProviderState[]>([]);
	let editing = $state<string | null>(null);
	let draftKey = $state('');
	let draftBaseUrl = $state('');
	let draftName = $state('');
	let draftProtocol = $state<Protocol>('openai-completions');
	let draftModels = $state('');
	let creatingCustom = $state(false);
	let discovering = $state(false);
	let modelsList = $state<ModelItem[]>([]);
	let modelFilter = $state('');
	let manualModelId = $state('');
	let textEditMode = $state(false);
	let returnTarget = $state<string | null>(null);
	let returnPrompt = $state('');

	function notify(message: string) {
		toast(message);
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
		const handoff = consumeNavigationHandoff();
		returnTarget = handoff?.returnTo === '/' ? '/' : null;
		returnPrompt = handoff?.returnTo === '/' ? handoff.prompt : '';
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
		modelFilter = '';
		manualModelId = '';
		textEditMode = false;
		const existingModels = current?.customConfig?.models ?? [];
		modelsList = existingModels.map((m) => ({
			id: m.id,
			name: m.name,
			contextWindow: m.contextWindow,
			maxTokens: m.maxTokens,
			reasoning: m.reasoning,
			vision: m.vision,
			isFree: isModelFree(m),
			checked: true
		}));
		draftModels = modelsList.map((m) => m.id).join('\n');
	}

	function openCustomEditor() {
		creatingCustom = true;
		editing = 'new';
		draftKey = '';
		draftBaseUrl = '';
		draftName = '';
		draftProtocol = 'openai-completions';
		draftModels = '';
		modelsList = [];
		modelFilter = '';
		manualModelId = '';
		textEditMode = false;
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
					provider: creatingCustom ? undefined : (editing ?? undefined)
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
				const existingChecked = new Set(modelsList.filter((m) => m.checked).map((m) => m.id));
				const hadExisting = existingChecked.size > 0;
				const discovered: Array<{
					id: string;
					name?: string;
					contextWindow?: number;
					maxTokens?: number;
					reasoning?: boolean;
					vision?: boolean;
					isFree?: boolean;
				}> = data.models;

				const discoveredIds = new Set(discovered.map((m) => m.id));
				const manualRetained = modelsList.filter((m) => !discoveredIds.has(m.id) && m.checked);

				modelsList = [
					...discovered.map((m) => ({
						id: m.id,
						name: m.name,
						contextWindow: m.contextWindow,
						maxTokens: m.maxTokens,
						reasoning: m.reasoning,
						vision: m.vision,
						isFree: isModelFree(m),
						checked: hadExisting ? existingChecked.has(m.id) : true
					})),
					...manualRetained
				];
				textEditMode = false;
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
				if (!draftName.trim() || !draftBaseUrl.trim()) {
					notify('Enter a provider name and base URL');
					return;
				}

				let finalModels: Array<{
					id: string;
					name?: string;
					contextWindow?: number;
					maxTokens?: number;
					reasoning?: boolean;
					vision?: boolean;
				}>;

				if (textEditMode) {
					const modelIds = [
						...new Set(
							draftModels
								.split(/[\n,]/)
								.map((id) => id.trim())
								.filter(Boolean)
						)
					];
					finalModels = modelIds.map((id) => ({ id }));
				} else if (modelsList.length > 0) {
					const checkedModels = modelsList.filter((m) => m.checked);
					if (checkedModels.length === 0) {
						notify('Select at least one model to enable');
						return;
					}
					finalModels = checkedModels.map((m) => ({
						id: m.id,
						...(m.name ? { name: m.name } : {}),
						...(m.contextWindow ? { contextWindow: m.contextWindow } : {}),
						...(m.maxTokens ? { maxTokens: m.maxTokens } : {}),
						...(typeof m.reasoning === 'boolean' ? { reasoning: m.reasoning } : {}),
						...(typeof m.vision === 'boolean' ? { vision: m.vision } : {})
					}));
				} else {
					finalModels = [];
				}

				body.customConfig = {
					name: draftName.trim(),
					protocol: draftProtocol,
					models: finalModels
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
			if (returnTarget) {
				createNavigationHandoff({ prompt: returnPrompt, returnTo: returnTarget });
				window.location.href = returnTarget;
			}
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
<div
	class="app-shell"
	class:sidebar-collapsed={sidebar.collapsed}
	class:mobile-open={sidebar.mobileOpen}
>
	<SidebarBackdrop />
	<aside class="sidebar">
		<div class="sidebar-top-row">
			<div class="brand">
				<span class="brand-mark"><Sparkles size={13} /></span><span>mimin</span><span
					class="brand-muted">/ workbench</span
				>
			</div>
			<button
				class="sidebar-toggle"
				onclick={() => sidebar.toggle()}
				title="Collapse sidebar"
				aria-label="Collapse sidebar"><PanelLeft size={16} /></button
			>
		</div>
		<a class="new-chat" href={resolve('/chat?new=1')}><Plus size={16} /> New chat <kbd>⌘ K</kbd></a>
		<div class="sidebar-scroll">
			<div class="nav-label">Workspace</div>
			<a class="nav-item" href={resolve('/chat')}><MessageSquare size={16} /> Chat</a>
			<a class="nav-item" href={resolve('/projects')}><FolderKanban size={16} /> Projects</a>
			{#if user?.role === 'admin'}<a class="nav-item" href={resolve('/admin/users')}
					><User size={16} /> Users</a
				>{/if}
			<div class="nav-label projects-label">Preferences</div>
			<a class="nav-item active" href={resolve('/settings')}><Settings size={16} /> Models</a>
			<a class="nav-item" href={resolve('/settings/instructions')}
				><FileText size={16} /> Instructions</a
			>
			<a class="nav-item" href={resolve('/skills')}><Sparkles size={16} /> Skills</a>
			<a class="nav-item" href={resolve('/settings/web-search')}><Globe size={16} /> Web Search</a>
			<a class="nav-item" href={resolve('/settings/browser-extension')}
				><Puzzle size={16} /> Browser Extension</a
			>
			<RecentChats />
		</div>
		<div class="sidebar-bottom">
			<div class="user-row">
				<span class="avatar">{user?.name?.[0]?.toUpperCase() ?? 'U'}</span>
				<div class="user-meta">
					<strong>{user?.name ?? 'User'}</strong>
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
			<div class="topbar-left">
				<button
					class="sidebar-toggle topbar-toggle"
					onclick={() => sidebar.toggle()}
					title="Toggle sidebar"
					aria-label="Toggle sidebar"><PanelLeft size={16} /></button
				>
				<div class="breadcrumb">
					<strong>Settings</strong><span class="crumb-sep">/</span><span>Models</span>
				</div>
			</div>
			<div class="top-actions">
				<ThemeToggle /><span class="avatar avatar-top">{user?.name?.[0]?.toUpperCase() ?? 'U'}</span
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
				<Button variant="default" class="ml-5 max-[700px]:ml-0" onclick={openCustomEditor}
					><Plus size={15} /> Add provider</Button
				>
			</div>
			{#if loading}
				<div class="empty-state" role="status">Checking model connections...</div>
			{:else}
				<div class="provider-list">
					{#each providers as provider (provider.provider)}
						<ProviderCard {provider} onmanage={openEditor} onremove={removeProvider} />
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
	<ProviderFormModal
		creating={creatingCustom}
		provider={providers.find((p) => p.provider === editing) ?? null}
		{saving}
		bind:name={draftName}
		bind:protocol={draftProtocol}
		bind:baseUrl={draftBaseUrl}
		bind:apiKey={draftKey}
		bind:models={modelsList}
		bind:filter={modelFilter}
		bind:manualModelId
		bind:textEditMode
		bind:draftModels
		{discovering}
		onclose={() => (editing = null)}
		onsave={saveProvider}
		ondiscover={discoverModels}
		onnotify={notify}
	/>
{/if}

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
		margin: 0 0 6px;
		font-family: var(--font-body);
		font-size: var(--text-2xl);
		font-weight: 600;
		line-height: 1.2;
		letter-spacing: -0.025em;
		color: var(--text-strong);
	}
	.page-heading p {
		margin: 0;
		color: var(--text-muted);
		font-size: var(--text-sm);
		line-height: 1.5;
	}
	.empty-state {
		text-align: center;
		color: var(--text-dim);
		font-size: var(--text-sm);
		padding: 40px 0;
		line-height: 1.5;
	}
	.provider-list {
		display: flex;
		flex-direction: column;
		gap: 11px;
		padding-top: 24px;
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
	@media (max-width: 700px) {
		.page-heading {
			align-items: flex-start;
			flex-direction: column;
			gap: 18px;
		}
	}
</style>
