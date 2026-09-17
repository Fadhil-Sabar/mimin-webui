<script lang="ts">
	import { onMount } from 'svelte';
	import {
		ArrowLeft,
		FileText,
		Globe,
		Puzzle,
		Search,
		Settings,
		SlidersHorizontal,
		Users,
		X
	} from '@lucide/svelte';
	import * as Dialog from '$lib/components/ui/dialog/index.js';
	import * as Sheet from '$lib/components/ui/sheet/index.js';
	import { settingsModal, type SettingsTab } from '$lib/client/settings-modal.svelte';
	import ModelsTab from './tabs/ModelsTab.svelte';
	import InstructionsTab from './tabs/InstructionsTab.svelte';
	import WebSearchTab from './tabs/WebSearchTab.svelte';
	import BrowserExtensionTab from './tabs/BrowserExtensionTab.svelte';
	import PreferencesTab from './tabs/PreferencesTab.svelte';
	import UsersTab from './tabs/UsersTab.svelte';

	type Props = {
		user?: { role?: string | null } | null;
	};

	let { user = null }: Props = $props();

	type TabItem = {
		key: SettingsTab;
		label: string;
		icon: typeof Settings;
		adminOnly?: boolean;
	};

	const TAB_ITEMS: TabItem[] = [
		{
			key: 'models',
			label: 'Models & Providers',
			icon: Settings
		},
		{
			key: 'instructions',
			label: 'Instructions',
			icon: FileText
		},
		{
			key: 'web-search',
			label: 'Web Search',
			icon: Globe
		},
		{
			key: 'browser-extension',
			label: 'Browser Extension',
			icon: Puzzle
		},
		{
			key: 'preferences',
			label: 'Preferences',
			icon: SlidersHorizontal
		},
		{
			key: 'users',
			label: 'Users',
			icon: Users,
			adminOnly: true
		}
	];

	let isMobile = $state(false);
	let mobileView = $state<'list' | 'detail'>('detail');
	let query = $state('');

	let visibleTabs = $derived(TAB_ITEMS.filter((item) => !item.adminOnly || user?.role === 'admin'));
	let filteredTabs = $derived(
		visibleTabs.filter((item) => item.label.toLowerCase().includes(query.toLowerCase()))
	);

	onMount(() => {
		const media = window.matchMedia('(max-width: 760px)');
		isMobile = media.matches;
		const update = (event: MediaQueryListEvent) => (isMobile = event.matches);
		media.addEventListener('change', update);
		return () => media.removeEventListener('change', update);
	});

	function close() {
		settingsModal.close();
	}

	function selectTab(tab: SettingsTab) {
		settingsModal.setTab(tab);
		mobileView = 'detail';
	}
</script>

{#snippet workspace()}
	<div class="settings-frame" class:show-detail={mobileView === 'detail'}>
		<aside class="settings-navigation">
			<div class="settings-nav-header">
				<button
					class="close-button"
					onclick={close}
					aria-label="Close settings"
					title="Close settings"
				>
					<X size={19} aria-hidden="true" />
				</button>
				<h2>Settings</h2>
			</div>
			<label class="settings-search">
				<Search size={17} aria-hidden="true" />
				<input bind:value={query} placeholder="Search settings" aria-label="Search settings" />
			</label>
			<nav class="settings-nav-list" aria-label="Settings tabs">
				{#each filteredTabs as item (item.key)}
					<button
						type="button"
						class="settings-nav-item state-layer"
						class:active={item.key === settingsModal.activeTab}
						aria-current={item.key === settingsModal.activeTab ? 'true' : undefined}
						onclick={() => selectTab(item.key)}
					>
						<item.icon size={19} aria-hidden="true" />
						<span>{item.label}</span>
					</button>
				{/each}
			</nav>
		</aside>
		<section class="settings-details" aria-label="Settings details">
			<div class="mobile-detail-header">
				<button onclick={() => (mobileView = 'list')} aria-label="Back to settings tabs">
					<ArrowLeft size={19} aria-hidden="true" />
					<span>Settings</span>
				</button>
				<button onclick={close} aria-label="Close settings" title="Close settings">
					<X size={19} aria-hidden="true" />
				</button>
			</div>
			{#if settingsModal.activeTab === 'models'}
				<ModelsTab />
			{:else if settingsModal.activeTab === 'instructions'}
				<InstructionsTab />
			{:else if settingsModal.activeTab === 'web-search'}
				<WebSearchTab />
			{:else if settingsModal.activeTab === 'browser-extension'}
				<BrowserExtensionTab />
			{:else if settingsModal.activeTab === 'preferences'}
				<PreferencesTab />
			{:else if settingsModal.activeTab === 'users' && user?.role === 'admin'}
				<UsersTab />
			{/if}
		</section>
	</div>
{/snippet}

{#if isMobile}
	<Sheet.Root open={settingsModal.open} onOpenChange={(next) => !next && close()}>
		<Sheet.Content
			side="right"
			showCloseButton={false}
			class="h-dvh w-screen max-w-none gap-0 overflow-hidden p-0 sm:max-w-none"
		>
			<Sheet.Title class="sr-only">Settings</Sheet.Title>
			{@render workspace()}
		</Sheet.Content>
	</Sheet.Root>
{:else}
	<Dialog.Root open={settingsModal.open} onOpenChange={(next) => !next && close()}>
		<Dialog.Content
			showCloseButton={false}
			class="flex h-[calc(100dvh-32px)] max-h-[860px] w-[calc(100vw-32px)] max-w-[1080px] gap-0 overflow-hidden p-0 sm:max-w-[1080px]"
		>
			<Dialog.Title class="sr-only">Settings</Dialog.Title>
			{@render workspace()}
		</Dialog.Content>
	</Dialog.Root>
{/if}

<style>
	.settings-frame {
		display: grid;
		grid-template-columns: 252px minmax(0, 1fr);
		width: 100%;
		height: 100%;
		min-height: 0;
		font-family: var(--font-body);
	}
	.settings-navigation {
		min-height: 0;
		overflow-y: auto;
		padding: 20px 12px;
		background: var(--surface-2);
		border-right: 1px solid var(--border);
	}
	.settings-nav-header {
		display: flex;
		align-items: center;
		gap: 12px;
		margin-bottom: 18px;
	}
	.settings-nav-header h2 {
		margin: 0;
		font-family: var(--font-body);
		font-size: var(--text-title-lg);
		line-height: var(--text-title-lg--line-height);
		letter-spacing: var(--text-title-lg--letter-spacing);
		font-weight: 500;
		color: var(--text-strong);
	}
	.close-button,
	.mobile-detail-header button {
		display: flex;
		align-items: center;
		justify-content: center;
		width: 36px;
		height: 36px;
		border: 0;
		border-radius: 8px;
		background: var(--surface-3);
		color: var(--text-strong);
		cursor: pointer;
	}
	.close-button:hover,
	.mobile-detail-header button:hover {
		background: var(--surface-hover);
	}
	.settings-search {
		display: flex;
		align-items: center;
		gap: 9px;
		padding: 0 12px;
		height: 39px;
		border: 1px solid var(--border-strong);
		border-radius: 9px;
		color: var(--text-muted);
		margin-bottom: 16px;
	}
	.settings-search input {
		min-width: 0;
		width: 100%;
		border: 0;
		outline: 0;
		background: transparent;
		color: var(--text-strong);
		font-family: var(--font-body);
		font-size: var(--text-body-md);
		line-height: var(--text-body-md--line-height);
		letter-spacing: var(--text-body-md--letter-spacing);
		font-weight: 400;
	}
	.settings-search input::placeholder {
		color: var(--text-dim);
	}
	.settings-nav-list {
		display: grid;
		gap: 3px;
	}
	.settings-nav-item {
		display: flex;
		align-items: center;
		gap: 11px;
		min-height: 39px;
		padding: 8px 11px;
		border: 0;
		border-radius: 8px;
		background: transparent;
		color: var(--text-body);
		text-align: left;
		font-family: var(--font-body);
		font-size: var(--text-body-md);
		line-height: var(--text-body-md--line-height);
		letter-spacing: var(--text-body-md--letter-spacing);
		font-weight: 500;
		cursor: pointer;
		width: 100%;
		transition:
			background-color var(--duration-short3) var(--ease-standard),
			color var(--duration-short3) var(--ease-standard);
	}
	.settings-nav-item:hover,
	.settings-nav-item.active {
		background: var(--surface-hover);
		color: var(--text-strong);
	}
	.settings-details {
		min-width: 0;
		min-height: 0;
		overflow-y: auto;
		background: var(--surface);
	}
	.mobile-detail-header {
		display: none;
	}
	@media (max-width: 760px) {
		.settings-frame {
			display: block;
		}
		.settings-navigation {
			height: 100%;
			border-right: 0;
		}
		.settings-frame.show-detail .settings-navigation {
			display: none;
		}
		.settings-details {
			display: none;
			height: 100%;
		}
		.settings-frame.show-detail .settings-details {
			display: block;
		}
		.mobile-detail-header {
			display: flex;
			align-items: center;
			justify-content: space-between;
			padding: 12px 16px;
			border-bottom: 1px solid var(--border);
		}
		.mobile-detail-header button:first-child {
			width: auto;
			gap: 8px;
			padding: 0 10px;
			font-family: var(--font-body);
			font-size: var(--text-label-lg);
			line-height: var(--text-label-lg--line-height);
			letter-spacing: var(--text-label-lg--letter-spacing);
			font-weight: 500;
		}
	}
</style>
