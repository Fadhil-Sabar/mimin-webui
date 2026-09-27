<script lang="ts">
	import { onMount } from 'svelte';
	import { ChevronRight, Eye, EyeOff, RotateCcw } from '@lucide/svelte';
	import ProviderSelector from '../web-search/ProviderSelector.svelte';
	import SearchTestPanel from '../web-search/SearchTestPanel.svelte';
	import type { SearchProviderType, TestResult, WebSearchSettingsState } from '../web-search/types';

	type Props = {
		isDirty?: boolean;
		discard?: () => void;
	};

	// eslint-disable-next-line no-useless-assignment
	let { isDirty = $bindable(false), discard = $bindable() }: Props = $props();

	let loading = $state(true);
	let loadError = $state<string | null>(null);
	let saving = $state(false);
	let testing = $state(false);
	let showApiKey = $state(false);
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

	let draftProvider = $state<SearchProviderType>('tavily');
	let draftApiKey = $state('');
	let draftSearchUrl = $state('');

	// Test fields
	let testQuery = $state('latest tech news');
	let testResult = $state<TestResult | null>(null);
	let testError = $state<string | null>(null);

	let isCustomActive = $derived(
		Boolean(
			currentSettings.fromUser ||
			currentSettings.searchUrlFromUser ||
			currentSettings.apiKeyFromUser
		)
	);

	let dirtyState = $derived(
		draftProvider !== (currentSettings.provider ?? 'tavily') ||
			(draftProvider === 'tavily' && draftApiKey.trim() !== '') ||
			(draftProvider === 'searxng' && draftSearchUrl !== (currentSettings.searchUrl ?? '')) ||
			(draftProvider === 'custom' &&
				(draftSearchUrl !== (currentSettings.searchUrl ?? '') || draftApiKey.trim() !== ''))
	);

	let lastProvider = $state<SearchProviderType | null>(null);

	$effect(() => {
		if (lastProvider !== null && draftProvider !== lastProvider) {
			draftApiKey = '';
			if (draftProvider !== (currentSettings.provider ?? 'tavily')) {
				draftSearchUrl = '';
			} else {
				draftSearchUrl = currentSettings.searchUrl ?? '';
			}
		}
		lastProvider = draftProvider;
	});

	$effect(() => {
		isDirty = dirtyState;
	});

	$effect(() => {
		discard = () => {
			draftProvider = currentSettings.provider ?? 'tavily';
			draftSearchUrl = currentSettings.searchUrl ?? '';
			draftApiKey = '';
			lastProvider = currentSettings.provider ?? 'tavily';
		};
	});

	function notify(text: string) {
		notification = text;
		setTimeout(() => {
			if (notification === text) notification = null;
		}, 4000);
	}

	async function loadSettings() {
		loading = true;
		loadError = null;
		try {
			const res = await fetch('/api/settings/web-search');
			if (!res.ok) {
				const body = await res.json().catch(() => null);
				throw new Error(body?.error?.message ?? 'Failed to load search settings');
			}
			const data = await res.json();
			currentSettings = data.settings;
			draftProvider = currentSettings.provider ?? 'tavily';
			draftSearchUrl = currentSettings.searchUrl ?? '';
			draftApiKey = '';
			lastProvider = currentSettings.provider ?? 'tavily';
		} catch (err) {
			loadError = err instanceof Error ? err.message : 'Could not load search settings';
		} finally {
			loading = false;
		}
	}

	async function saveAllSettings() {
		saving = true;
		try {
			const providerChanged = draftProvider !== (currentSettings.provider ?? 'tavily');
			const payload: {
				provider: SearchProviderType;
				searchUrl?: string | null;
				apiKey?: string | null;
			} = {
				provider: draftProvider
			};

			if (draftProvider === 'searxng' || draftProvider === 'custom') {
				if (draftSearchUrl.trim()) {
					payload.searchUrl = draftSearchUrl.trim();
				} else if (providerChanged || currentSettings.searchUrlFromUser) {
					payload.searchUrl = null;
				}
			} else if (providerChanged || currentSettings.searchUrlFromUser) {
				payload.searchUrl = null;
			}

			if (draftProvider === 'tavily' || draftProvider === 'custom') {
				if (draftApiKey.trim()) {
					payload.apiKey = draftApiKey.trim();
				} else if (providerChanged || currentSettings.apiKeyFromUser) {
					payload.apiKey = null;
				}
			} else if (providerChanged || currentSettings.apiKeyFromUser) {
				payload.apiKey = null;
			}

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
			draftApiKey = '';
			notify('Search settings saved');
		} catch (err) {
			notify(err instanceof Error ? err.message : 'Could not save search settings');
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
			const providerChanged = draftProvider !== (currentSettings.provider ?? 'tavily');
			const payload = {
				query: testQuery.trim(),
				provider: draftProvider,
				searchUrl:
					draftProvider === 'searxng' || draftProvider === 'custom'
						? draftSearchUrl.trim() || (providerChanged ? null : undefined)
						: null,
				apiKey:
					draftProvider === 'tavily' || draftProvider === 'custom'
						? draftApiKey.trim() || (providerChanged ? null : undefined)
						: null
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

<div class="tab-pane">
	<div class="view-header">
		<h1 class="view-title">Web search</h1>
		<p class="view-subtitle">Choose how Mimin searches the web.</p>
	</div>

	{#if notification}
		<div class="notification" role="status">
			{notification}
		</div>
	{/if}

	{#if loading}
		<div class="empty-state" role="status">Loading search configuration...</div>
	{:else if loadError}
		<div class="load-error-card" role="alert">
			<div class="error-content">
				<span class="error-title">Failed to load web search settings</span>
				<p class="error-message">{loadError}</p>
			</div>
			<button type="button" class="retry-btn" onclick={loadSettings}>
				<RotateCcw size={15} />
				<span>Retry</span>
			</button>
		</div>
	{:else}
		<form
			class="search-form"
			onsubmit={(e) => {
				e.preventDefault();
				saveAllSettings();
			}}
		>
			<div class="search-scroll-area">
				<div class="status-mode-indicator">
					<span class="mode-label" class:active={!isCustomActive}>Using server defaults</span>
					<span class="status-dot"></span>
					<span class="mode-label" class:active={isCustomActive}>Custom provider</span>
				</div>

				<ProviderSelector bind:provider={draftProvider} searchUrl={draftSearchUrl} />

				{#if draftProvider === 'searxng' || draftProvider === 'custom'}
					<div class="form-field">
						<label for="search-endpoint">Search endpoint</label>
						<div class="input-with-status">
							<input
								id="search-endpoint"
								type="text"
								bind:value={draftSearchUrl}
								placeholder={draftProvider === 'searxng'
									? 'http://localhost:8080'
									: 'https://api.example.com/search'}
								autocomplete="off"
							/>
							{#if draftProvider === 'searxng'}
								<div class="connection-status-pill">
									{(currentSettings.provider === 'searxng' && currentSettings.searchUrl) ||
									currentSettings.searchUrlEnvConfigured
										? 'Connected'
										: 'Not connected'}
								</div>
							{/if}
						</div>
						<span class="field-hint">
							{draftProvider === 'searxng'
								? 'URL of your self-hosted SearXNG instance.'
								: 'Custom search API URL endpoint.'}
						</span>
					</div>
				{/if}

				{#if draftProvider === 'tavily' || draftProvider === 'custom'}
					<div class="form-field">
						<label for="search-api-key">
							{draftProvider === 'tavily' ? 'API key' : 'API key (optional)'}
						</label>
						<div class="api-key-row">
							<div class="input-with-action">
								<input
									id="search-api-key"
									type={showApiKey ? 'text' : 'password'}
									bind:value={draftApiKey}
									placeholder={currentSettings.apiKey &&
									draftProvider === (currentSettings.provider ?? 'tavily')
										? `Configured (${currentSettings.apiKey})`
										: draftProvider === 'tavily'
											? 'tvly-...'
											: 'Optional API key'}
									autocomplete="off"
								/>
								<button
									type="button"
									class="action-btn"
									onclick={() => (showApiKey = !showApiKey)}
									title={showApiKey ? 'Hide key' : 'Show key'}
									aria-label={showApiKey ? 'Hide key' : 'Show key'}
								>
									{#if showApiKey}
										<EyeOff size={16} />
									{:else}
										<Eye size={16} />
									{/if}
								</button>
							</div>
							<div class="connection-status-pill">
								{currentSettings.apiKey || currentSettings.apiKeyEnvConfigured
									? 'Connected'
									: 'Not connected'}
							</div>
						</div>
						<span class="field-hint">
							{draftProvider === 'tavily'
								? 'Requires a Tavily API key from tavily.com.'
								: 'Optional bearer key or secret for your endpoint.'}
						</span>
					</div>
				{/if}

				{#if draftProvider === 'duckduckgo'}
					<div class="provider-info-box">
						<div class="info-box-header">
							<span class="info-box-title">DuckDuckGo Search</span>
							<div class="connection-status-pill">Ready</div>
						</div>
						<p class="info-box-text">
							No configuration needed. DuckDuckGo searches work out of the box with no API key or
							endpoint required.
						</p>
					</div>
				{/if}

				<details class="test-search-details">
					<summary class="test-search-summary">
						<ChevronRight size={14} class="summary-chevron" />
						<span>Test search connection</span>
					</summary>
					<div class="test-search-body">
						<SearchTestPanel
							bind:query={testQuery}
							{testing}
							error={testError}
							result={testResult}
							ontest={runTestSearch}
						/>
					</div>
				</details>
			</div>

			<div class="form-actions">
				<button type="button" class="reset-btn" onclick={resetSettings} disabled={saving}>
					<RotateCcw size={14} />
					<span>Reset to default</span>
				</button>

				<button type="submit" class="save-btn" disabled={saving}>
					{saving ? 'Saving...' : 'Save changes'}
				</button>
			</div>
		</form>
	{/if}
</div>

<style>
	.tab-pane {
		padding: 28px 32px 0;
		color: #ececee;
		font-family: var(--font-body);
		min-height: 100%;
		display: flex;
		flex-direction: column;
	}
	.view-header {
		margin-bottom: 20px;
		padding-right: 40px;
	}
	.view-title {
		margin: 0;
		font-size: 22px;
		font-weight: 600;
		color: #ececee;
		letter-spacing: -0.01em;
	}
	.view-subtitle {
		margin: 4px 0 0;
		font-size: 13px;
		color: #a1a1aa;
	}
	.notification {
		margin-bottom: 16px;
		padding: 10px 14px;
		background: #1d271f;
		border: 1px solid #28442d;
		border-radius: 10px;
		color: #4ade80;
		font-size: 13px;
	}
	.empty-state {
		text-align: center;
		color: #71717a;
		font-size: 13px;
		padding: 48px 0;
	}
	.search-form {
		display: flex;
		flex-direction: column;
		flex: 1;
	}
	.search-scroll-area {
		display: flex;
		flex-direction: column;
		gap: 16px;
		flex: 1;
		padding-bottom: 24px;
	}
	.status-mode-indicator {
		display: flex;
		align-items: center;
		gap: 10px;
		font-size: 13px;
		color: #71717a;
		margin-bottom: 4px;
	}
	.mode-label {
		color: #71717a;
		transition: color var(--duration-short2) var(--ease-standard);
	}
	.mode-label.active {
		color: #ececee;
		font-weight: 500;
	}
	.status-dot {
		width: 7px;
		height: 7px;
		border-radius: 50%;
		background: #22c55e;
	}
	.form-field {
		display: flex;
		flex-direction: column;
		gap: 6px;
	}
	.form-field label {
		font-size: 13px;
		font-weight: 500;
		color: #a1a1aa;
	}
	.form-field input[type='text'] {
		width: 100%;
		height: 40px;
		padding: 0 12px;
		background: #151517;
		border: 1px solid #2c2c30;
		border-radius: 10px;
		color: #ececee;
		font-family: var(--font-body);
		font-size: 13px;
		outline: none;
		transition: border-color var(--duration-short2) var(--ease-standard);
	}
	.form-field input:focus {
		border-color: #3f3f45;
	}
	.form-field input::placeholder {
		color: #71717a;
	}
	.api-key-row {
		display: flex;
		align-items: center;
		gap: 10px;
	}
	.input-with-action {
		position: relative;
		flex: 1;
		display: flex;
		align-items: center;
	}
	.input-with-action input {
		width: 100%;
		height: 40px;
		padding: 0 40px 0 12px;
		background: #151517;
		border: 1px solid #2c2c30;
		border-radius: 10px;
		color: #ececee;
		font-family: var(--font-body);
		font-size: 13px;
		outline: none;
		transition: border-color var(--duration-short2) var(--ease-standard);
	}
	.input-with-action input:focus {
		border-color: #3f3f45;
	}
	.action-btn {
		position: absolute;
		right: 10px;
		display: flex;
		align-items: center;
		justify-content: center;
		width: 26px;
		height: 26px;
		background: transparent;
		border: 0;
		color: #71717a;
		cursor: pointer;
		transition: color var(--duration-short2) var(--ease-standard);
	}
	.action-btn:hover {
		color: #ececee;
	}
	.connection-status-pill {
		display: inline-flex;
		align-items: center;
		justify-content: center;
		height: 40px;
		padding: 0 14px;
		background: #242428;
		border: 1px solid #2f2f34;
		border-radius: 10px;
		color: #a1a1aa;
		font-size: 12px;
		white-space: nowrap;
	}
	.field-hint {
		font-size: 12px;
		color: #71717a;
		margin-top: 2px;
	}
	.test-search-details {
		margin-top: 4px;
	}
	.test-search-summary {
		display: flex;
		align-items: center;
		gap: 6px;
		color: #a1a1aa;
		font-size: 13px;
		cursor: pointer;
		padding: 4px 0;
		user-select: none;
	}
	.test-search-summary:hover {
		color: #ececee;
	}
	:global(.summary-chevron) {
		color: #71717a;
		transition: transform var(--duration-short2) var(--ease-standard);
	}
	.test-search-details[open] :global(.summary-chevron) {
		transform: rotate(90deg);
	}
	.test-search-body {
		margin-top: 8px;
	}
	.form-actions {
		position: sticky;
		bottom: 0;
		z-index: 10;
		display: flex;
		align-items: center;
		justify-content: space-between;
		gap: 16px;
		margin-top: auto;
		padding: 16px 0 24px;
		background: #161619;
		border-top: 1px solid #242428;
	}
	.reset-btn {
		display: inline-flex;
		align-items: center;
		gap: 6px;
		height: 38px;
		padding: 0 16px;
		background: #26262b;
		border: 1px solid #34343a;
		border-radius: 10px;
		color: #ececee;
		font-size: 13px;
		font-weight: 500;
		cursor: pointer;
		transition:
			background-color var(--duration-short2) var(--ease-standard),
			border-color var(--duration-short2) var(--ease-standard);
	}
	.reset-btn:hover:not(:disabled) {
		background: #2f2f35;
		border-color: #404046;
	}
	.reset-btn:disabled {
		opacity: 0.5;
		cursor: not-allowed;
	}
	.save-btn {
		display: inline-flex;
		align-items: center;
		height: 38px;
		padding: 0 20px;
		background: #f4f4f5;
		border: 0;
		border-radius: 10px;
		color: #18181b;
		font-size: 13px;
		font-weight: 500;
		cursor: pointer;
		transition: background-color var(--duration-short2) var(--ease-standard);
	}
	.save-btn:hover:not(:disabled) {
		background: #e4e4e7;
	}
	.save-btn:disabled {
		opacity: 0.5;
		cursor: not-allowed;
	}
	.load-error-card {
		display: flex;
		align-items: center;
		justify-content: space-between;
		gap: 16px;
		padding: 16px 20px;
		background: rgba(239, 68, 68, 0.08);
		border: 1px solid rgba(239, 68, 68, 0.25);
		border-radius: 12px;
		color: #ececee;
		margin-bottom: 20px;
	}
	.error-content {
		display: flex;
		flex-direction: column;
		gap: 4px;
	}
	.error-title {
		font-size: 14px;
		font-weight: 600;
		color: #f87171;
	}
	.error-message {
		margin: 0;
		font-size: 13px;
		color: #d4d4d8;
	}
	.retry-btn {
		display: inline-flex;
		align-items: center;
		gap: 6px;
		padding: 8px 14px;
		border-radius: 8px;
		border: 1px solid #3f3f46;
		background: #27272a;
		color: #ececee;
		font-size: 13px;
		font-weight: 500;
		cursor: pointer;
		white-space: nowrap;
		transition: background var(--duration-short2) var(--ease-standard);
	}
	.retry-btn:hover {
		background: #3f3f46;
	}
	.input-with-status {
		display: flex;
		align-items: center;
		gap: 12px;
	}
	.input-with-status input {
		flex: 1;
	}
	.provider-info-box {
		padding: 16px;
		border-radius: 12px;
		background: #1a1a1d;
		border: 1px solid #28282d;
		display: flex;
		flex-direction: column;
		gap: 8px;
	}
	.info-box-header {
		display: flex;
		align-items: center;
		justify-content: space-between;
	}
	.info-box-title {
		font-size: 14px;
		font-weight: 500;
		color: #ececee;
	}
	.info-box-text {
		margin: 0;
		font-size: 13px;
		color: #a1a1aa;
		line-height: 1.5;
	}

	@media (max-width: 760px) {
		.tab-pane {
			padding: 16px;
		}
		.view-header {
			padding-right: 0;
		}
		.api-key-row {
			flex-direction: column;
			align-items: stretch;
		}
		.form-actions {
			flex-wrap: wrap;
		}
		.save-btn {
			width: 100%;
			justify-content: center;
		}
	}
</style>
