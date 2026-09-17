<script lang="ts">
	import type { Snippet } from 'svelte';
	import { onMount } from 'svelte';
	import { goto } from '$app/navigation';
	import { resolve } from '$app/paths';
	import { page } from '$app/state';
	import { ArrowLeft, Search, X } from '@lucide/svelte';
	import { activeNavKey, settingsNavItems, type NavItem } from '$lib/nav';
	import * as Dialog from '$lib/components/ui/dialog/index.js';
	import * as Sheet from '$lib/components/ui/sheet/index.js';

	let {
		user = null,
		children
	}: {
		user?: { role?: string | null } | null;
		children: Snippet;
	} = $props();

	let isMobile = $state(false);
	let mobileView = $state<'list' | 'detail'>('detail');
	let query = $state('');
	let items = $derived(settingsNavItems(user?.role === 'admin'));
	let activeKey = $derived(activeNavKey(page.url.pathname));
	let filteredItems = $derived(
		items.filter((item) => item.label.toLowerCase().includes(query.toLowerCase()))
	);
	let routeState = $derived(
		page.state as { settingsReturnTo?: string; settingsStartAtList?: boolean }
	);
	let returnTo = $derived(routeState.settingsReturnTo || '/chat');

	onMount(() => {
		const media = window.matchMedia('(max-width: 760px)');
		isMobile = media.matches;
		mobileView = routeState.settingsStartAtList ? 'list' : 'detail';
		const update = (event: MediaQueryListEvent) => (isMobile = event.matches);
		media.addEventListener('change', update);
		return () => media.removeEventListener('change', update);
	});

	function close() {
		void goto(resolve(returnTo as '/chat'), { replaceState: true });
	}

	function openSection(event: MouseEvent, item: NavItem) {
		event.preventDefault();
		mobileView = 'detail';
		void goto(resolve(item.href), {
			replaceState: true,
			state: { settingsReturnTo: returnTo }
		});
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
			<nav class="settings-nav-list" aria-label="Settings sections">
				{#each filteredItems as item (item.key)}
					<a
						class="settings-nav-item"
						class:active={item.key === activeKey}
						href={resolve(item.href)}
						aria-current={item.key === activeKey ? 'page' : undefined}
						onclick={(event) => openSection(event, item)}
					>
						<item.icon size={19} aria-hidden="true" />
						<span>{item.label}</span>
					</a>
				{/each}
			</nav>
		</aside>
		<section class="settings-details" aria-label="Settings details">
			<div class="mobile-detail-header">
				<button onclick={() => (mobileView = 'list')} aria-label="Back to settings">
					<ArrowLeft size={19} aria-hidden="true" />
					<span>Settings</span>
				</button>
				<button onclick={close} aria-label="Close settings" title="Close settings">
					<X size={19} aria-hidden="true" />
				</button>
			</div>
			{@render children()}
		</section>
	</div>
{/snippet}

{#if isMobile}
	<Sheet.Root open={true} onOpenChange={(next) => !next && close()}>
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
	<Dialog.Root open={true} onOpenChange={(next) => !next && close()}>
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
		font-size: var(--text-body-md);
		font-weight: 600;
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
		font-size: var(--text-body-sm);
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
		border-radius: 8px;
		color: var(--text-body);
		text-decoration: none;
		font-size: var(--text-body-md);
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
	.settings-details :global(.topbar) {
		display: none;
	}
	.settings-details :global(.page) {
		max-width: none;
		padding: 28px 32px 48px;
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
		}
		.settings-details :global(.page) {
			padding: 20px 16px 48px;
		}
	}
</style>
