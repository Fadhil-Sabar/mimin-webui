<script lang="ts">
	import { onMount } from 'svelte';
	import { resolve } from '$app/paths';
	import { ChevronDown, ChevronRight, Download } from '@lucide/svelte';
	import { Badge } from '$lib/components/ui/badge/index.js';
	import { Switch } from '$lib/components/ui/switch/index.js';
	import {
		getBrowserBridgeStatus,
		isBrowserBridgeEnabled,
		setBrowserBridgeEnabled
	} from '$lib/client/browser-bridge';

	type Props = {
		ondone?: () => void;
	};

	let { ondone }: Props = $props();

	let enabled = $state(false);
	let hydrated = $state(false);
	let connected = $state(false);
	let updateRequired = $state(false);
	let installedVersion = $state<string | undefined>(undefined);
	let requiredVersion = $state<string>('0.4.2');
	let checking = $state(false);
	let permissions = $state<{ google?: boolean; publicWebsites?: boolean } | undefined>(undefined);
	let pageOrigin = $state('');

	let activeStepBrowser = $state<'chrome' | 'firefox'>('chrome');
	let installStepsOpen = $state(true);
	let permissionsOpen = $state(false);
	let troubleshootingOpen = $state(false);

	let downloadOrigin = $derived(pageOrigin);
	let chromeDownload = $derived(
		`${resolve('/')}api/browser/extension/chrome?origin=${encodeURIComponent(downloadOrigin)}`
	);
	let firefoxDownload = $derived(
		`${resolve('/')}api/browser/extension/firefox?origin=${encodeURIComponent(downloadOrigin)}`
	);

	onMount(() => {
		enabled = isBrowserBridgeEnabled();
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
			// Browser storage unavailable
		}
	}

	async function checkConnection() {
		checking = true;
		const result = await getBrowserBridgeStatus();
		connected = enabled && result.connected;
		updateRequired = Boolean(enabled && result.updateRequired);
		installedVersion = result.version;
		requiredVersion = result.requiredVersion;
		permissions = result.permissions;
		checking = false;
	}
</script>

<div class="tab-pane">
	<div class="view-header">
		<h1 class="view-title">Browser bridge</h1>
		<p class="view-subtitle">Connect Mimin to this browser.</p>
	</div>

	<div class="bridge-content">
		<!-- Enable card -->
		<div class="enable-card">
			<div class="enable-info">
				<strong class="enable-title">Enable browser tools</strong>
				<p class="enable-desc">Open tabs and read public pages from chat.</p>
			</div>
			<Switch
				checked={enabled}
				disabled={!hydrated || checking}
				onCheckedChange={(v) => setEnabled(v)}
			/>
		</div>

		<!-- Status row -->
		<div class="status-card">
			<div class="status-top-row">
				<div class="status-dot-group">
					<span class="status-dot" class:connected class:warning={updateRequired}></span>
					<span class="status-text">
						{checking
							? 'Checking…'
							: connected
								? 'Connected'
								: updateRequired
									? 'Update required'
									: enabled
										? 'Not connected'
										: 'Disabled'}
					</span>
					<div class="hidden-accessibility-badge">
						<Badge variant={connected ? 'success' : updateRequired ? 'warning' : 'default'}>
							{connected ? 'Connected' : updateRequired ? 'Update required' : 'Not connected'}
						</Badge>
					</div>
				</div>
				<button type="button" class="check-btn" onclick={checkConnection} disabled={checking}>
					{checking ? 'Checking…' : 'Check connection'}
				</button>
			</div>
			<div class="status-bottom-row">
				<span>Installed: {installedVersion ?? 'Not detected'}</span>
				<span>·</span>
				<span>Required: {requiredVersion}</span>
			</div>
		</div>

		<!-- Install the extension section -->
		<div class="install-section">
			<h2 class="section-title">Install the extension</h2>

			<div class="download-grid">
				<div class="download-card">
					<strong class="package-name">Chrome & Chromium</strong>
					<p class="package-desc">Chrome, Edge, Brave, Arc and Opera</p>
					<!-- eslint-disable-next-line svelte/no-navigation-without-resolve -->
					<a href={chromeDownload} download rel="external" class="download-action-btn">
						<Download size={14} />
						<span>Download package</span>
					</a>
				</div>

				<div class="download-card">
					<strong class="package-name">Firefox</strong>
					<p class="package-desc">Temporary local add-on</p>
					<!-- eslint-disable-next-line svelte/no-navigation-without-resolve -->
					<a href={firefoxDownload} download rel="external" class="download-action-btn">
						<Download size={14} />
						<span>Download package</span>
					</a>
				</div>
			</div>
		</div>

		<!-- Accordions -->
		<div class="disclosures-container">
			<!-- Installation steps -->
			<div class="accordion-item">
				<button
					type="button"
					class="accordion-header"
					onclick={() => (installStepsOpen = !installStepsOpen)}
					aria-expanded={installStepsOpen}
				>
					<span>Installation steps</span>
					{#if installStepsOpen}
						<ChevronDown size={15} />
					{:else}
						<ChevronRight size={15} />
					{/if}
				</button>
				{#if installStepsOpen}
					<div class="accordion-body">
						<div class="browser-step-tabs">
							<button
								type="button"
								class="tab-pill"
								class:active={activeStepBrowser === 'chrome'}
								onclick={() => (activeStepBrowser = 'chrome')}
							>
								Chrome
							</button>
							<button
								type="button"
								class="tab-pill"
								class:active={activeStepBrowser === 'firefox'}
								onclick={() => (activeStepBrowser = 'firefox')}
							>
								Firefox
							</button>
						</div>

						{#if activeStepBrowser === 'chrome'}
							<ol class="step-list">
								<li>
									<span class="step-circle">1</span>
									<span>Unzip the package.</span>
								</li>
								<li>
									<span class="step-circle">2</span>
									<span
										>Open <code class="inline-code">chrome://extensions</code> and enable Developer mode.</span
									>
								</li>
								<li>
									<span class="step-circle">3</span>
									<span>Choose Load unpacked and select the folder.</span>
								</li>
							</ol>
						{:else}
							<ol class="step-list">
								<li>
									<span class="step-circle">1</span>
									<span>Unzip the downloaded package.</span>
								</li>
								<li>
									<span class="step-circle">2</span>
									<span
										>Open <code class="inline-code">about:debugging#/runtime/this-firefox</code
										>.</span
									>
								</li>
								<li>
									<span class="step-circle">3</span>
									<span
										>Choose Load Temporary Add-on and select <code class="inline-code"
											>manifest.json</code
										>.</span
									>
								</li>
							</ol>
						{/if}
					</div>
				{/if}
			</div>

			<!-- Permissions & privacy -->
			<div class="accordion-item">
				<button
					type="button"
					class="accordion-header"
					onclick={() => (permissionsOpen = !permissionsOpen)}
					aria-expanded={permissionsOpen}
				>
					<span>Permissions & privacy</span>
					{#if permissionsOpen}
						<ChevronDown size={15} />
					{:else}
						<ChevronRight size={15} />
					{/if}
				</button>
				{#if permissionsOpen}
					<div class="accordion-body info-text">
						<p>
							<strong>Web Search</strong> is the default server-side research tool for general
							queries.
							<strong>Browser Search</strong> is only exposed when you explicitly ask to search Google
							or Google Scholar.
						</p>
						<p>
							<strong>Tab reading & interaction</strong> reads and operates open tabs upon your prompt.
							Cookies, saved passwords, and browsing history are never read.
						</p>
						{#if permissions}
							<div class="perm-status-row">
								<span>Google Scholar: {permissions.google ? 'Enabled' : 'Disabled'}</span>
								<span>·</span>
								<span>Public sites: {permissions.publicWebsites ? 'Granted' : 'Not granted'}</span>
							</div>
						{/if}
					</div>
				{/if}
			</div>

			<!-- Troubleshooting -->
			<div class="accordion-item">
				<button
					type="button"
					class="accordion-header"
					onclick={() => (troubleshootingOpen = !troubleshootingOpen)}
					aria-expanded={troubleshootingOpen}
				>
					<span>Troubleshooting</span>
					{#if troubleshootingOpen}
						<ChevronDown size={15} />
					{:else}
						<ChevronRight size={15} />
					{/if}
				</button>
				{#if troubleshootingOpen}
					<div class="accordion-body info-text">
						<p>
							A package only bridges the origin it was downloaded from. If installed for another
							address, it reports <em>Not connected</em>. Replace the folder, reload the extension,
							and refresh Mimin.
						</p>
					</div>
				{/if}
			</div>
		</div>

		<!-- Footer row -->
		<div class="tab-footer">
			<span class="footer-note">Local packages for testing and internal use.</span>
			<button type="button" class="done-btn" onclick={() => ondone?.()}> Done </button>
		</div>
	</div>
</div>

<style>
	.tab-pane {
		padding: 28px 32px 64px;
		color: #ececee;
		font-family: var(--font-body);
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
	.bridge-content {
		display: flex;
		flex-direction: column;
		gap: 14px;
		padding-bottom: 32px;
	}
	.enable-card {
		display: flex;
		align-items: center;
		justify-content: space-between;
		gap: 16px;
		padding: 14px 18px;
		background: #1d1d20;
		border: 1px solid #2c2c30;
		border-radius: 14px;
	}
	.enable-title {
		display: block;
		font-size: 14px;
		font-weight: 500;
		color: #ececee;
	}
	.enable-desc {
		margin: 2px 0 0;
		font-size: 12px;
		color: #71717a;
	}
	.status-card {
		display: flex;
		flex-direction: column;
		gap: 8px;
		padding: 12px 18px;
		background: #1d1d20;
		border: 1px solid #2c2c30;
		border-radius: 14px;
	}
	.status-top-row {
		display: flex;
		align-items: center;
		justify-content: space-between;
		gap: 12px;
	}
	.status-dot-group {
		display: flex;
		align-items: center;
		gap: 8px;
	}
	.status-dot {
		width: 7px;
		height: 7px;
		border-radius: 50%;
		background: #71717a;
	}
	.status-dot.connected {
		background: #22c55e;
	}
	.status-dot.warning {
		background: #eab308;
	}
	.status-text {
		font-size: 13px;
		color: #ececee;
		font-weight: 400;
	}
	.hidden-accessibility-badge {
		position: absolute;
		width: 1px;
		height: 1px;
		padding: 0;
		margin: -1px;
		overflow: hidden;
		clip: rect(0, 0, 0, 0);
		white-space: nowrap;
		border: 0;
	}
	.check-btn {
		height: 30px;
		padding: 0 12px;
		background: #26262b;
		border: 1px solid #34343a;
		border-radius: 8px;
		color: #ececee;
		font-size: 12px;
		font-weight: 500;
		cursor: pointer;
		transition:
			background-color var(--duration-short2) var(--ease-standard),
			border-color var(--duration-short2) var(--ease-standard);
	}
	.check-btn:hover:not(:disabled) {
		background: #2f2f35;
		border-color: #404046;
	}
	.check-btn:disabled {
		opacity: 0.5;
		cursor: not-allowed;
	}
	.status-bottom-row {
		display: flex;
		align-items: center;
		gap: 6px;
		font-size: 12px;
		color: #71717a;
	}
	.install-section {
		margin-top: 4px;
	}
	.section-title {
		margin: 0 0 10px;
		font-size: 13px;
		font-weight: 500;
		color: #ececee;
	}
	.download-grid {
		display: grid;
		grid-template-columns: 1fr 1fr;
		gap: 12px;
	}
	.download-card {
		display: flex;
		flex-direction: column;
		padding: 14px 16px;
		background: #1d1d20;
		border: 1px solid #2c2c30;
		border-radius: 14px;
	}
	.package-name {
		font-size: 13px;
		font-weight: 500;
		color: #ececee;
	}
	.package-desc {
		margin: 2px 0 14px;
		font-size: 11px;
		color: #71717a;
	}
	.download-action-btn {
		display: flex;
		align-items: center;
		justify-content: center;
		gap: 6px;
		height: 34px;
		background: #f4f4f5;
		border: 0;
		border-radius: 8px;
		color: #18181b;
		font-size: 12px;
		font-weight: 500;
		text-decoration: none;
		cursor: pointer;
		transition: background-color var(--duration-short2) var(--ease-standard);
	}
	.download-action-btn:hover {
		background: #e4e4e7;
	}
	.disclosures-container {
		display: flex;
		flex-direction: column;
		background: #1d1d20;
		border: 1px solid #2c2c30;
		border-radius: 14px;
		overflow: hidden;
	}
	.accordion-item {
		border-bottom: 1px solid #252528;
	}
	.accordion-item:last-child {
		border-bottom: none;
	}
	.accordion-header {
		display: flex;
		align-items: center;
		justify-content: space-between;
		width: 100%;
		padding: 12px 16px;
		background: transparent;
		border: 0;
		color: #ececee;
		font-size: 13px;
		font-weight: 500;
		cursor: pointer;
		transition: background-color var(--duration-short2) var(--ease-standard);
	}
	.accordion-header:hover {
		background: #222226;
	}
	.accordion-body {
		padding: 4px 16px 16px;
	}
	.browser-step-tabs {
		display: inline-flex;
		align-items: center;
		background: #242428;
		border: 1px solid #2f2f34;
		border-radius: 8px;
		padding: 2px;
		margin-bottom: 12px;
	}
	.tab-pill {
		padding: 4px 12px;
		background: transparent;
		border: 0;
		border-radius: 6px;
		color: #71717a;
		font-size: 12px;
		font-weight: 500;
		cursor: pointer;
		transition:
			background-color var(--duration-short2) var(--ease-standard),
			color var(--duration-short2) var(--ease-standard);
	}
	.tab-pill.active {
		background: #34343a;
		color: #ececee;
	}
	.step-list {
		display: flex;
		flex-direction: column;
		gap: 8px;
		margin: 0;
		padding: 0;
		list-style: none;
	}
	.step-list li {
		display: flex;
		align-items: center;
		gap: 10px;
		font-size: 12px;
		color: #a1a1aa;
	}
	.step-circle {
		display: flex;
		align-items: center;
		justify-content: center;
		width: 18px;
		height: 18px;
		border-radius: 50%;
		background: #27272b;
		border: 1px solid #34343a;
		font-size: 10px;
		font-weight: 600;
		color: #ececee;
		flex-shrink: 0;
	}
	.inline-code {
		font-family: var(--font-mono);
		background: #151517;
		padding: 1px 5px;
		border-radius: 4px;
		color: #ececee;
		border: 1px solid #2c2c30;
	}
	.info-text p {
		margin: 0 0 6px;
		font-size: 12px;
		line-height: 1.5;
		color: #a1a1aa;
	}
	.info-text p:last-child {
		margin-bottom: 0;
	}
	.perm-status-row {
		display: flex;
		align-items: center;
		gap: 8px;
		margin-top: 8px;
		font-size: 11px;
		color: #71717a;
	}
	.tab-footer {
		display: flex;
		align-items: center;
		justify-content: space-between;
		gap: 16px;
		margin-top: 6px;
		padding-top: 14px;
	}
	.footer-note {
		font-size: 12px;
		color: #71717a;
	}
	.done-btn {
		height: 36px;
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
	.done-btn:hover {
		background: #e4e4e7;
	}

	@media (max-width: 760px) {
		.tab-pane {
			padding: 16px 16px 64px;
		}
		.view-header {
			padding-right: 0;
		}
		.download-grid {
			grid-template-columns: 1fr;
		}
		.tab-footer {
			flex-direction: column-reverse;
			align-items: stretch;
		}
		.done-btn {
			width: 100%;
		}
	}
</style>
