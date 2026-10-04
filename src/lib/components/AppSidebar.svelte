<script lang="ts">
	import { onDestroy } from 'svelte';
	import { reveal } from '$lib/client/motion';
	import { afterNavigate } from '$app/navigation';
	import { resolve } from '$app/paths';
	import { page } from '$app/state';
	import { Folder, MessageSquare, Plus, Settings, Workflow, X } from '@lucide/svelte';
	import DockPanelContents, { type DockPanel } from '$lib/components/DockPanelContents.svelte';
	import { authClient } from '$lib/client/auth';
	import { shell } from '$lib/client/shell.svelte';
	import { sidebar } from '$lib/client/sidebar.svelte';
	import { settingsModal } from '$lib/client/settings-modal.svelte';
	import { clearSensitiveDraftState } from '$lib/client/drafts';
	import { clearAllCanvasDrafts } from '$lib/client/canvas-drafts';
	import { invalidateModelsCache } from '$lib/client/models-cache';
	import {
		LAST_USED_MODEL_STORAGE_KEY,
		conversationsState
	} from '$lib/client/conversations.svelte';

	type Props = {
		user?: { id?: string | null; name?: string | null; role?: string | null } | null;
		inactive?: boolean;
	};
	let { user = null, inactive = false }: Props = $props();
	let panel = $state<DockPanel | null>(null);
	let pinnedPanel = $state<DockPanel | null>(null);
	let closeTimer: ReturnType<typeof setTimeout> | undefined;
	let visiblePanel = $derived(panel ?? (sidebar.mobileOpen ? 'chats' : null));
	const panelTitles: Record<DockPanel, string> = {
		'new-chat': 'New chat',
		chats: 'Chats',
		projects: 'Projects',
		skills: 'Skills',
		settings: 'Settings',
		profile: 'Profile'
	};
	let initial = $derived(user?.name?.[0]?.toUpperCase() ?? 'U');
	let path = $derived(page.url.pathname);
	let active = $derived(
		settingsModal.open
			? 'settings'
			: path.startsWith('/projects')
				? 'projects'
				: path.startsWith('/skills')
					? 'skills'
					: 'chat'
	);

	function panelTransition(
		node: HTMLElement,
		params: undefined,
		options: Parameters<typeof reveal>[2]
	) {
		return reveal(node, { x: window.innerWidth > 760 ? -12 : 0, y: 0 }, options);
	}

	function cancelClose() {
		clearTimeout(closeTimer);
		closeTimer = undefined;
	}

	function closePanels() {
		cancelClose();
		panel = null;
		pinnedPanel = null;
		sidebar.closeMobile();
	}

	function previewPanel(next: DockPanel, event: PointerEvent) {
		if (
			event.pointerType !== 'mouse' ||
			!window.matchMedia('(min-width: 761px) and (hover: hover) and (pointer: fine)').matches
		)
			return;
		cancelClose();
		panel = next;
	}

	function scheduleClose() {
		cancelClose();
		if (sidebar.mobileOpen) return;
		// Allow the pointer to cross the gutter between the rail and its panel.
		closeTimer = setTimeout(() => {
			panel = pinnedPanel;
		}, 180);
	}

	function pinPanel() {
		cancelClose();
		pinnedPanel = panel;
	}

	function togglePanel(next: DockPanel) {
		cancelClose();
		if (pinnedPanel === next) closePanels();
		else {
			panel = next;
			pinnedPanel = next;
		}
	}

	afterNavigate(closePanels);
	onDestroy(cancelClose);

	function newChat() {
		closePanels();
		if (shell.newChat) shell.newChat();
		else window.location.href = resolve('/chat?new=1');
	}

	function selectChat(id: string) {
		if (shell.chats?.onSelectChat) shell.chats.onSelectChat(id);
		else window.location.href = resolve('/chat') + '?id=' + encodeURIComponent(id);
		closePanels();
	}

	async function logout() {
		clearSensitiveDraftState();
		clearAllCanvasDrafts();
		invalidateModelsCache();
		conversationsState.items = [];
		conversationsState.loaded = false;
		try {
			localStorage.removeItem(LAST_USED_MODEL_STORAGE_KEY);
		} catch {
			/* best effort */
		}
		await authClient.signOut();
		window.location.href = '/login';
	}
</script>

<svelte:window
	onkeydown={(event) => {
		if (event.key === 'Escape') closePanels();
	}}
/>

<aside
	id="workspace-sidebar"
	class="sidebar"
	inert={inactive}
	data-mimin-dock
	aria-label="Workspace navigation"
	onpointerenter={cancelClose}
	onpointerleave={scheduleClose}
>
	<a
		class="dock-logo"
		href={resolve('/')}
		aria-label="Mimin home"
		title="Mimin home"
		onclick={closePanels}>m</a
	>
	<div class="dock-rule"></div>
	<nav class="dock-nav" aria-label="Main">
		<button
			class="dock-item"
			type="button"
			title="New chat"
			aria-label="New chat"
			disabled={shell.newChatDisabled}
			aria-expanded={visiblePanel === 'new-chat'}
			aria-controls={visiblePanel === 'new-chat' ? 'dock-panel' : undefined}
			onpointerenter={(event) => previewPanel('new-chat', event)}
			onclick={newChat}><Plus size={23} strokeWidth={1.8} /><span>New chat</span></button
		>
		<button
			class="dock-item"
			class:active={active === 'chat'}
			type="button"
			title="Chats and recent history"
			aria-label="Chats and recent history"
			aria-expanded={visiblePanel === 'chats'}
			aria-controls={visiblePanel === 'chats' ? 'dock-panel' : undefined}
			onpointerenter={(event) => previewPanel('chats', event)}
			onclick={() => togglePanel('chats')}
			><MessageSquare size={22} strokeWidth={1.8} /><span>Chats</span></button
		>
		<a
			class="dock-item"
			class:active={active === 'projects'}
			href={resolve('/projects')}
			title="Projects"
			aria-label="Projects"
			aria-current={active === 'projects' ? 'page' : undefined}
			aria-expanded={visiblePanel === 'projects'}
			aria-controls={visiblePanel === 'projects' ? 'dock-panel' : undefined}
			onpointerenter={(event) => previewPanel('projects', event)}
			onclick={closePanels}><Folder size={22} strokeWidth={1.8} /><span>Projects</span></a
		>
		<a
			class="dock-item"
			class:active={active === 'skills'}
			href={resolve('/skills')}
			title="Skills"
			aria-label="Skills"
			aria-current={active === 'skills' ? 'page' : undefined}
			aria-expanded={visiblePanel === 'skills'}
			aria-controls={visiblePanel === 'skills' ? 'dock-panel' : undefined}
			onpointerenter={(event) => previewPanel('skills', event)}
			onclick={closePanels}><Workflow size={22} strokeWidth={1.8} /><span>Skills</span></a
		>
	</nav>
	<div class="dock-spacer"></div>
	<div class="dock-rule"></div>
	<div class="dock-bottom">
		<button
			class="dock-item"
			class:active={active === 'settings'}
			type="button"
			title="Settings"
			aria-label="Settings"
			aria-expanded={visiblePanel === 'settings'}
			aria-controls={visiblePanel === 'settings' ? 'dock-panel' : undefined}
			onpointerenter={(event) => previewPanel('settings', event)}
			onclick={() => {
				settingsModal.show('models');
				closePanels();
			}}><Settings size={22} strokeWidth={1.8} /><span>Settings</span></button
		>
		<button
			class="dock-avatar"
			type="button"
			title={user?.name ?? 'Profile'}
			aria-label="Profile"
			aria-expanded={visiblePanel === 'profile'}
			aria-controls={visiblePanel === 'profile' ? 'dock-panel' : undefined}
			onpointerenter={(event) => previewPanel('profile', event)}
			onclick={() => togglePanel('profile')}>{initial}</button
		>
	</div>
	{#if visiblePanel}
		<section
			id="dock-panel"
			class="dock-panel"
			transition:panelTransition
			aria-label={visiblePanel === 'chats' ? 'Recent chats' : panelTitles[visiblePanel]}
			onpointerenter={cancelClose}
			onpointerleave={scheduleClose}
			onpointerdown={pinPanel}
			onfocusin={pinPanel}
		>
			<div class="dock-panel-head">
				<strong>{panelTitles[visiblePanel]}</strong>
				<button
					type="button"
					aria-label={`Close ${panelTitles[visiblePanel].toLowerCase()}`}
					title={`Close ${panelTitles[visiblePanel].toLowerCase()}`}
					onclick={closePanels}><X size={18} /></button
				>
			</div>
			<div class="dock-panel-scroll">
				{#key visiblePanel}
					<div in:reveal={{ x: 6, y: 0, duration: 180 }}>
						<DockPanelContents
							panel={visiblePanel}
							{user}
							{newChat}
							{selectChat}
							{closePanels}
							{logout}
						/>
					</div>
				{/key}
			</div>
		</section>
	{/if}
</aside>

<style>
	.dock-logo {
		display: grid;
		place-items: center;
		height: 54px;
		color: var(--text-strong);
		text-decoration: none;
		font-size: 34px;
		font-weight: 600;
		letter-spacing: -0.08em;
	}
	.dock-rule {
		height: 1px;
		width: 42px;
		margin: 8px auto 15px;
		background: var(--border-strong);
		opacity: 0.65;
	}
	.dock-nav,
	.dock-bottom {
		display: flex;
		flex-direction: column;
		align-items: center;
		gap: 8px;
	}
	.dock-spacer {
		flex: 1;
	}
	.dock-item {
		width: 52px;
		height: 52px;
		display: flex;
		align-items: center;
		justify-content: center;
		border: 0;
		border-radius: 11px;
		color: var(--text-body);
		background: transparent;
		text-decoration: none;
	}
	.dock-item:hover,
	.dock-item.active {
		color: var(--text-strong);
		background: var(--surface-hover);
	}
	.dock-item:disabled {
		opacity: 0.45;
	}
	.dock-item span {
		display: none;
	}
	.dock-avatar {
		width: 47px;
		height: 47px;
		display: grid;
		place-items: center;
		border-radius: 50%;
		border: 1px solid var(--border-strong);
		color: var(--text-strong);
		background: var(--surface-3);
		font-size: 19px;
	}
	.dock-panel {
		position: fixed;
		left: var(--dock-panel-left);
		top: 34px;
		bottom: 34px;
		z-index: 1;
		width: var(--dock-panel-width);
		display: flex;
		flex-direction: column;
		padding: 20px 14px;
		border: 1px solid var(--border);
		border-radius: 18px;
		background: var(--surface);
		box-shadow: 0 20px 55px var(--shadow);
	}
	.dock-panel-head {
		display: flex;
		align-items: center;
		justify-content: space-between;
		padding: 0 7px 16px;
		font-size: 19px;
	}
	.dock-panel-head button {
		display: grid;
		place-items: center;
		width: 30px;
		height: 30px;
		border: 0;
		border-radius: 8px;
		color: var(--text-muted);
		background: transparent;
	}
	.dock-panel-head button:hover {
		background: var(--surface-hover);
		color: var(--text-strong);
	}
	.dock-panel-scroll {
		flex: 1;
		min-height: 0;
		overflow: auto;
	}
	@media (max-width: 760px) {
		.dock-item {
			width: 100%;
			justify-content: flex-start;
			gap: 16px;
			padding: 0 16px;
		}
		.dock-item span {
			display: inline;
		}
		.dock-nav,
		.dock-bottom {
			align-items: stretch;
		}
		.dock-panel {
			position: static;
			flex: 1;
			width: 100%;
			min-height: 0;
			margin-top: 12px;
			padding: 8px 0;
			border: 0;
			box-shadow: none;
			background: transparent;
		}
	}
</style>
