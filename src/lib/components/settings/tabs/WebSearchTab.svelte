<script lang="ts">
	import { onMount } from 'svelte';
	import { Globe, KeyRound } from '@lucide/svelte';
	import ConnectionCard from '../web-search/ConnectionCard.svelte';
	import ConnectionEditorModal from '../web-search/ConnectionEditorModal.svelte';
	import FormActions from '../web-search/FormActions.svelte';
	import NotificationToast from '../web-search/NotificationToast.svelte';
	import ProviderSelector from '../web-search/ProviderSelector.svelte';
	import SearchTestPanel from '../web-search/SearchTestPanel.svelte';
	import StatusOverview from '../web-search/StatusOverview.svelte';
	import type {
		ConnectionField,
		EditingField,
		SearchProviderType,
		TestResult,
		WebSearchSettingsState
	} from '../web-search/types';
	import PageHeader from '$lib/components/PageHeader.svelte';

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

	onMount(() => {
		loadSettings();
	});
</script>

<div class="tab-content">
	<PageHeader
		title="Web search configuration"
		subtitle="Configure the search engine, API key, and search endpoint used when Mimin performs web research."
	/>

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

<svelte:window onkeydown={(event) => event.key === 'Escape' && (editingField = null)} />

<style>
	.tab-content {
		padding: 28px 32px 48px;
	}
	.empty-state {
		text-align: center;
		color: var(--text-dim);
		font-size: var(--text-body-md);
		line-height: var(--text-body-md--line-height);
		letter-spacing: var(--text-body-md--letter-spacing);
		padding: 40px 0;
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
	:global(.spin) {
		animation: spin 1s linear infinite;
	}
	.mono {
		font-family: var(--font-mono);
		font-size: var(--text-body-sm);
		line-height: var(--text-body-sm--line-height);
		letter-spacing: var(--text-body-sm--letter-spacing);
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
	@media (max-width: 760px) {
		.tab-content {
			padding: 20px 16px 48px;
		}
	}
</style>
