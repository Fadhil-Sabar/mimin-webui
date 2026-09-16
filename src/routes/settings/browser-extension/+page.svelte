<script lang="ts">
	import { onMount } from 'svelte';
	import { resolve } from '$app/paths';
	import {
		Download,
		FileText,
		FolderKanban,
		Globe,
		LogOut,
		MessageSquare,
		MonitorUp,
		PanelLeft,
		Plus,
		Puzzle,
		Settings,
		ShieldCheck,
		Sparkles,
		User
	} from '@lucide/svelte';
	import ThemeToggle from '$lib/components/ThemeToggle.svelte';
	import { authClient } from '$lib/client/auth';
	import { sidebar } from '$lib/client/sidebar.svelte';
	import RecentChats from '$lib/components/RecentChats.svelte';
	import SidebarBackdrop from '$lib/components/SidebarBackdrop.svelte';
	import { Button } from '$lib/components/ui/button/index.js';
	import { Badge } from '$lib/components/ui/badge/index.js';
	import { Switch } from '$lib/components/ui/switch/index.js';
	import {
		getBrowserBridgeStatus,
		isBrowserBridgeEnabled,
		setBrowserBridgeEnabled
	} from '$lib/client/browser-bridge';

	let { data } = $props();
	let user = $derived(data.user);
	let enabled = $state(false);
	let hydrated = $state(false);
	let browser = $state<'firefox' | 'chromium'>('chromium');
	let connected = $state(false);
	let updateRequired = $state(false);
	let installedVersion = $state<string | undefined>(undefined);
	let requiredVersion = $state<string>('0.4.0');
	let checking = $state(false);
	let status = $state('Checking connection…');
	let permissions = $state<{ google?: boolean; publicWebsites?: boolean } | undefined>(undefined);
	let pageOrigin = $state('');

	// The package is built for the origin it is downloaded from, so it always bridges the browser
	// actually open here. `data.origin` only covers the pre-hydration markup.
	let downloadOrigin = $derived(pageOrigin || data.origin);
	let chromeDownload = $derived(
		`${resolve('/')}api/browser/extension/chrome?origin=${encodeURIComponent(downloadOrigin)}`
	);
	let firefoxDownload = $derived(
		`${resolve('/')}api/browser/extension/firefox?origin=${encodeURIComponent(downloadOrigin)}`
	);

	onMount(() => {
		enabled = isBrowserBridgeEnabled();
		browser = /firefox/i.test(navigator.userAgent) ? 'firefox' : 'chromium';
		pageOrigin = window.location.origin;
		hydrated = true;
		void checkConnection();
	});

	function setEnabled(value: boolean) {
		try {
			setBrowserBridgeEnabled(value);
			enabled = value;
			void checkConnection();
		} catch {
			status = 'Browser storage is unavailable. Allow site storage to enable the bridge.';
		}
	}

	async function checkConnection() {
		checking = true;
		const result = await getBrowserBridgeStatus();
		connected = enabled && result.connected;
		updateRequired = Boolean(enabled && result.updateRequired);
		status = result.message;
		installedVersion = result.version;
		requiredVersion = result.requiredVersion;
		permissions = result.permissions;
		checking = false;
	}

	async function logout() {
		await authClient.signOut();
		window.location.href = resolve('/login');
	}
</script>

<svelte:head>
	<title>Browser Extension · Mimin</title>
</svelte:head>

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
			<a class="nav-item" href={resolve('/settings')}><Settings size={16} /> Models</a>
			<a class="nav-item" href={resolve('/settings/instructions')}
				><FileText size={16} /> Instructions</a
			>
			<a class="nav-item" href={resolve('/skills')}><Sparkles size={16} /> Skills</a>
			<a class="nav-item" href={resolve('/settings/web-search')}><Globe size={16} /> Web Search</a>
			<a class="nav-item active" href={resolve('/settings/browser-extension')}
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
					<strong>Settings</strong><span class="crumb-sep">/</span><span>Browser Extension</span>
				</div>
			</div>
			<div class="top-actions">
				<ThemeToggle /><span class="avatar avatar-top">{user?.name?.[0]?.toUpperCase() ?? 'U'}</span
				>
			</div>
		</header>

		<div class="page-wrap">
			<div class="page-heading">
				<span class="hero-icon"><Puzzle size={23} /></span>
				<div>
					<h1>Mimin Browser Bridge</h1>
					<p>
						Let Mimin open tabs, search Google or Google Scholar, and read public web pages directly
						from your chat.
					</p>
				</div>
			</div>

			<section class="enable-card">
				<div>
					<div class="title-row">
						<strong>Enable browser tools on this device</strong>
						<Badge>Optional</Badge>
					</div>
					<p>
						When enabled and connected, Mimin can open tabs and read search results or public web
						pages back to your chat and configured AI provider to answer your request.
					</p>
				</div>
				<label class="switch-row">
					<Switch
						checked={enabled}
						disabled={!hydrated || checking}
						onCheckedChange={(v) => setEnabled(v)}
					/>
					<b>{enabled ? 'Enabled' : 'Disabled'}</b>
				</label>
			</section>
			<div class="connection-row" role="status">
				<Badge variant={connected ? 'success' : updateRequired ? 'warning' : 'default'}
					>{checking
						? 'Checking…'
						: connected
							? 'Connected'
							: updateRequired
								? 'Update required'
								: enabled
									? 'Not connected'
									: 'Disabled'}</Badge
				>
				<span>{status}</span>
				{#if enabled}<Button variant="outline" onclick={checkConnection} disabled={checking}
						>Check connection</Button
					>{/if}
			</div>

			{#if enabled}
				<div class="permissions-card">
					<div class="title-row">
						<strong>Browser Bridge</strong>
						<Badge variant={connected ? 'success' : updateRequired ? 'warning' : 'default'}>
							{connected ? 'Connected' : updateRequired ? 'Update required' : 'Not connected'}
						</Badge>
					</div>
					<div class="perm-status-list">
						<div class="perm-status-item">
							<span>Installed version</span>
							<span class="version-tag">{installedVersion ?? 'Not detected'}</span>
						</div>
						<div class="perm-status-item">
							<span>Required version</span>
							<span class="version-tag">{requiredVersion}</span>
						</div>
						{#if connected}
							<div class="perm-status-item">
								<span>Google / Scholar access</span>
								<Badge variant="success">Enabled</Badge>
							</div>
							<div class="perm-status-item">
								<span>Tab reading &amp; interaction</span>
								{#if permissions?.publicWebsites}
									<Badge variant="success">Enabled</Badge>
								{:else}
									<Badge>Not granted</Badge>
								{/if}
							</div>
						{/if}
					</div>
					{#if updateRequired}
						<p class="footnote-perm warning">
							An updated extension package is required. Download and reload version <code
								>{requiredVersion}</code
							> below to restore browser bridge functionality.
						</p>
					{:else if connected}
						<p class="footnote-perm">
							To let Mimin read and click inside your open tabs, open the Mimin Browser Bridge
							extension popup in your browser toolbar and click <strong>Grant</strong> under
							<em>Tab reading &amp; interaction</em>. Mimin still asks you in the chat the first
							time it needs your tabs.
						</p>
					{/if}
				</div>

				<div class="privacy-note">
					<ShieldCheck size={18} />
					<div>
						<strong>Search & Browser Tools</strong>
						<p>
							<strong>Web Search</strong> is the default server-side research tool for general
							queries.
							<strong>Browser Search</strong> is only exposed when you explicitly ask to search
							Google or Google Scholar.
							<strong>Browser Open</strong> opens a specific public URL in your browser and reads
							its snapshot if public website reading permission is granted.
							<strong>Browser Tabs</strong>, <strong>Browser Read Tab</strong>, and
							<strong>Browser Interact</strong> read and operate the tabs you already have open. The first
							time in a chat that Mimin needs them, it asks whether to allow access once or for that conversation.
							Cookies, saved passwords, and browsing history are never read.
						</p>
					</div>
				</div>

				<div class="package-grid">
					<article class:recommended={browser === 'chromium'}>
						<div class="card-icon"><MonitorUp size={20} /></div>
						<div class="card-title">
							<strong>Chrome-based browsers</strong>
							{#if browser === 'chromium'}<Badge variant="success">Recommended</Badge>{/if}
						</div>
						<p>Chrome, Edge, Brave, Arc, Opera, and other Chromium browsers.</p>
						<Button variant="default" class="package-download" href={chromeDownload} download>
							<Download size={15} /> Download Chrome package
						</Button>
						<ol>
							<li>Unzip the downloaded package.</li>
							<li>Open <code>chrome://extensions</code> and enable Developer mode.</li>
							<li>Choose Load unpacked, then select the unzipped folder.</li>
						</ol>
					</article>

					<article class:recommended={browser === 'firefox'}>
						<div class="card-icon"><MonitorUp size={20} /></div>
						<div class="card-title">
							<strong>Firefox</strong>
							{#if browser === 'firefox'}<Badge variant="success">Recommended</Badge>{/if}
						</div>
						<p>Firefox 109 or newer using a temporary local add-on.</p>
						<Button variant="default" class="package-download" href={firefoxDownload} download>
							<Download size={15} /> Download Firefox package
						</Button>
						<ol>
							<li>Unzip the downloaded package.</li>
							<li>Open <code>about:debugging#/runtime/this-firefox</code>.</li>
							<li>Choose Load Temporary Add-on and select <code>manifest.json</code>.</li>
						</ol>
					</article>
				</div>

				<p class="footnote">
					Already installed an earlier package? Download this one again, replace it in
					<code>chrome://extensions</code> or <code>about:debugging</code>, reload the extension,
					then reload Mimin in the same browser. A package only bridges the origin it was downloaded
					from, so an extension installed for a different address (for example
					<code>localhost</code>) reports <em>Not connected</em> here. Keep the chat open while Mimin
					works. If Google shows a CAPTCHA, complete it yourself and ask Mimin to retry.
				</p>
				<p class="footnote">
					Local packages are intended for testing and managed internal use. Publish signed builds to
					the Chrome Web Store and Firefox Add-ons before offering one-click production
					installation.
				</p>
			{/if}
		</div>
	</main>
</div>

<style>
	.page-wrap {
		max-width: 920px;
		margin: auto;
		padding: clamp(32px, 6vh, 56px) 35px 75px;
	}
	.page-heading {
		display: flex;
		gap: 15px;
		border-bottom: 1px solid var(--border);
		padding-bottom: 27px;
	}
	.hero-icon,
	.card-icon {
		display: grid;
		place-items: center;
		color: var(--text-muted);
		background: var(--surface-2);
		border: 1px solid var(--border);
	}
	.hero-icon {
		width: 44px;
		height: 44px;
		flex: 0 0 44px;
		border-radius: 11px;
	}
	h1 {
		margin: 0 0 7px;
		color: var(--text-strong);
		font-size: var(--text-2xl);
		font-weight: 600;
		letter-spacing: -0.025em;
	}
	.page-heading p,
	.enable-card p,
	article p,
	.privacy-note p,
	.footnote {
		margin: 0;
		color: var(--text-muted);
		font-size: var(--text-sm);
		line-height: 1.55;
	}
	.enable-card {
		display: flex;
		align-items: center;
		justify-content: space-between;
		gap: 24px;
		margin-top: 24px;
		padding: 18px;
		background: var(--surface);
		border: 1px solid var(--border);
		border-radius: 10px;
	}
	.permissions-card {
		margin: 16px 0;
		padding: 16px 18px;
		background: var(--surface);
		border: 1px solid var(--border);
		border-radius: 10px;
	}
	.perm-status-list {
		display: grid;
		gap: 8px;
		margin-top: 10px;
	}
	.perm-status-item {
		display: flex;
		align-items: center;
		justify-content: space-between;
		font-size: var(--text-sm);
		color: var(--text-strong);
	}
	.footnote-perm {
		margin-top: 10px;
		font-size: var(--text-xs);
		color: var(--text-muted);
	}
	.title-row,
	.card-title {
		display: flex;
		align-items: center;
		gap: 9px;
	}
	.title-row {
		margin-bottom: 5px;
	}
	.title-row strong,
	.card-title strong,
	.privacy-note strong {
		color: var(--text-strong);
		font-size: var(--text-base);
		font-weight: 600;
	}
	.footnote-perm.warning {
		color: #eab308;
	}
	.version-tag {
		font-family: var(--font-mono, monospace);
		font-size: 11px;
		color: var(--text-body);
		background: var(--surface-2);
		padding: 2px 6px;
		border-radius: 4px;
		border: 1px solid var(--border);
	}
	.switch-row {
		display: flex;
		align-items: center;
		gap: 9px;
		flex: 0 0 auto;
		color: var(--text-muted);
		font-size: var(--text-xs);
	}
	.privacy-note {
		display: flex;
		align-items: flex-start;
		gap: 11px;
		margin: 16px 0;
		padding: 14px 16px;
		color: var(--status-ok-text);
		background: color-mix(in srgb, var(--status-ok-dot) 8%, var(--surface));
		border: 1px solid color-mix(in srgb, var(--status-ok-dot) 26%, var(--border));
		border-radius: 9px;
	}
	.connection-row {
		display: flex;
		align-items: center;
		flex-wrap: wrap;
		gap: 10px;
		margin: 14px 0;
		color: var(--text-muted);
		font-size: var(--text-sm);
	}
	.privacy-note p {
		margin-top: 3px;
	}
	.package-grid {
		display: grid;
		grid-template-columns: 1fr 1fr;
		gap: 13px;
	}
	article {
		padding: 18px;
		background: var(--surface);
		border: 1px solid var(--border);
		border-radius: 10px;
	}
	article.recommended {
		border-color: var(--border-strong);
		box-shadow: 0 5px 20px var(--shadow-softer);
	}
	.card-icon {
		width: 38px;
		height: 38px;
		margin-bottom: 14px;
		border-radius: 9px;
	}
	.card-title {
		justify-content: space-between;
	}
	article > p {
		min-height: 43px;
		margin-top: 6px;
	}
	:global(.package-download) {
		width: 100%;
		margin: 16px 0 14px;
		text-decoration: none;
	}
	ol {
		margin: 0;
		padding-left: 20px;
		color: var(--text-muted);
		font-size: var(--text-xs);
		line-height: 1.65;
	}
	code {
		padding: 1px 4px;
		color: var(--text-body);
		background: var(--surface-2);
		border-radius: 4px;
		font-size: 10px;
		word-break: break-all;
	}
	.footnote {
		margin-top: 18px;
		padding-top: 16px;
		border-top: 1px solid var(--border);
	}
	@media (max-width: 720px) {
		.page-wrap {
			padding: 28px 18px 60px;
		}
		.enable-card {
			align-items: flex-start;
			flex-direction: column;
		}
		.package-grid {
			grid-template-columns: 1fr;
		}
		article > p {
			min-height: auto;
		}
	}
</style>
