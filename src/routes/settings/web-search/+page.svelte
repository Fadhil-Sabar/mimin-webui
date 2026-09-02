<script lang="ts">
	import { onMount } from 'svelte';
	import { resolve } from '$app/paths';
	import {
		Check,
		ExternalLink,
		Eye,
		EyeOff,
		FolderKanban,
		Globe,
		Loader2,
		LogOut,
		MessageSquare,
		PanelLeft,
		Play,
		Plus,
		RotateCcw,
		Search,
		Settings,
		Sparkles,
		User
	} from '@lucide/svelte';
	import ThemeToggle from '$lib/components/ThemeToggle.svelte';
	import { authClient } from '$lib/client/auth';
	import { sidebar } from '$lib/client/sidebar.svelte';

	type SearchProviderType = 'tavily' | 'searxng' | 'duckduckgo' | 'custom';

	type WebSearchSettingsState = {
		apiKey: string | null;
		searchUrl: string | null;
		provider: SearchProviderType;
		fromUser: boolean;
		configured: boolean;
		envConfigured: boolean;
	};

	type TestResult = {
		answer: string | null;
		sources: Array<{ title: string; url: string; snippet: string }>;
	};

	let user = $state<{ name: string; role?: string | null } | null>(null);
	let loading = $state(true);
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
		envConfigured: false
	});

	// Form draft fields
	let draftProvider = $state<SearchProviderType>('tavily');
	let draftApiKey = $state('');
	let draftSearchUrl = $state('');

	// Test fields
	let testQuery = $state('latest tech news');
	let testResult = $state<TestResult | null>(null);
	let testError = $state<string | null>(null);

	function notify(text: string) {
		notification = text;
		setTimeout(() => {
			if (notification === text) notification = null;
		}, 4000);
	}

	async function loadUser() {
		try {
			const session = await authClient.getSession();
			user = session?.data?.user ?? null;
		} catch {
			user = null;
		}
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
			const payload: {
				provider: SearchProviderType;
				apiKey?: string | null;
				searchUrl?: string | null;
			} = {
				provider: draftProvider,
				searchUrl: draftSearchUrl.trim() || null
			};

			if (draftApiKey.trim()) {
				payload.apiKey = draftApiKey.trim();
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
			notify('Web search settings saved successfully');
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
		loadUser();
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
			<a class="nav-item active" href={resolve('/settings/web-search')}
				><Globe size={16} /> Web Search</a
			>
		</div>
		<div class="sidebar-bottom">
			<div class="user-row">
				<span class="avatar">{user?.name?.[0]?.toUpperCase() ?? 'F'}</span>
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
				<ThemeToggle /><span class="avatar avatar-top">{user?.name?.[0]?.toUpperCase() ?? 'F'}</span
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
				<div class="notification-toast" role="alert">
					{notification}
				</div>
			{/if}

			{#if loading}
				<div class="empty-state" role="status">Loading search configuration...</div>
			{:else}
				<!-- Status Overview Card -->
				<div class="status-card">
					<div class="status-icon"><Globe size={22} /></div>
					<div class="status-content">
						<div class="status-title-row">
							<strong>Active Search Provider</strong>
							{#if currentSettings.fromUser}
								<span class="badge ok">User Key Active</span>
							{:else if currentSettings.envConfigured}
								<span class="badge ok">Server Env Active</span>
							{:else}
								<span class="badge">DuckDuckGo Fallback</span>
							{/if}
						</div>
						<div class="status-details">
							<span>Engine: <b class="capitalize">{currentSettings.provider}</b></span>
							<span>•</span>
							{#if currentSettings.fromUser}
								<span
									>Key: <code class="mono-badge">{currentSettings.apiKey}</code> (encrypted)</span
								>
							{:else if currentSettings.envConfigured}
								<span>Key: <code class="mono-badge">WEB_SEARCH_API_KEY</code> (server)</span>
							{:else}
								<span>No API key set (public fallback)</span>
							{/if}
							{#if currentSettings.searchUrl}
								<span>•</span>
								<span class="url-badge" title={currentSettings.searchUrl}
									>URL: {currentSettings.searchUrl}</span
								>
							{/if}
						</div>
					</div>
				</div>

				<!-- Settings Form -->
				<form
					class="settings-form"
					onsubmit={(e) => {
						e.preventDefault();
						saveSettings();
					}}
				>
					<div class="form-section">
						<h2 class="section-title">Search Engine Provider</h2>
						<p class="section-desc">Select the search backend used by the web search agent tool.</p>

						<div class="provider-grid">
							<!-- Tavily -->
							<label class="provider-option" class:selected={draftProvider === 'tavily'}>
								<input type="radio" name="provider" value="tavily" bind:group={draftProvider} />
								<div class="option-body">
									<div class="option-header">
										<strong>Tavily Search</strong>
										<span class="badge-mini">Recommended</span>
									</div>
									<p>AI-optimized search depth, source extracts, and direct answers.</p>
								</div>
							</label>

							<!-- SearXNG -->
							<label class="provider-option" class:selected={draftProvider === 'searxng'}>
								<input type="radio" name="provider" value="searxng" bind:group={draftProvider} />
								<div class="option-body">
									<div class="option-header">
										<strong>SearXNG</strong>
										<span class="badge-mini">Self-hosted</span>
									</div>
									<p>Privacy-respecting metasearch engine via JSON endpoint.</p>
								</div>
							</label>

							<!-- DuckDuckGo -->
							<label class="provider-option" class:selected={draftProvider === 'duckduckgo'}>
								<input type="radio" name="provider" value="duckduckgo" bind:group={draftProvider} />
								<div class="option-body">
									<div class="option-header">
										<strong>DuckDuckGo</strong>
										<span class="badge-mini">Free</span>
									</div>
									<p>Public web search scraping without needing any API key.</p>
								</div>
							</label>

							<!-- Custom -->
							<label class="provider-option" class:selected={draftProvider === 'custom'}>
								<input type="radio" name="provider" value="custom" bind:group={draftProvider} />
								<div class="option-body">
									<div class="option-header">
										<strong>Custom URL / API</strong>
									</div>
									<p>Custom search proxy, REST JSON endpoint, or template URL.</p>
								</div>
							</label>
						</div>
					</div>

					<!-- API Key Field -->
					<div class="form-section">
						<label for="search-api-key" class="field-label">
							<span>Search API Key</span>
							{#if draftProvider === 'duckduckgo'}
								<span class="field-hint optional">(Optional for DuckDuckGo)</span>
							{:else}
								<span class="field-hint">(Tavily API key or custom bearer token)</span>
							{/if}
						</label>

						<div class="input-with-button">
							<input
								id="search-api-key"
								type={showApiKey ? 'text' : 'password'}
								bind:value={draftApiKey}
								placeholder={currentSettings.fromUser
									? `Configured (${currentSettings.apiKey}) - enter new key to replace`
									: 'tvly-... or leave blank to use server default'}
								autocomplete="off"
								spellcheck="false"
							/>
							<button
								type="button"
								class="toggle-eye-btn"
								onclick={() => (showApiKey = !showApiKey)}
								title={showApiKey ? 'Hide key' : 'Show key'}
								aria-label={showApiKey ? 'Hide key' : 'Show key'}
							>
								{#if showApiKey}<EyeOff size={16} />{:else}<Eye size={16} />{/if}
							</button>
						</div>
						<p class="field-help">
							Stored securely with AES-256-GCM encryption. If left blank, Mimin falls back to the
							server environment's <code class="mono">WEB_SEARCH_API_KEY</code>.
						</p>
					</div>

					<!-- Custom Search URL Field -->
					<div class="form-section">
						<label for="search-url" class="field-label">
							<span>Custom Search Endpoint / URL</span>
							<span class="field-hint optional">(Optional)</span>
						</label>
						<input
							id="search-url"
							type="text"
							bind:value={draftSearchUrl}
							placeholder={draftProvider === 'searxng'
								? 'https://searxng.example.com/search'
								: 'https://api.tavily.com/search or custom proxy URL'}
							autocomplete="off"
						/>
						<p class="field-help">
							Override the default search endpoint URL. Supports custom Tavily proxies, SearXNG
							endpoints, or GET URLs with <code class="mono">&#123;query&#125;</code>.
						</p>
					</div>

					<!-- Action Buttons -->
					<div class="form-actions">
						<button type="submit" class="button primary" disabled={saving}>
							{#if saving}
								<Loader2 size={16} class="spin" /> Saving...
							{:else}
								<Check size={16} /> Save settings
							{/if}
						</button>

						{#if currentSettings.fromUser || currentSettings.searchUrl || currentSettings.provider !== 'tavily'}
							<button type="button" class="button danger" onclick={resetSettings} disabled={saving}>
								<RotateCcw size={15} /> Reset to default
							</button>
						{/if}
					</div>
				</form>

				<!-- Live Search Test Box -->
				<div class="test-card">
					<div class="test-header">
						<div>
							<h3>Test Search Configuration</h3>
							<p>
								Run a live test query with your current draft settings to verify connectivity and
								search responses.
							</p>
						</div>
					</div>

					<div class="test-input-row">
						<div class="search-input-wrapper">
							<Search size={16} class="search-icon" />
							<input
								type="text"
								bind:value={testQuery}
								placeholder="Enter a test query..."
								onkeydown={(e) => e.key === 'Enter' && runTestSearch()}
							/>
						</div>
						<button
							type="button"
							class="button primary test-run-btn"
							onclick={runTestSearch}
							disabled={testing}
						>
							{#if testing}
								<Loader2 size={15} class="spin" /> Testing...
							{:else}
								<Play size={15} /> Run test
							{/if}
						</button>
					</div>

					{#if testError}
						<div class="test-error-box">
							<strong>Search Test Failed:</strong>
							{testError}
						</div>
					{/if}

					{#if testResult}
						<div class="test-result-box">
							{#if testResult.answer}
								<div class="answer-box">
									<span class="answer-label">Direct Synthesized Answer:</span>
									<p>{testResult.answer}</p>
								</div>
							{/if}

							<div class="sources-box">
								<span class="sources-label">Sources Retrieved ({testResult.sources.length}):</span>
								{#if testResult.sources.length === 0}
									<p class="no-sources">No sources found for this query.</p>
								{:else}
									<ul class="sources-list">
										{#each testResult.sources as source, i (source.url + i)}
											<li class="source-item">
												<div class="source-header">
													<span class="source-num">[{i + 1}]</span>
													<!-- eslint-disable svelte/no-navigation-without-resolve -->
													<a
														href={source.url}
														target="_blank"
														rel="noopener noreferrer"
														class="source-link"
													>
														{source.title}
														<ExternalLink size={12} />
													</a>
													<!-- eslint-enable svelte/no-navigation-without-resolve -->
												</div>
												<span class="source-url-text">{source.url}</span>
												{#if source.snippet}
													<p class="source-snippet">{source.snippet}</p>
												{/if}
											</li>
										{/each}
									</ul>
								{/if}
							</div>
						</div>
					{/if}
				</div>
			{/if}
		</div>
	</main>
</div>

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

	.notification-toast {
		padding: 10px 14px;
		margin-bottom: 20px;
		background: var(--surface-2);
		border: 1px solid var(--border-strong);
		border-radius: 8px;
		font-size: var(--text-sm);
		color: var(--text-strong);
	}

	.status-card {
		display: flex;
		align-items: center;
		gap: 16px;
		padding: 16px 20px;
		background: var(--surface);
		border: 1px solid var(--border);
		border-radius: 10px;
		margin-bottom: 28px;
	}
	.status-icon {
		display: grid;
		place-items: center;
		width: 44px;
		height: 44px;
		flex: 0 0 44px;
		color: var(--text-muted);
		background: var(--surface-2);
		border: 1px solid var(--border);
		border-radius: 10px;
	}
	.status-content {
		flex: 1;
		min-width: 0;
	}
	.status-title-row {
		display: flex;
		align-items: center;
		gap: 10px;
		margin-bottom: 4px;
	}
	.status-title-row strong {
		font-size: var(--text-base);
		font-weight: 600;
		color: var(--text-strong);
	}
	.status-details {
		display: flex;
		align-items: center;
		flex-wrap: wrap;
		gap: 8px;
		color: var(--text-muted);
		font-size: var(--text-xs);
	}
	.mono-badge {
		font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
		background: var(--surface-2);
		padding: 2px 6px;
		border-radius: 4px;
		border: 1px solid var(--border);
		color: var(--text-strong);
	}
	.url-badge {
		max-width: 250px;
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
		color: var(--text-dim);
	}
	.capitalize {
		text-transform: capitalize;
	}

	.settings-form {
		background: var(--surface);
		border: 1px solid var(--border);
		border-radius: 10px;
		padding: 24px;
		margin-bottom: 32px;
		display: flex;
		flex-direction: column;
		gap: 24px;
	}
	.form-section {
		display: flex;
		flex-direction: column;
	}
	.section-title {
		font-size: var(--text-base);
		font-weight: 600;
		color: var(--text-strong);
		margin: 0 0 4px;
	}
	.section-desc {
		color: var(--text-muted);
		font-size: var(--text-sm);
		margin: 0 0 14px;
	}

	.provider-grid {
		display: grid;
		grid-template-columns: repeat(auto-fit, minmax(240px, 1fr));
		gap: 12px;
	}
	.provider-option {
		display: flex;
		align-items: flex-start;
		gap: 12px;
		padding: 14px 16px;
		background: var(--surface-subtle);
		border: 1px solid var(--border);
		border-radius: 8px;
		cursor: pointer;
		transition: 0.15s ease;
	}
	.provider-option:hover {
		border-color: var(--border-strong);
		background: var(--surface-hover);
	}
	.provider-option.selected {
		border-color: var(--text-strong);
		background: var(--surface-2);
	}
	.provider-option input[type='radio'] {
		margin-top: 3px;
		cursor: pointer;
	}
	.option-body {
		flex: 1;
	}
	.option-header {
		display: flex;
		align-items: center;
		justify-content: space-between;
		margin-bottom: 4px;
	}
	.option-header strong {
		font-size: var(--text-sm);
		font-weight: 600;
		color: var(--text-strong);
	}
	.option-body p {
		margin: 0;
		font-size: var(--text-xs);
		color: var(--text-muted);
		line-height: 1.4;
	}
	.badge-mini {
		font-size: 10px;
		padding: 1px 6px;
		border-radius: 4px;
		background: var(--surface-3);
		border: 1px solid var(--border);
		color: var(--text-dim);
		font-weight: 500;
	}

	.field-label {
		display: flex;
		align-items: center;
		gap: 8px;
		font-size: var(--text-sm);
		font-weight: 500;
		color: var(--text-strong);
		margin-bottom: 8px;
	}
	.field-hint {
		font-size: var(--text-xs);
		color: var(--text-muted);
		font-weight: 400;
	}
	.field-hint.optional {
		color: var(--text-faint);
	}
	.field-help {
		font-size: var(--text-xs);
		color: var(--text-dim);
		margin: 6px 0 0;
		line-height: 1.4;
	}

	.input-with-button {
		position: relative;
		display: flex;
		align-items: center;
	}
	.input-with-button input {
		width: 100%;
		padding-right: 40px;
	}
	.toggle-eye-btn {
		position: absolute;
		right: 10px;
		background: transparent;
		border: 0;
		color: var(--text-muted);
		display: grid;
		place-items: center;
		padding: 4px;
		border-radius: 4px;
	}
	.toggle-eye-btn:hover {
		color: var(--text-strong);
	}

	input[type='text'],
	input[type='password'] {
		width: 100%;
		min-height: 40px;
		padding: 8px 12px;
		background: var(--surface);
		border: 1px solid var(--input-border);
		border-radius: 6px;
		color: var(--text-strong);
		font-size: var(--text-sm);
		outline: none;
		transition: border-color 0.15s ease;
	}
	input[type='text']:focus,
	input[type='password']:focus {
		border-color: var(--focus);
	}

	.form-actions {
		display: flex;
		align-items: center;
		gap: 12px;
		padding-top: 12px;
		border-top: 1px solid var(--border);
	}

	/* Test Box Styles */
	.test-card {
		background: var(--surface);
		border: 1px solid var(--border);
		border-radius: 10px;
		padding: 24px;
	}
	.test-header h3 {
		margin: 0 0 4px;
		font-size: var(--text-base);
		font-weight: 600;
		color: var(--text-strong);
	}
	.test-header p {
		margin: 0 0 16px;
		color: var(--text-muted);
		font-size: var(--text-sm);
	}
	.test-input-row {
		display: flex;
		gap: 10px;
		align-items: center;
	}
	.search-input-wrapper {
		position: relative;
		flex: 1;
		display: flex;
		align-items: center;
	}
	:global(.search-icon) {
		position: absolute;
		left: 12px;
		color: var(--text-dim);
		pointer-events: none;
	}
	.search-input-wrapper input {
		padding-left: 36px;
	}
	.test-run-btn {
		flex: 0 0 auto;
	}

	.test-error-box {
		margin-top: 16px;
		padding: 12px 16px;
		background: color-mix(in srgb, var(--danger-bg) 10%, transparent);
		border: 1px solid color-mix(in srgb, var(--danger-bg) 40%, transparent);
		border-radius: 8px;
		color: var(--danger-text);
		font-size: var(--text-sm);
	}

	.test-result-box {
		margin-top: 20px;
		border-top: 1px solid var(--border);
		padding-top: 18px;
		display: flex;
		flex-direction: column;
		gap: 16px;
	}
	.answer-box {
		background: var(--surface-2);
		border: 1px solid var(--border);
		border-radius: 8px;
		padding: 14px 16px;
	}
	.answer-label {
		display: block;
		font-size: var(--text-xs);
		font-weight: 600;
		color: var(--text-muted);
		margin-bottom: 6px;
		text-transform: uppercase;
		letter-spacing: 0.05em;
	}
	.answer-box p {
		margin: 0;
		font-size: var(--text-sm);
		color: var(--text-strong);
		line-height: 1.5;
	}

	.sources-label {
		display: block;
		font-size: var(--text-xs);
		font-weight: 600;
		color: var(--text-muted);
		margin-bottom: 10px;
		text-transform: uppercase;
		letter-spacing: 0.05em;
	}
	.sources-list {
		list-style: none;
		padding: 0;
		margin: 0;
		display: flex;
		flex-direction: column;
		gap: 12px;
	}
	.source-item {
		padding: 12px 14px;
		background: var(--surface-subtle);
		border: 1px solid var(--border);
		border-radius: 8px;
	}
	.source-header {
		display: flex;
		align-items: center;
		gap: 8px;
	}
	.source-num {
		font-size: var(--text-xs);
		color: var(--text-dim);
		font-weight: 600;
	}
	.source-link {
		font-size: var(--text-sm);
		font-weight: 600;
		color: var(--text-strong);
		text-decoration: none;
		display: inline-flex;
		align-items: center;
		gap: 4px;
	}
	.source-link:hover {
		text-decoration: underline;
		color: var(--focus);
	}
	.source-url-text {
		display: block;
		font-size: var(--text-xs);
		color: var(--text-dim);
		font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
		margin: 2px 0 6px;
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
	}
	.source-snippet {
		margin: 0;
		font-size: var(--text-xs);
		color: var(--text-body);
		line-height: 1.45;
	}
	.no-sources {
		color: var(--text-dim);
		font-size: var(--text-sm);
		margin: 0;
	}

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
