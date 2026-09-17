<script lang="ts">
	import { onMount } from 'svelte';
	import { resolve } from '$app/paths';
	import { Download, MonitorUp, Puzzle, ShieldCheck } from '@lucide/svelte';
	import { Button } from '$lib/components/ui/button/index.js';
	import { Badge } from '$lib/components/ui/badge/index.js';
	import { Switch } from '$lib/components/ui/switch/index.js';
	import {
		getBrowserBridgeStatus,
		isBrowserBridgeEnabled,
		setBrowserBridgeEnabled
	} from '$lib/client/browser-bridge';
	import PageHeader from '$lib/components/PageHeader.svelte';

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

	let downloadOrigin = $derived(pageOrigin);
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
</script>

<div class="tab-content">
	<PageHeader
		title="Mimin Browser Bridge"
		subtitle="Let Mimin open tabs, search Google or Google Scholar, and read public web pages directly from your chat."
	>
		{#snippet icon()}<Puzzle size={23} />{/snippet}
	</PageHeader>

	<section class="enable-card">
		<div>
			<div class="title-row">
				<strong>Enable browser tools on this device</strong>
				<Badge>Optional</Badge>
			</div>
			<p>
				When enabled and connected, Mimin can open tabs and read search results or public web pages
				back to your chat and configured AI provider to answer your request.
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
					To let Mimin read and click inside your open tabs, open the Mimin Browser Bridge extension
					popup in your browser toolbar and click <strong>Grant</strong> under
					<em>Tab reading &amp; interaction</em>. Mimin still asks you in the chat the first time it
					needs your tabs.
				</p>
			{/if}
		</div>

		<div class="privacy-note">
			<ShieldCheck size={18} />
			<div>
				<strong>Search & Browser Tools</strong>
				<p>
					<strong>Web Search</strong> is the default server-side research tool for general queries.
					<strong>Browser Search</strong> is only exposed when you explicitly ask to search Google
					or Google Scholar.
					<strong>Browser Open</strong> opens a specific public URL in your browser and reads its
					snapshot if public website reading permission is granted.
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
			<code>chrome://extensions</code> or <code>about:debugging</code>, reload the extension, then
			reload Mimin in the same browser. A package only bridges the origin it was downloaded from, so
			an extension installed for a different address (for example
			<code>localhost</code>) reports <em>Not connected</em> here. Keep the chat open while Mimin works.
			If Google shows a CAPTCHA, complete it yourself and ask Mimin to retry.
		</p>
		<p class="footnote">
			Local packages are intended for testing and managed internal use. Publish signed builds to the
			Chrome Web Store and Firefox Add-ons before offering one-click production installation.
		</p>
	{/if}
</div>

<style>
	.tab-content {
		padding: 28px 32px 48px;
	}
	.card-icon {
		display: grid;
		place-items: center;
		color: var(--text-muted);
		background: var(--surface-2);
		border: 1px solid var(--border);
	}
	.enable-card p,
	article p,
	.privacy-note p,
	.footnote {
		margin: 0;
		color: var(--text-muted);
		font-size: var(--text-body-md);
		line-height: var(--text-body-md--line-height);
		letter-spacing: var(--text-body-md--letter-spacing);
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
		font-size: var(--text-body-md);
		line-height: var(--text-body-md--line-height);
		letter-spacing: var(--text-body-md--letter-spacing);
		color: var(--text-strong);
	}
	.footnote-perm {
		margin-top: 10px;
		font-size: var(--text-body-sm);
		line-height: var(--text-body-sm--line-height);
		letter-spacing: var(--text-body-sm--letter-spacing);
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
	.privacy-note > div > strong {
		color: var(--text-strong);
		font-size: var(--text-body-lg);
		line-height: var(--text-body-lg--line-height);
		letter-spacing: var(--text-body-lg--letter-spacing);
		font-weight: 500;
	}
	.privacy-note p strong {
		color: var(--text-strong);
		font-size: inherit;
		line-height: inherit;
		letter-spacing: inherit;
		font-weight: 500;
	}
	.footnote-perm.warning {
		color: #eab308;
	}
	.version-tag {
		font-family: var(--font-mono);
		font-size: var(--text-label-sm);
		line-height: var(--text-label-sm--line-height);
		letter-spacing: var(--text-label-sm--letter-spacing);
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
		font-size: var(--text-body-sm);
		line-height: var(--text-body-sm--line-height);
		letter-spacing: var(--text-body-sm--letter-spacing);
	}
	.switch-row b {
		font-weight: 500;
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
		font-size: var(--text-body-md);
		line-height: var(--text-body-md--line-height);
		letter-spacing: var(--text-body-md--letter-spacing);
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
		font-size: var(--text-body-sm);
		line-height: var(--text-body-sm--line-height);
		letter-spacing: var(--text-body-sm--letter-spacing);
	}
	code {
		font-family: var(--font-mono);
		padding: 1px 4px;
		color: var(--text-body);
		background: var(--surface-2);
		border-radius: 4px;
		font-size: var(--text-label-sm);
		line-height: var(--text-label-sm--line-height);
		letter-spacing: var(--text-label-sm--letter-spacing);
		word-break: break-all;
	}
	.footnote {
		margin-top: 18px;
		padding-top: 16px;
		border-top: 1px solid var(--border);
	}
	@media (max-width: 760px) {
		.tab-content {
			padding: 20px 16px 48px;
		}
	}
	@media (max-width: 720px) {
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
