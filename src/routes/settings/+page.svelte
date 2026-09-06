<script lang="ts">
	import { onMount } from 'svelte';
	import { resolve } from '$app/paths';
	import {
		FolderKanban,
		Globe,
		KeyRound,
		LogOut,
		MessageSquare,
		PanelLeft,
		Plus,
		Puzzle,
		Search,
		Settings,
		Sparkles,
		Trash2,
		User,
		X
	} from '@lucide/svelte';
	import ThemeToggle from '$lib/components/ThemeToggle.svelte';
	import { authClient } from '$lib/client/auth';
	import { sidebar } from '$lib/client/sidebar.svelte';
	import RecentChats from '$lib/components/RecentChats.svelte';

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
		models: Array<{
			id: string;
			name?: string;
			contextWindow?: number;
			maxTokens?: number;
			reasoning?: boolean;
			vision?: boolean;
		}>;
	};
	type ModelItem = {
		id: string;
		name?: string;
		contextWindow?: number;
		maxTokens?: number;
		reasoning?: boolean;
		vision?: boolean;
		isFree?: boolean;
		checked: boolean;
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

	let { data } = $props();
	let user = $derived(data.user);
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
	let modelsList = $state<ModelItem[]>([]);
	let modelFilter = $state('');
	let manualModelId = $state('');
	let textEditMode = $state(false);

	let checkedCount = $derived(modelsList.filter((m) => m.checked).length);
	let totalCount = $derived(modelsList.length);
	let filteredModels = $derived.by(() => {
		const q = modelFilter.trim().toLowerCase();
		if (!q) return modelsList;
		return modelsList.filter((m) => matchesFilter(m, q));
	});

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
			await loadProviders();
		} catch (error) {
			notify(error instanceof Error ? error.message : 'Could not load providers');
		} finally {
			loading = false;
		}
	});

	function isModelFree(model: { id: string; name?: string; isFree?: boolean }) {
		if (model.isFree === true) return true;
		const lowerId = model.id.toLowerCase();
		const lowerName = (model.name ?? '').toLowerCase();
		return (
			lowerId.includes(':free') ||
			lowerId.endsWith('/free') ||
			/\bfree\b/i.test(lowerId) ||
			/\bfree\b/i.test(lowerName)
		);
	}

	function matchesFilter(model: ModelItem, query: string) {
		const q = query.toLowerCase();
		return model.id.toLowerCase().includes(q) || (model.name?.toLowerCase().includes(q) ?? false);
	}

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

	function reverseSelection() {
		const q = modelFilter.trim().toLowerCase();
		modelsList = modelsList.map((m) => {
			if (q && !matchesFilter(m, q)) return m;
			return { ...m, checked: !m.checked };
		});
	}

	function selectAll() {
		const q = modelFilter.trim().toLowerCase();
		modelsList = modelsList.map((m) => {
			if (q && !matchesFilter(m, q)) return m;
			return { ...m, checked: true };
		});
	}

	function selectNone() {
		const q = modelFilter.trim().toLowerCase();
		modelsList = modelsList.map((m) => {
			if (q && !matchesFilter(m, q)) return m;
			return { ...m, checked: false };
		});
	}

	function selectFree() {
		const q = modelFilter.trim().toLowerCase();
		let count = 0;
		modelsList = modelsList.map((m) => {
			if (q && !matchesFilter(m, q)) return m;
			const free = isModelFree(m);
			if (free) count++;
			return { ...m, checked: free };
		});
		if (count === 0) {
			notify('No free models found');
		} else {
			notify(`Selected ${count} free model${count === 1 ? '' : 's'}`);
		}
	}

	function addManualModel() {
		const trimmed = manualModelId.trim();
		if (!trimmed) return;
		if (modelsList.some((m) => m.id === trimmed)) {
			notify('Model ID already in list');
			return;
		}
		modelsList = [
			...modelsList,
			{
				id: trimmed,
				isFree: isModelFree({ id: trimmed }),
				checked: true
			}
		];
		manualModelId = '';
	}

	function removeModel(id: string) {
		modelsList = modelsList.filter((m) => m.id !== id);
	}

	function toggleTextMode() {
		if (textEditMode) {
			const lines = draftModels
				.split(/[\n,]/)
				.map((s) => s.trim())
				.filter(Boolean);
			const existingMap = new Map(modelsList.map((m) => [m.id, m]));
			modelsList = lines.map((id) => {
				const existing = existingMap.get(id);
				return existing
					? { ...existing, checked: true }
					: { id, isFree: isModelFree({ id }), checked: true };
			});
			textEditMode = false;
		} else {
			draftModels = modelsList
				.filter((m) => m.checked)
				.map((m) => m.id)
				.join('\n');
			textEditMode = true;
		}
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
	<button
		class="sidebar-backdrop"
		onclick={() => sidebar.closeMobile()}
		aria-label="Close sidebar"
		tabindex="-1"
	></button>
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
			<a class="nav-item" href={resolve('/settings/web-search')}><Globe size={16} /> Web Search</a>
			<a class="nav-item" href={resolve('/settings/browser-extension')}
				><Puzzle size={16} /> Browser Extension</a
			>
			<RecentChats />
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
						{#each PROTOCOLS as protocol (protocol.id)}
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
				<div class="models-section">
					<div class="models-label-row">
						<div class="models-title-wrap">
							<span class="field-title">Model IDs</span>
							{#if modelsList.length > 0}
								<span class="models-count-badge">
									{checkedCount} of {totalCount} shown
								</span>
							{:else}
								<span class="optional">auto-retrieved if blank</span>
							{/if}
						</div>
						<div class="models-header-actions">
							{#if modelsList.length > 0}
								<button type="button" class="text-mode-btn" onclick={toggleTextMode}>
									{textEditMode ? 'Show list' : 'Raw text'}
								</button>
							{/if}
							<button
								type="button"
								class="fetch-models-btn"
								onclick={discoverModels}
								disabled={discovering}
							>
								{discovering ? 'Fetching...' : 'Fetch models'}
							</button>
						</div>
					</div>

					{#if textEditMode}
						<textarea
							bind:value={draftModels}
							rows="5"
							placeholder="Leave blank to retrieve automatically, or enter one per line"></textarea>
					{:else}
						{#if modelsList.length > 0}
							<div class="models-toolbar">
								<div class="btn-group-selection">
									<button
										type="button"
										class="filter-btn"
										onclick={reverseSelection}
										title="Invert selection"
									>
										Reverse
									</button>
									<button
										type="button"
										class="filter-btn"
										onclick={selectAll}
										title="Select all models"
									>
										All
									</button>
									<button
										type="button"
										class="filter-btn"
										onclick={selectNone}
										title="Deselect all models"
									>
										None
									</button>
									<button
										type="button"
										class="filter-btn free-btn"
										onclick={selectFree}
										title="Select free models"
									>
										Free
									</button>
								</div>
								<div class="models-search-box">
									<Search size={13} />
									<input type="text" bind:value={modelFilter} placeholder="Filter..." />
									{#if modelFilter}
										<button
											type="button"
											class="clear-search-btn"
											onclick={() => (modelFilter = '')}
											title="Clear filter"
										>
											<X size={12} />
										</button>
									{/if}
								</div>
							</div>

							<div class="models-list-box" role="group" aria-label="Available models">
								{#each filteredModels as model (model.id)}
									<label class="model-row" class:unchecked={!model.checked}>
										<input
											type="checkbox"
											bind:checked={model.checked}
											class="model-row-checkbox"
										/>
										<div class="model-row-content">
											<div class="model-row-main">
												<span class="model-row-id mono">{model.id}</span>
												{#if isModelFree(model)}
													<span class="model-badge-free">Free</span>
												{/if}
												{#if model.contextWindow}
													<span class="model-badge-meta"
														>{Math.round(model.contextWindow / 1000)}k</span
													>
												{/if}
											</div>
											{#if model.name && model.name !== model.id}
												<span class="model-row-name">{model.name}</span>
											{/if}
										</div>
										<button
											type="button"
											class="model-remove-btn"
											onclick={(e) => {
												e.preventDefault();
												e.stopPropagation();
												removeModel(model.id);
											}}
											title="Remove model"
											aria-label="Remove model"
										>
											<Trash2 size={13} />
										</button>
									</label>
								{/each}
								{#if filteredModels.length === 0}
									<div class="models-empty-filter">No models match "{modelFilter}"</div>
								{/if}
							</div>
						{:else}
							<div class="models-empty-state">
								<p>
									No models loaded yet. Click <strong>Fetch models</strong> above to load models from
									the endpoint, or add one below.
								</p>
							</div>
						{/if}

						<div class="model-add-row">
							<input
								type="text"
								bind:value={manualModelId}
								placeholder="Add model ID manually (e.g. meta-llama/llama-3.3-70b-instruct:free)"
								onkeydown={(e) => e.key === 'Enter' && (e.preventDefault(), addManualModel())}
							/>
							<button
								type="button"
								class="button add-model-btn"
								onclick={addManualModel}
								disabled={!manualModelId.trim()}
							>
								<Plus size={14} /> Add
							</button>
						</div>
					{/if}
				</div>
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
	.add-provider {
		flex: 0 0 auto;
		margin-left: 20px;
	}
	.modal select {
		display: block;
		width: 100%;
		min-height: 42px;
		margin-top: 6px;
		padding: 8px 11px;
		border: 1px solid var(--input-border);
		border-radius: 6px;
		outline: none;
		background: var(--surface);
		color: var(--text-strong);
		font-family: var(--font-body);
		font-size: var(--text-sm);
	}
	.modal select:focus {
		border-color: var(--focus);
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
	.modal {
		width: min(540px, 100%);
		max-height: 90vh;
		overflow-y: auto;
	}
	.models-section {
		margin-top: 16px;
		display: flex;
		flex-direction: column;
		gap: 8px;
	}
	.models-label-row {
		display: flex;
		align-items: center;
		justify-content: space-between;
		gap: 10px;
		margin-top: 4px;
		margin-bottom: 2px;
	}
	.models-title-wrap {
		display: flex;
		align-items: center;
		gap: 8px;
		flex-wrap: wrap;
	}
	.field-title {
		font-size: var(--text-sm);
		font-weight: 500;
		color: var(--text);
	}
	.models-count-badge {
		font-size: var(--text-xs);
		color: var(--text-muted);
		background: var(--surface-2);
		padding: 2px 7px;
		border-radius: 12px;
		border: 1px solid var(--border);
	}
	.models-header-actions {
		display: flex;
		align-items: center;
		gap: 6px;
	}
	.text-mode-btn {
		background: transparent;
		border: none;
		color: var(--text-muted);
		font-size: var(--text-xs);
		cursor: pointer;
		padding: 3px 6px;
		text-decoration: underline;
		text-underline-offset: 2px;
	}
	.text-mode-btn:hover {
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
	.models-toolbar {
		display: flex;
		align-items: center;
		justify-content: space-between;
		gap: 8px;
		margin-top: 4px;
		flex-wrap: wrap;
	}
	.btn-group-selection {
		display: inline-flex;
		align-items: center;
		background: var(--surface-2);
		border: 1px solid var(--border);
		border-radius: 6px;
		overflow: hidden;
	}
	.filter-btn {
		background: transparent;
		border: none;
		border-right: 1px solid var(--border);
		color: var(--text-body);
		font-size: var(--text-xs);
		font-weight: 500;
		padding: 5px 9px;
		cursor: pointer;
		transition:
			background 0.15s ease,
			color 0.15s ease;
	}
	.filter-btn:last-child {
		border-right: none;
	}
	.filter-btn:hover {
		background: var(--surface-hover);
		color: var(--text-strong);
	}
	.filter-btn.free-btn {
		color: var(--status-ok-text);
	}
	.filter-btn.free-btn:hover {
		background: color-mix(in srgb, var(--status-ok-dot) 15%, transparent);
	}
	.models-search-box {
		display: flex;
		align-items: center;
		gap: 6px;
		background: var(--surface);
		border: 1px solid var(--input-border);
		border-radius: 6px;
		padding: 3px 8px;
		flex: 1;
		min-width: 120px;
		max-width: 190px;
		color: var(--text-muted);
	}
	.models-search-box input {
		width: 100%;
		border: none;
		outline: none;
		background: transparent;
		color: var(--text);
		font-size: var(--text-xs);
		padding: 0;
		min-height: auto;
		margin: 0;
	}
	.clear-search-btn {
		background: transparent;
		border: none;
		color: var(--text-dim);
		cursor: pointer;
		padding: 0;
		display: flex;
		align-items: center;
	}
	.clear-search-btn:hover {
		color: var(--text);
	}
	.models-list-box {
		max-height: 220px;
		overflow-y: auto;
		border: 1px solid var(--input-border);
		border-radius: 6px;
		background: var(--surface);
		display: flex;
		flex-direction: column;
	}
	.model-row {
		display: flex;
		align-items: center;
		gap: 9px;
		padding: 7px 10px;
		border-bottom: 1px solid var(--border);
		cursor: pointer;
		transition: background 0.12s ease;
		user-select: none;
	}
	.model-row:last-child {
		border-bottom: none;
	}
	.model-row:hover {
		background: var(--surface-hover);
	}
	.model-row.unchecked {
		opacity: 0.55;
	}
	.model-row-checkbox {
		width: 15px;
		height: 15px;
		min-height: 15px;
		margin: 0;
		cursor: pointer;
		flex-shrink: 0;
		accent-color: var(--accent-bg);
	}
	.model-row-content {
		flex: 1;
		min-width: 0;
		display: flex;
		flex-direction: column;
		gap: 1px;
	}
	.model-row-main {
		display: flex;
		align-items: center;
		gap: 6px;
		flex-wrap: wrap;
	}
	.model-row-id {
		font-size: var(--text-xs);
		color: var(--text-strong);
		word-break: break-all;
	}
	.model-row-name {
		font-size: 11px;
		color: var(--text-dim);
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
	}
	.model-badge-free {
		font-size: 10px;
		font-weight: 600;
		text-transform: uppercase;
		letter-spacing: 0.03em;
		padding: 1px 5px;
		border-radius: 4px;
		color: var(--status-ok-text);
		background: color-mix(in srgb, var(--status-ok-dot) 15%, transparent);
		border: 1px solid color-mix(in srgb, var(--status-ok-dot) 30%, transparent);
		line-height: 1.2;
	}
	.model-badge-meta {
		font-size: 10px;
		padding: 1px 5px;
		border-radius: 4px;
		color: var(--text-dim);
		background: var(--surface-2);
		border: 1px solid var(--border);
		line-height: 1.2;
	}
	.model-remove-btn {
		background: transparent;
		border: none;
		color: var(--text-dim);
		cursor: pointer;
		padding: 4px;
		border-radius: 4px;
		opacity: 0;
		transition:
			opacity 0.15s ease,
			color 0.15s ease;
		display: flex;
		align-items: center;
	}
	.model-row:hover .model-remove-btn {
		opacity: 0.8;
	}
	.model-remove-btn:hover {
		opacity: 1;
		color: var(--danger-text);
	}
	.models-empty-state {
		border: 1px dashed var(--border);
		border-radius: 6px;
		padding: 18px 14px;
		text-align: center;
		background: var(--surface-2);
	}
	.models-empty-state p {
		margin: 0;
		font-size: var(--text-xs);
		color: var(--text-muted);
		line-height: 1.5;
	}
	.models-empty-filter {
		padding: 16px;
		text-align: center;
		font-size: var(--text-xs);
		color: var(--text-dim);
	}
	.model-add-row {
		display: flex;
		align-items: center;
		gap: 6px;
		margin-top: 2px;
	}
	.model-add-row input {
		flex: 1;
		min-height: 34px;
		padding: 6px 10px;
		font-size: var(--text-xs);
		margin: 0;
	}
	.add-model-btn {
		min-height: 34px;
		padding: 6px 12px;
		font-size: var(--text-xs);
		flex-shrink: 0;
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
