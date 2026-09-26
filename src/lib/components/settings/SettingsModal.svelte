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

	let isMobile = $state(
		typeof window !== 'undefined' ? window.matchMedia('(max-width: 760px)').matches : false
	);
	let mobileView = $state<'list' | 'detail'>('detail');
	let query = $state('');

	let modelsDirty = $state(false);
	let instructionsDirty = $state(false);
	let webSearchDirty = $state(false);
	let usersDirty = $state(false);

	let discardModels = $state<(() => void) | undefined>();
	let discardInstructions = $state<(() => void) | undefined>();
	let discardWebSearch = $state<(() => void) | undefined>();
	let discardUsers = $state<(() => void) | undefined>();

	let visibleTabs = $derived(TAB_ITEMS.filter((item) => !item.adminOnly || user?.role === 'admin'));
	let filteredTabs = $derived(
		visibleTabs.filter((item) => item.label.toLowerCase().includes(query.toLowerCase()))
	);

	function isCurrentTabDirty(): boolean {
		switch (settingsModal.activeTab) {
			case 'models':
				return modelsDirty;
			case 'instructions':
				return instructionsDirty;
			case 'web-search':
				return webSearchDirty;
			case 'users':
				return usersDirty;
			default:
				return false;
		}
	}

	function discardCurrentTab(): void {
		switch (settingsModal.activeTab) {
			case 'models':
				discardModels?.();
				modelsDirty = false;
				break;
			case 'instructions':
				discardInstructions?.();
				instructionsDirty = false;
				break;
			case 'web-search':
				discardWebSearch?.();
				webSearchDirty = false;
				break;
			case 'users':
				discardUsers?.();
				usersDirty = false;
				break;
		}
	}

	onMount(() => {
		const media = window.matchMedia('(max-width: 760px)');
		isMobile = media.matches;
		const update = (event: MediaQueryListEvent) => (isMobile = event.matches);
		media.addEventListener('change', update);
		return () => media.removeEventListener('change', update);
	});

	$effect(() => {
		if (settingsModal.open) {
			// Whenever modal opens or active tab is reopened, reset mobileView
			void settingsModal.activeTab;
			mobileView = 'detail';
		}
	});

	function close() {
		if (isCurrentTabDirty()) {
			if (!window.confirm('Discard unsaved changes?')) {
				return;
			}
			discardCurrentTab();
		}
		settingsModal.close();
		mobileView = 'detail';
	}

	function handleOpenChange(open: boolean) {
		if (!open) {
			if (isCurrentTabDirty()) {
				if (!window.confirm('Discard unsaved changes?')) {
					settingsModal.open = true;
					return;
				}
				discardCurrentTab();
			}
			settingsModal.close();
			mobileView = 'detail';
		} else {
			settingsModal.open = true;
			mobileView = 'detail';
		}
	}

	function selectTab(tab: SettingsTab) {
		if (tab !== settingsModal.activeTab) {
			if (isCurrentTabDirty()) {
				if (!window.confirm('Discard unsaved changes?')) {
					return;
				}
				discardCurrentTab();
			}
			settingsModal.setTab(tab);
		}
		mobileView = 'detail';
	}
</script>

{#snippet workspace()}
	<div class="settings-frame" class:show-detail={mobileView === 'detail'}>
		<aside class="settings-navigation">
			<div class="settings-nav-header">
				<h2>Settings</h2>
			</div>
			<label class="settings-search">
				<Search size={15} aria-hidden="true" />
				<input bind:value={query} placeholder="Search settings" aria-label="Search settings" />
			</label>
			<nav class="settings-nav-list" aria-label="Settings tabs">
				{#each filteredTabs as item (item.key)}
					<button
						type="button"
						class="settings-nav-item"
						class:active={item.key === settingsModal.activeTab}
						aria-current={item.key === settingsModal.activeTab ? 'true' : undefined}
						onclick={() => selectTab(item.key)}
					>
						<item.icon size={17} aria-hidden="true" />
						<span>{item.label}</span>
					</button>
				{/each}
			</nav>
			<div class="settings-nav-footer">
				<span>mimin</span>
			</div>
		</aside>
		<section class="settings-details" aria-label="Settings details">
			<div class="mobile-detail-header">
				<button onclick={() => (mobileView = 'list')} aria-label="Back to settings tabs">
					<ArrowLeft size={18} aria-hidden="true" />
					<span>Settings</span>
				</button>
				<button onclick={close} aria-label="Close settings" title="Close settings">
					<X size={18} aria-hidden="true" />
				</button>
			</div>
			<button
				type="button"
				class="desktop-close-button"
				onclick={close}
				aria-label="Close settings"
				title="Close settings"
			>
				<X size={18} aria-hidden="true" />
			</button>
			{#if settingsModal.activeTab === 'models'}
				<ModelsTab bind:isDirty={modelsDirty} bind:discard={discardModels} />
			{:else if settingsModal.activeTab === 'instructions'}
				<InstructionsTab bind:isDirty={instructionsDirty} bind:discard={discardInstructions} />
			{:else if settingsModal.activeTab === 'web-search'}
				<WebSearchTab bind:isDirty={webSearchDirty} bind:discard={discardWebSearch} />
			{:else if settingsModal.activeTab === 'browser-extension'}
				<BrowserExtensionTab ondone={close} />
			{:else if settingsModal.activeTab === 'preferences'}
				<PreferencesTab />
			{:else if settingsModal.activeTab === 'users' && user?.role === 'admin'}
				<UsersTab bind:isDirty={usersDirty} bind:discard={discardUsers} />
			{/if}
		</section>
	</div>
{/snippet}

{#if isMobile}
	<Sheet.Root open={settingsModal.open} onOpenChange={handleOpenChange}>
		<Sheet.Content
			side="right"
			showCloseButton={false}
			class="settings-modal-sheet h-dvh !w-screen !max-w-none gap-0 overflow-hidden border-0 p-0 data-[side=right]:!w-screen data-[side=right]:!max-w-none sm:max-w-none"
		>
			<Sheet.Title class="sr-only">Settings</Sheet.Title>
			{@render workspace()}
		</Sheet.Content>
	</Sheet.Root>
{:else}
	<Dialog.Root open={settingsModal.open} onOpenChange={handleOpenChange}>
		<Dialog.Content
			showCloseButton={false}
			class="settings-modal-dialog flex h-[calc(100dvh-40px)] max-h-[700px] w-[calc(100vw-40px)] max-w-[1040px] gap-0 overflow-hidden rounded-[20px] p-0 ring-0 sm:max-w-[1040px]"
		>
			<Dialog.Title class="sr-only">Settings</Dialog.Title>
			{@render workspace()}
		</Dialog.Content>
	</Dialog.Root>
{/if}

<style>
	:global(.settings-modal-sheet),
	:global(.settings-modal-sheet[data-side='right']) {
		width: 100vw !important;
		max-width: 100vw !important;
	}

	.settings-frame {
		display: grid;
		grid-template-columns: 236px minmax(0, 1fr);
		width: 100%;
		height: 100%;
		min-height: 0;
		font-family: var(--font-body);
		background: #161619;
		color: #ececee;
	}
	.settings-navigation {
		min-height: 0;
		display: flex;
		flex-direction: column;
		overflow-y: auto;
		padding: 24px 16px 20px;
		background: #19191c;
		border-right: 1px solid #2c2c30;
	}
	.settings-nav-header {
		margin-bottom: 16px;
		padding: 0 4px;
	}
	.settings-nav-header h2 {
		margin: 0;
		font-family: var(--font-body);
		font-size: 20px;
		line-height: 1.25;
		font-weight: 600;
		color: #ececee;
		letter-spacing: -0.01em;
	}
	.settings-search {
		display: flex;
		align-items: center;
		gap: 8px;
		padding: 0 10px;
		height: 36px;
		background: #151517;
		border: 1px solid #2c2c30;
		border-radius: 10px;
		color: #71717a;
		margin-bottom: 14px;
		transition: border-color var(--duration-short3) var(--ease-standard);
	}
	.settings-search:focus-within {
		border-color: #3f3f45;
	}
	.settings-search input {
		min-width: 0;
		width: 100%;
		border: 0;
		background: transparent;
		color: #ececee;
		font-family: var(--font-body);
		font-size: 13px;
		outline: none;
	}
	.settings-search input::placeholder {
		color: #71717a;
	}
	.settings-nav-list {
		display: flex;
		flex-direction: column;
		gap: 3px;
	}
	.settings-nav-item {
		display: flex;
		align-items: center;
		gap: 10px;
		min-height: 36px;
		padding: 6px 10px;
		border: 0;
		border-radius: 10px;
		background: transparent;
		color: #a1a1aa;
		text-align: left;
		font-family: var(--font-body);
		font-size: 13px;
		font-weight: 500;
		cursor: pointer;
		width: 100%;
		transition:
			background-color var(--duration-short2) var(--ease-standard),
			color var(--duration-short2) var(--ease-standard);
	}
	.settings-nav-item:hover {
		background: #202024;
		color: #ececee;
	}
	.settings-nav-item.active {
		background: #27272b;
		color: #ececee;
	}
	.settings-nav-footer {
		margin-top: auto;
		padding: 24px 6px 4px;
		color: #52525b;
		font-size: 14px;
		font-weight: 500;
		letter-spacing: -0.01em;
	}
	.settings-details {
		position: relative;
		min-width: 0;
		min-height: 0;
		overflow-y: auto;
		background: #161619;
	}
	.desktop-close-button {
		position: absolute;
		top: 20px;
		right: 22px;
		z-index: 20;
		display: flex;
		align-items: center;
		justify-content: center;
		width: 32px;
		height: 32px;
		border: 0;
		border-radius: 8px;
		background: transparent;
		color: #a1a1aa;
		cursor: pointer;
		transition:
			background-color var(--duration-short2) var(--ease-standard),
			color var(--duration-short2) var(--ease-standard);
	}
	.desktop-close-button:hover {
		background: #252529;
		color: #ececee;
	}
	.desktop-close-button:focus-visible {
		outline: 2px solid #52525b;
		outline-offset: 2px;
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
			min-height: 0;
			overflow-y: auto;
			-webkit-overflow-scrolling: touch;
		}
		.settings-frame.show-detail .settings-details {
			display: block;
			height: 100%;
			overflow-y: auto;
			-webkit-overflow-scrolling: touch;
		}
		.desktop-close-button {
			display: none;
		}
		.mobile-detail-header {
			display: flex;
			align-items: center;
			justify-content: space-between;
			padding: 12px 16px;
			border-bottom: 1px solid #2c2c30;
			background: #19191c;
		}
		.mobile-detail-header button {
			display: flex;
			align-items: center;
			gap: 8px;
			border: 0;
			border-radius: 8px;
			background: transparent;
			color: #ececee;
			font-size: 14px;
			font-weight: 500;
			cursor: pointer;
			padding: 6px 8px;
		}
		.mobile-detail-header button:hover {
			background: #252529;
		}
	}

	/* ---------- Modal Shell Theming ---------- */
	:global(.settings-modal-dialog) {
		background: #161619;
		border: 1px solid #2c2c30;
		color: #ececee;
		box-shadow: 0 28px 90px rgba(0, 0, 0, 0.5);
	}
	:global(:root:not([data-theme='dark']) .settings-modal-dialog),
	:global([data-theme='light'] .settings-modal-dialog) {
		background: #ffffff;
		border: 1px solid #e2e2dd;
		color: #181818;
		box-shadow: 0 20px 60px rgba(0, 0, 0, 0.12);
	}
	:global(.settings-modal-sheet) {
		background: #161619;
		color: #ececee;
	}
	:global(:root:not([data-theme='dark']) .settings-modal-sheet),
	:global([data-theme='light'] .settings-modal-sheet) {
		background: #ffffff;
		color: #181818;
	}

	/* ---------- Light Mode Overrides ---------- */
	:global(:root:not([data-theme='dark'])) .settings-frame,
	:global([data-theme='light']) .settings-frame {
		background: #ffffff;
		color: #181818;
	}
	:global(:root:not([data-theme='dark'])) .settings-navigation,
	:global([data-theme='light']) .settings-navigation {
		background: #f8f8f7;
		border-right-color: #e2e2dd;
	}
	:global(:root:not([data-theme='dark'])) .settings-nav-header h2,
	:global([data-theme='light']) .settings-nav-header h2 {
		color: #181818;
	}
	:global(:root:not([data-theme='dark'])) .settings-search,
	:global([data-theme='light']) .settings-search {
		background: #ffffff;
		border-color: #d6d6d1;
		color: #686862;
	}
	:global(:root:not([data-theme='dark'])) .settings-search input,
	:global([data-theme='light']) .settings-search input {
		color: #181818;
	}
	:global(:root:not([data-theme='dark'])) .settings-search input::placeholder,
	:global([data-theme='light']) .settings-search input::placeholder {
		color: #8c8c85;
	}
	:global(:root:not([data-theme='dark'])) .settings-nav-item,
	:global([data-theme='light']) .settings-nav-item {
		color: #686862;
	}
	:global(:root:not([data-theme='dark'])) .settings-nav-item:hover,
	:global([data-theme='light']) .settings-nav-item:hover {
		background: #eeeeeb;
		color: #181818;
	}
	:global(:root:not([data-theme='dark'])) .settings-nav-item.active,
	:global([data-theme='light']) .settings-nav-item.active {
		background: #e6e6e2;
		color: #181818;
	}
	:global(:root:not([data-theme='dark'])) .settings-nav-footer,
	:global([data-theme='light']) .settings-nav-footer {
		color: #8c8c85;
	}
	:global(:root:not([data-theme='dark'])) .desktop-close-button,
	:global([data-theme='light']) .desktop-close-button {
		color: #686862;
	}
	:global(:root:not([data-theme='dark'])) .desktop-close-button:hover,
	:global([data-theme='light']) .desktop-close-button:hover {
		background: #eeeeeb;
		color: #181818;
	}
	:global(:root:not([data-theme='dark'])) .mobile-detail-header,
	:global([data-theme='light']) .mobile-detail-header {
		background: #f8f8f7;
		border-bottom-color: #e2e2dd;
		color: #181818;
	}
	:global(:root:not([data-theme='dark'])) .mobile-detail-header button,
	:global([data-theme='light']) .mobile-detail-header button {
		color: #181818;
	}
	:global(:root:not([data-theme='dark'])) .settings-details,
	:global([data-theme='light']) .settings-details {
		background: #ffffff;
	}

	/* Common elements across tabs in light mode */
	:global(:root:not([data-theme='dark']) .tab-pane, [data-theme='light'] .tab-pane) {
		color: #181818;
	}
	:global(:root:not([data-theme='dark']) .view-title, [data-theme='light'] .view-title) {
		color: #181818;
	}
	:global(:root:not([data-theme='dark']) .view-subtitle, [data-theme='light'] .view-subtitle) {
		color: #686862;
	}
	:global(:root:not([data-theme='dark']) .section-label, [data-theme='light'] .section-label) {
		color: #71717a;
	}

	/* Cards and panels */
	:global(
		:root:not([data-theme='dark']) .provider-card,
		[data-theme='light'] .provider-card,
		:root:not([data-theme='dark']) .textarea-card,
		[data-theme='light'] .textarea-card,
		:root:not([data-theme='dark']) .enable-card,
		[data-theme='light'] .enable-card,
		:root:not([data-theme='dark']) .status-card,
		[data-theme='light'] .status-card,
		:root:not([data-theme='dark']) .download-card,
		[data-theme='light'] .download-card,
		:root:not([data-theme='dark']) .preference-row,
		[data-theme='light'] .preference-row,
		:root:not([data-theme='dark']) .provider-list-card,
		[data-theme='light'] .provider-list-card,
		:root:not([data-theme='dark']) .model-selector-container,
		[data-theme='light'] .model-selector-container,
		:root:not([data-theme='dark']) .users-table-container,
		[data-theme='light'] .users-table-container,
		:root:not([data-theme='dark']) .accordion-item,
		[data-theme='light'] .accordion-item,
		:root:not([data-theme='dark']) .provider-info-box,
		[data-theme='light'] .provider-info-box,
		:root:not([data-theme='dark']) .reset-link-card,
		[data-theme='light'] .reset-link-card
	) {
		background: #ffffff;
		border-color: #e2e2dd;
	}

	/* Card texts */
	:global(
		:root:not([data-theme='dark']) .provider-name,
		[data-theme='light'] .provider-name,
		:root:not([data-theme='dark']) .enable-title,
		[data-theme='light'] .enable-title,
		:root:not([data-theme='dark']) .package-name,
		[data-theme='light'] .package-name,
		:root:not([data-theme='dark']) .user-name,
		[data-theme='light'] .user-name,
		:root:not([data-theme='dark']) .pref-label,
		[data-theme='light'] .pref-label,
		:root:not([data-theme='dark']) .status-text,
		[data-theme='light'] .status-text,
		:root:not([data-theme='dark']) .info-box-title,
		[data-theme='light'] .info-box-title,
		:root:not([data-theme='dark']) .accordion-header,
		[data-theme='light'] .accordion-header,
		:root:not([data-theme='dark']) .editor-title,
		[data-theme='light'] .editor-title
	) {
		color: #181818;
	}

	:global(
		:root:not([data-theme='dark']) .provider-desc,
		[data-theme='light'] .provider-desc,
		:root:not([data-theme='dark']) .enable-desc,
		[data-theme='light'] .enable-desc,
		:root:not([data-theme='dark']) .package-desc,
		[data-theme='light'] .package-desc,
		:root:not([data-theme='dark']) .user-email,
		[data-theme='light'] .user-email,
		:root:not([data-theme='dark']) .pref-desc,
		[data-theme='light'] .pref-desc,
		:root:not([data-theme='dark']) .info-box-text,
		[data-theme='light'] .info-box-text,
		:root:not([data-theme='dark']) .field-hint,
		[data-theme='light'] .field-hint,
		:root:not([data-theme='dark']) .field-hint-bottom,
		[data-theme='light'] .field-hint-bottom,
		:root:not([data-theme='dark']) .editor-subtitle,
		[data-theme='light'] .editor-subtitle,
		:root:not([data-theme='dark']) .reset-link-note,
		[data-theme='light'] .reset-link-note,
		:root:not([data-theme='dark']) .footer-note,
		[data-theme='light'] .footer-note,
		:root:not([data-theme='dark']) .pref-footer-note,
		[data-theme='light'] .pref-footer-note,
		:root:not([data-theme='dark']) .users-footnote,
		[data-theme='light'] .users-footnote
	) {
		color: #686862;
	}

	/* Form inputs */
	:global(
		:root:not([data-theme='dark']) .settings-frame input[type='text'],
		[data-theme='light'] .settings-frame input[type='text'],
		:root:not([data-theme='dark']) .settings-frame input[type='password'],
		[data-theme='light'] .settings-frame input[type='password'],
		:root:not([data-theme='dark']) .settings-frame input[type='email'],
		[data-theme='light'] .settings-frame input[type='email'],
		:root:not([data-theme='dark']) .settings-frame select,
		[data-theme='light'] .settings-frame select,
		:root:not([data-theme='dark']) .settings-frame textarea,
		[data-theme='light'] .settings-frame textarea
	) {
		background: #ffffff;
		border-color: #d6d6d1;
		color: #181818;
	}

	:global(
		:root:not([data-theme='dark']) .settings-frame input::placeholder,
		[data-theme='light'] .settings-frame input::placeholder,
		:root:not([data-theme='dark']) .settings-frame textarea::placeholder,
		[data-theme='light'] .settings-frame textarea::placeholder
	) {
		color: #8c8c85;
	}

	:global(
		:root:not([data-theme='dark']) .settings-frame label,
		[data-theme='light'] .settings-frame label
	) {
		color: #181818;
	}

	/* Secondary / outline buttons */
	:global(
		:root:not([data-theme='dark']) .reset-btn,
		[data-theme='light'] .reset-btn,
		:root:not([data-theme='dark']) .cancel-btn,
		[data-theme='light'] .cancel-btn,
		:root:not([data-theme='dark']) .manage-btn,
		[data-theme='light'] .manage-btn,
		:root:not([data-theme='dark']) .connect-btn,
		[data-theme='light'] .connect-btn,
		:root:not([data-theme='dark']) .back-button,
		[data-theme='light'] .back-button,
		:root:not([data-theme='dark']) .check-btn,
		[data-theme='light'] .check-btn,
		:root:not([data-theme='dark']) .download-action-btn,
		[data-theme='light'] .download-action-btn,
		:root:not([data-theme='dark']) .toolbar-btn,
		[data-theme='light'] .toolbar-btn,
		:root:not([data-theme='dark']) .copy-btn,
		[data-theme='light'] .copy-btn,
		:root:not([data-theme='dark']) .page-btn,
		[data-theme='light'] .page-btn,
		:root:not([data-theme='dark']) .retry-btn,
		[data-theme='light'] .retry-btn
	) {
		background: #f2f2ef;
		border-color: #dcdcd6;
		color: #181818;
	}

	:global(
		:root:not([data-theme='dark']) .reset-btn:hover:not(:disabled),
		[data-theme='light'] .reset-btn:hover:not(:disabled),
		:root:not([data-theme='dark']) .cancel-btn:hover:not(:disabled),
		[data-theme='light'] .cancel-btn:hover:not(:disabled),
		:root:not([data-theme='dark']) .manage-btn:hover,
		[data-theme='light'] .manage-btn:hover,
		:root:not([data-theme='dark']) .connect-btn:hover,
		[data-theme='light'] .connect-btn:hover,
		:root:not([data-theme='dark']) .back-button:hover,
		[data-theme='light'] .back-button:hover,
		:root:not([data-theme='dark']) .check-btn:hover:not(:disabled),
		[data-theme='light'] .check-btn:hover:not(:disabled),
		:root:not([data-theme='dark']) .download-action-btn:hover,
		[data-theme='light'] .download-action-btn:hover,
		:root:not([data-theme='dark']) .toolbar-btn:hover,
		[data-theme='light'] .toolbar-btn:hover,
		:root:not([data-theme='dark']) .page-btn:hover:not(:disabled),
		[data-theme='light'] .page-btn:hover:not(:disabled),
		:root:not([data-theme='dark']) .retry-btn:hover,
		[data-theme='light'] .retry-btn:hover
	) {
		background: #e7e7e2;
		border-color: #c9c9c3;
	}

	/* Primary action buttons */
	:global(
		:root:not([data-theme='dark']) .save-btn,
		[data-theme='light'] .save-btn,
		:root:not([data-theme='dark']) .create-btn,
		[data-theme='light'] .create-btn,
		:root:not([data-theme='dark']) .create-account-btn,
		[data-theme='light'] .create-account-btn,
		:root:not([data-theme='dark']) .add-provider-btn,
		[data-theme='light'] .add-provider-btn,
		:root:not([data-theme='dark']) .done-btn,
		[data-theme='light'] .done-btn
	) {
		background: #181818;
		color: #ffffff;
	}

	:global(
		:root:not([data-theme='dark']) .save-btn:hover:not(:disabled),
		[data-theme='light'] .save-btn:hover:not(:disabled),
		:root:not([data-theme='dark']) .create-btn:hover:not(:disabled),
		[data-theme='light'] .create-btn:hover:not(:disabled),
		:root:not([data-theme='dark']) .create-account-btn:hover,
		[data-theme='light'] .create-account-btn:hover,
		:root:not([data-theme='dark']) .add-provider-btn:hover,
		[data-theme='light'] .add-provider-btn:hover,
		:root:not([data-theme='dark']) .done-btn:hover,
		[data-theme='light'] .done-btn:hover
	) {
		background: #333333;
	}

	/* Specific tab details in light mode */
	:global(:root:not([data-theme='dark']) .accordion-body, [data-theme='light'] .accordion-body) {
		background: #fafaf8;
		border-color: #e2e2dd;
		color: #444444;
	}
	:global(:root:not([data-theme='dark']) .inline-code, [data-theme='light'] .inline-code) {
		background: #eaeae6;
		color: #181818;
	}
	:global(:root:not([data-theme='dark']) .tab-pill, [data-theme='light'] .tab-pill) {
		background: #f2f2ef;
		color: #686862;
	}
	:global(:root:not([data-theme='dark']) .tab-pill.active, [data-theme='light'] .tab-pill.active) {
		background: #181818;
		color: #ffffff;
	}
	:global(
		:root:not([data-theme='dark']) .table-header-row,
		[data-theme='light'] .table-header-row
	) {
		background: #f8f8f7;
		border-bottom-color: #e2e2dd;
		color: #71717a;
	}
	:global(:root:not([data-theme='dark']) .user-row, [data-theme='light'] .user-row) {
		border-bottom-color: #f0f0ec;
	}
	:global(:root:not([data-theme='dark']) .user-row:hover, [data-theme='light'] .user-row:hover) {
		background: #f9f9f7;
	}
	:global(:root:not([data-theme='dark']) .avatar-circle, [data-theme='light'] .avatar-circle) {
		background: #e6e6e2;
		color: #181818;
	}
	:global(:root:not([data-theme='dark']) .dropdown-menu, [data-theme='light'] .dropdown-menu) {
		background: #ffffff;
		border-color: #e2e2dd;
		box-shadow: 0 10px 30px rgba(0, 0, 0, 0.12);
	}
	:global(:root:not([data-theme='dark']) .dropdown-item, [data-theme='light'] .dropdown-item) {
		color: #181818;
	}
	:global(
		:root:not([data-theme='dark']) .dropdown-item:hover,
		[data-theme='light'] .dropdown-item:hover
	) {
		background: #f2f2ef;
	}
	:global(
		:root:not([data-theme='dark']) .status-mode-indicator,
		[data-theme='light'] .status-mode-indicator
	) {
		background: #f2f2ef;
		border-color: #e2e2dd;
		color: #686862;
	}
	:global(
		:root:not([data-theme='dark']) .status-mode-indicator .active,
		[data-theme='light'] .status-mode-indicator .active
	) {
		color: #181818;
	}
	:global(
		:root:not([data-theme='dark']) .connection-status-pill,
		[data-theme='light'] .connection-status-pill
	) {
		background: #f0f0ec;
		border-color: #dcdcd6;
		color: #444444;
	}
	:global(:root:not([data-theme='dark']) .provider-row, [data-theme='light'] .provider-row) {
		border-bottom-color: #f0f0ec;
	}
	:global(
		:root:not([data-theme='dark']) .provider-row:hover,
		[data-theme='light'] .provider-row:hover
	) {
		background: #f9f9f7;
	}
	:global(
		:root:not([data-theme='dark']) .provider-row.selected,
		[data-theme='light'] .provider-row.selected
	) {
		background: #f4f4f1;
	}
	:global(:root:not([data-theme='dark']) .model-item, [data-theme='light'] .model-item) {
		border-bottom-color: #f0f0ec;
	}
	:global(
		:root:not([data-theme='dark']) .model-item:hover,
		[data-theme='light'] .model-item:hover
	) {
		background: #f9f9f7;
	}
	:global(:root:not([data-theme='dark']) .model-id, [data-theme='light'] .model-id) {
		color: #181818;
	}
	:global(:root:not([data-theme='dark']) .model-name, [data-theme='light'] .model-name) {
		color: #686862;
	}
	:global(:root:not([data-theme='dark']) .model-toolbar, [data-theme='light'] .model-toolbar) {
		border-bottom-color: #e2e2dd;
	}
	:global(
		:root:not([data-theme='dark']) .action-btn,
		[data-theme='light'] .action-btn,
		:root:not([data-theme='dark']) .input-action-btn,
		[data-theme='light'] .input-action-btn,
		:root:not([data-theme='dark']) .overflow-btn,
		[data-theme='light'] .overflow-btn
	) {
		color: #686862;
	}
	:global(
		:root:not([data-theme='dark']) .action-btn:hover,
		[data-theme='light'] .action-btn:hover,
		:root:not([data-theme='dark']) .input-action-btn:hover,
		[data-theme='light'] .input-action-btn:hover,
		:root:not([data-theme='dark']) .overflow-btn:hover,
		[data-theme='light'] .overflow-btn:hover
	) {
		background: #eeeeeb;
		color: #181818;
	}
	:global(:root:not([data-theme='dark']) .search-bar, [data-theme='light'] .search-bar) {
		background: #ffffff;
		border-color: #d6d6d1;
		color: #686862;
	}
	:global(
		:root:not([data-theme='dark']) .search-bar input,
		[data-theme='light'] .search-bar input
	) {
		color: #181818;
	}
	:global(:root:not([data-theme='dark']) .footnote-bar, [data-theme='light'] .footnote-bar) {
		color: #71717a;
	}
	:global(:root:not([data-theme='dark']) .form-actions, [data-theme='light'] .form-actions) {
		background: #ffffff;
		border-top-color: #e2e2dd;
	}
	:global(:root:not([data-theme='dark']) .textarea-footer, [data-theme='light'] .textarea-footer) {
		border-top-color: #f0f0ec;
	}
	:global(:root:not([data-theme='dark']) .char-counter, [data-theme='light'] .char-counter) {
		color: #71717a;
	}
	:global(:root:not([data-theme='dark']) .empty-state, [data-theme='light'] .empty-state) {
		color: #71717a;
	}
</style>
