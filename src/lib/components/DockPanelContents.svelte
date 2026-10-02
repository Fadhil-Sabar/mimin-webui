<script module lang="ts">
	export type DockPanel = 'new-chat' | 'chats' | 'projects' | 'skills' | 'settings' | 'profile';
</script>

<script lang="ts">
	import { onMount } from 'svelte';
	import { resolve } from '$app/paths';
	import { Folder, LogOut, Plus, Workflow } from '@lucide/svelte';
	import RecentChats from '$lib/components/RecentChats.svelte';
	import { shell } from '$lib/client/shell.svelte';
	import { settingsModal, type SettingsTab } from '$lib/client/settings-modal.svelte';

	let {
		panel,
		user,
		newChat,
		selectChat,
		closePanels,
		logout
	}: {
		panel: DockPanel;
		user: { name?: string | null; role?: string | null } | null;
		newChat: () => void;
		selectChat: (id: string) => void;
		closePanels: () => void;
		logout: () => Promise<void>;
	} = $props();

	type PanelItem = { id: string; name: string; description?: string; projectId?: string | null };
	let items = $state<PanelItem[]>([]);
	let loading = $state(true);
	let error = $state('');

	const settings: { tab: SettingsTab; label: string; adminOnly?: boolean }[] = [
		{ tab: 'models', label: 'Models & Providers' },
		{ tab: 'instructions', label: 'Instructions' },
		{ tab: 'web-search', label: 'Web Search' },
		{ tab: 'browser-extension', label: 'Browser Extension' },
		{ tab: 'preferences', label: 'Preferences' },
		{ tab: 'users', label: 'Users', adminOnly: true }
	];

	function openSettings(tab: SettingsTab) {
		closePanels();
		settingsModal.show(tab);
	}

	onMount(() => {
		if (panel !== 'projects' && panel !== 'skills') return;
		const collection = panel;
		const controller = new AbortController();
		void (async () => {
			try {
				const response = await fetch(`/api/${collection}`, { signal: controller.signal });
				if (!response.ok) throw new Error(`Could not load ${collection}`);
				const data = await response.json();
				items = Array.isArray(data[collection]) ? data[collection] : [];
			} catch {
				if (!controller.signal.aborted)
					error = `Could not load ${collection}. Open the page to try again.`;
			} finally {
				loading = false;
			}
		})();
		return () => controller.abort();
	});
</script>

{#if panel === 'chats' || panel === 'new-chat'}
	<button class="panel-action" type="button" disabled={shell.newChatDisabled} onclick={newChat}>
		<Plus size={17} /> New chat
	</button>
	<RecentChats
		conversations={shell.chats?.conversations}
		activeId={shell.chats?.activeId}
		editingId={shell.chats?.editingId}
		onSelectChat={selectChat}
		onStartRename={shell.chats?.onStartRename}
		onPromptDelete={shell.chats?.onPromptDelete}
		onSaveRename={shell.chats?.onSaveRename}
		onCancelRename={shell.chats?.onCancelRename}
	/>
{:else if panel === 'projects' || panel === 'skills'}
	<a
		class="panel-action"
		href={panel === 'projects' ? resolve('/projects') : resolve('/skills')}
		onclick={closePanels}
	>
		{panel === 'projects' ? 'All projects' : 'Manage skills'}
	</a>
	{#if loading}
		<p class="panel-message" role="status">Loading {panel}…</p>
	{:else if error}
		<p class="panel-message" role="status">{error}</p>
	{:else if items.length === 0}
		<p class="panel-message">No {panel} yet.</p>
	{:else}
		<div class="panel-list">
			{#each items as item (item.id)}
				<a
					class="panel-link"
					href={panel === 'projects'
						? resolve(`/projects/${item.id}`)
						: item.projectId
							? resolve(`/skills?projectId=${encodeURIComponent(item.projectId)}`)
							: resolve('/skills')}
					onclick={closePanels}
				>
					{#if panel === 'projects'}<Folder size={17} />{:else}<Workflow size={17} />{/if}
					<span class="panel-link-copy">
						<span class="panel-name">{item.name}</span>
						{#if item.description}<span class="panel-description">{item.description}</span>{/if}
					</span>
				</a>
			{/each}
		</div>
	{/if}
{:else if panel === 'settings'}
	<div class="panel-list">
		{#each settings.filter((item) => !item.adminOnly || user?.role === 'admin') as item (item.tab)}
			<button class="panel-link" type="button" onclick={() => openSettings(item.tab)}>
				{item.label}
			</button>
		{/each}
	</div>
{:else if panel === 'profile'}
	<p class="profile-name">{user?.name ?? 'User'}</p>
	<div class="panel-list">
		<button class="panel-link" type="button" onclick={() => openSettings('preferences')}
			>Preferences</button
		>
		<button class="panel-link" type="button" onclick={logout}><LogOut size={17} /> Log out</button>
	</div>
{/if}

<style>
	.panel-action,
	.panel-link {
		display: flex;
		align-items: center;
		gap: 10px;
		width: 100%;
		min-width: 0;
		min-height: 40px;
		padding: 10px;
		border: 0;
		border-radius: 9px;
		color: var(--text-body);
		background: transparent;
		text-align: left;
		text-decoration: none;
		font-size: 14px;
	}
	.panel-action {
		margin-bottom: 16px;
		border: 1px solid var(--border);
		color: var(--text-strong);
	}
	.panel-action:hover,
	.panel-link:hover {
		color: var(--text-strong);
		background: var(--surface-hover);
	}
	.panel-action:disabled {
		opacity: 0.45;
	}
	.panel-list {
		display: grid;
		gap: 4px;
	}
	.panel-link :global(svg) {
		flex-shrink: 0;
	}
	.panel-link-copy {
		display: grid;
		gap: 4px;
		min-width: 0;
	}
	.panel-name,
	.panel-description {
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
	}
	.panel-description,
	.panel-message {
		color: var(--text-muted);
		font-size: 13px;
		line-height: 1.5;
	}
	.panel-message {
		margin: 12px 10px;
	}
	.profile-name {
		margin: 0 10px 16px;
		color: var(--text-strong);
		overflow-wrap: anywhere;
	}
</style>
