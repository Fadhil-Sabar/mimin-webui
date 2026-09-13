<script lang="ts">
	import { onMount } from 'svelte';
	import { resolve } from '$app/paths';
	import {
		FileText,
		FolderKanban,
		Globe,
		KeyRound,
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
	import { authClient } from '$lib/client/auth';
	import { sidebar } from '$lib/client/sidebar.svelte';
	import RecentChats from '$lib/components/RecentChats.svelte';
	import ConnectionCard from './ConnectionCard.svelte';
	import ConnectionEditorModal from './ConnectionEditorModal.svelte';
	import FormActions from './FormActions.svelte';
	import NotificationToast from './NotificationToast.svelte';
	import ProviderSelector from './ProviderSelector.svelte';
	import SearchTestPanel from './SearchTestPanel.svelte';
	import StatusOverview from './StatusOverview.svelte';
	import type {
		ConnectionField,
		EditingField,
		SearchProviderType,
		TestResult,
		WebSearchSettingsState
	} from './types';

	let { data } = $props();
	let user = $derived(data.user);
	let loading = $state(true);
	let saving = $state(false);
	let testing = $state(false);
	let showApiKey = $state(false);
	let editingField = $state<EditingField>(null);
	let notification = $state<string | null>(null);

	let currentSettings = $state<WebSearchSettingsState>({
		apiKey: null,
		searchUrl: null,
		provider: 'tavily',
		fromUser: false,
		configured: false,
		envConfigured: false,
		apiKeyFromUser: false,
		searchUrlFromUser: false,
		apiKeyEnvConfigured: false,
		searchUrlEnvConfigured: false
	});

	// Form draft fields
	let draftProvider = $state<SearchProviderType>('tavily');
	let draftApiKey = $state('');
	let draftSearchUrl = $state('');

	// Test fields
	let testQuery = $state('latest tech news');
	let testResult = $state<TestResult | null>(null);
	let testError = $state<string | null>(null);

	let showReset = $derived(
		Boolean(
			currentSettings.fromUser || currentSettings.searchUrl || currentSettings.provider !== 'tavily'
		)
	);

	function notify(text: string) {
		notification = text;
		setTimeout(() => {
			if (notification === text) notification = null;
		}, 4000);
	}

	async function loadSettings() {
		loading = true;
		try {
			const res = await fetch('/api/settings/web-search');
			if (!res.ok) throw new Error('Failed to load settings');
			const data = await res.json();
			currentSettings = data.settings;
			draftProvider = currentSettings.provider ?? 'tavily';
			draftSearchUrl = currentSettings.searchUrl ?? '';
			draftApiKey = '';
		} catch (err) {
			notify(err instanceof Error ? err.message : 'Could not load search settings');
		} finally {
			loading = false;
		}
	}

	async function saveSettings() {
		saving = true;
		try {
			const res = await fetch('/api/settings/web-search', {
				method: 'PUT',
				headers: { 'content-type': 'application/json' },
				body: JSON.stringify({ provider: draftProvider })
			});

			const data = await res.json();
			if (!res.ok) {
				throw new Error(data.error?.message ?? data.message ?? 'Failed to save settings');
			}

			currentSettings = data.settings;
			notify('Search provider saved');
		} catch (err) {
			notify(err instanceof Error ? err.message : 'Could not save search provider');
		} finally {
			saving = false;
		}
	}

	function openFieldEditor(field: ConnectionField) {
		editingField = field;
		showApiKey = false;
		if (field === 'apiKey') draftApiKey = '';
		if (field === 'searchUrl') draftSearchUrl = currentSettings.searchUrl ?? '';
	}

	async function saveField() {
		if (!editingField) return;
		const field = editingField;
		const value = field === 'apiKey' ? draftApiKey.trim() : draftSearchUrl.trim();
		if (!value) {
			notify(
				field === 'apiKey'
					? 'Enter an API key or remove the saved key'
					: 'Enter an endpoint URL or remove the saved endpoint'
			);
			return;
		}

		saving = true;
		try {
			const payload = field === 'apiKey' ? { apiKey: value } : { searchUrl: value };
			const res = await fetch('/api/settings/web-search', {
				method: 'PUT',
				headers: { 'content-type': 'application/json' },
				body: JSON.stringify(payload)
			});
			const data = await res.json();
			if (!res.ok) {
				throw new Error(data.error?.message ?? data.message ?? 'Failed to save settings');
			}
			currentSettings = data.settings;
			if (field === 'apiKey') draftApiKey = '';
			editingField = null;
			notify(field === 'apiKey' ? 'Search API key saved' : 'Search endpoint saved');
		} catch (err) {
			notify(err instanceof Error ? err.message : 'Could not save search settings');
		} finally {
			saving = false;
		}
	}

	async function removeField(field: ConnectionField) {
		const label = field === 'apiKey' ? 'API key' : 'search endpoint';
		if (!confirm(`Remove the saved ${label}?`)) return;
		saving = true;
		try {
			const payload = field === 'apiKey' ? { apiKey: null } : { searchUrl: null };
			const res = await fetch('/api/settings/web-search', {
				method: 'PUT',
				headers: { 'content-type': 'application/json' },
				body: JSON.stringify(payload)
			});
			const data = await res.json();
			if (!res.ok) {
				throw new Error(data.error?.message ?? data.message ?? 'Failed to remove setting');
			}
			currentSettings = data.settings;
			if (field === 'apiKey') draftApiKey = '';
			if (field === 'searchUrl') draftSearchUrl = '';
			editingField = null;
			notify(`${field === 'apiKey' ? 'Search API key' : 'Search endpoint'} removed`);
		} catch (err) {
			notify(err instanceof Error ? err.message : `Could not remove ${label}`);
		} finally {
			saving = false;
		}
	}

	async function resetSettings() {
		if (!confirm('Reset web search settings to server defaults?')) return;
		saving = true;
		try {
			const res = await fetch('/api/settings/web-search', { method: 'DELETE' });
			const data = await res.json();
			if (!res.ok) throw new Error(data.error?.message ?? 'Failed to reset settings');
			currentSettings = data.settings;
			draftProvider = currentSettings.provider ?? 'tavily';
			draftSearchUrl = '';
			draftApiKey = '';
			notify('Settings reset to default');
		} catch (err) {
			notify(err instanceof Error ? err.message : 'Could not reset settings');
		} finally {
			saving = false;
		}
	}

	async function runTestSearch() {
		if (!testQuery.trim()) return;
		testing = true;
		testResult = null;
		testError = null;
		try {
			const payload = {
				query: testQuery.trim(),
				provider: draftProvider,
				searchUrl: draftSearchUrl.trim() || undefined,
				apiKey: draftApiKey.trim() || undefined
			};

			const res = await fetch('/api/settings/web-search/test', {
				method: 'POST',
				headers: { 'content-type': 'application/json' },
				body: JSON.stringify(payload)
			});

			const data = await res.json();
			if (!res.ok || !data.success) {
				throw new Error(data.error ?? 'Search failed');
			}
			testResult = data.result;
		} catch (err) {
			testError = err instanceof Error ? err.message : 'Search test request failed';
		} finally {
			testing = false;
		}
	}

	async function logout() {
		await authClient.signOut();
		window.location.href = resolve('/login');
	}

	onMount(() => {
		loadSettings();
	});
</script>

<svelte:head>
	<title>Web Search Settings · Mimin</title>
</svelte:head>

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
			<a class="nav-item" href={resolve('/settings')}><Settings size={16} /> Models</a>
			<a class="nav-item" href={resolve('/settings/instructions')}
				><FileText size={16} /> Instructions</a
			>
			<a class="nav-item" href={resolve('/skills')}><Sparkles size={16} /> Skills</a>
			<a class="nav-item active" href={resolve('/settings/web-search')}
				><Globe size={16} /> Web Search</a
			>
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
					<strong>Settings</strong><span class="crumb-sep">/</span><span>Web Search</span>
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
					<h1>Web search configuration</h1>
					<p>
						Configure the search engine, API key, and search endpoint used when Mimin performs web
						research.
					</p>
				</div>
			</div>

			{#if notification}
				<NotificationToast message={notification} />
			{/if}

			{#if loading}
				<div class="empty-state" role="status">Loading search configuration...</div>
			{:else}
				<!-- Status Overview Card -->
				<StatusOverview settings={currentSettings} />

				<!-- Settings Form -->
				<form
					class="settings-form"
					onsubmit={(e) => {
						e.preventDefault();
						saveSettings();
					}}
				>
					<ProviderSelector bind:provider={draftProvider} searchUrl={draftSearchUrl} />

					<!-- Action Buttons -->
					<FormActions {saving} {showReset} onreset={resetSettings} />
				</form>

				<!-- Independent connection settings -->
				<div class="connection-list">
					<ConnectionCard
						icon={KeyRound}
						title="Search API Key"
						description="Optional for DuckDuckGo; used as a Tavily or custom bearer token."
						fromUser={currentSettings.apiKeyFromUser}
						envConfigured={currentSettings.apiKeyEnvConfigured}
						noneLabel="Not connected"
						onconnect={() => openFieldEditor('apiKey')}
					>
						{#snippet details()}
							{#if currentSettings.apiKeyFromUser}
								<span class="mono dim">{currentSettings.apiKey} · encrypted</span>
							{:else if currentSettings.apiKeyEnvConfigured}
								<span class="mono dim">Fallback: server WEB_SEARCH_API_KEY</span>
							{:else}
								<span class="mono dim">No key configured</span>
							{/if}
						{/snippet}
					</ConnectionCard>

					<ConnectionCard
						icon={Globe}
						title="Custom Search Endpoint / URL"
						description="Override the default endpoint with a Tavily proxy, SearXNG server, or URL template."
						fromUser={currentSettings.searchUrlFromUser}
						envConfigured={currentSettings.searchUrlEnvConfigured}
						noneLabel="Not configured"
						onconnect={() => openFieldEditor('searchUrl')}
					>
						{#snippet details()}
							{#if currentSettings.searchUrl}
								<span class="mono dim base-url">{currentSettings.searchUrl}</span>
							{:else}
								<span class="mono dim">Uses the provider default</span>
							{/if}
						{/snippet}
					</ConnectionCard>
				</div>

				{#if editingField}
					<ConnectionEditorModal
						field={editingField}
						settings={currentSettings}
						provider={draftProvider}
						bind:apiKeyDraft={draftApiKey}
						bind:searchUrlDraft={draftSearchUrl}
						bind:showApiKey
						{saving}
						onclose={() => (editingField = null)}
						onsave={saveField}
						onremove={removeField}
					/>
				{/if}

				<!-- Live Search Test Box -->
				<SearchTestPanel
					bind:query={testQuery}
					{testing}
					error={testError}
					result={testResult}
					ontest={runTestSearch}
				/>
			{/if}
		</div>
	</main>
</div>

<svelte:window onkeydown={(event) => event.key === 'Escape' && (editingField = null)} />

<style>
	.page-wrap {
		max-width: 860px;
		margin: auto;
		padding: clamp(32px, 6vh, 56px) 35px 75px;
	}
	.page-heading {
		border-bottom: 1px solid var(--border);
		padding-bottom: 24px;
		margin-bottom: 24px;
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

	.settings-form {
		background: var(--surface);
		border: 1px solid var(--border);
		border-radius: 10px;
		padding: 24px;
		margin-bottom: 16px;
		display: flex;
		flex-direction: column;
		gap: 24px;
	}
	.connection-list {
		display: flex;
		flex-direction: column;
		gap: 11px;
		margin-bottom: 32px;
	}

	/* Shared spinner utility: the class is applied to icons rendered by the
	   extracted child components, so it stays global to this route. */
	:global(.spin) {
		animation: spin 1s linear infinite;
	}
	@keyframes spin {
		from {
			transform: rotate(0deg);
		}
		to {
			transform: rotate(360deg);
		}
	}
</style>
