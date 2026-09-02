<script lang="ts">
	import { onMount } from 'svelte';
	import { resolve } from '$app/paths';
	import {
		FolderKanban,
		LogOut,
		MessageSquare,
		PanelLeft,
		Plus,
		Send,
		Settings,
		Sparkles,
		User
	} from '@lucide/svelte';
	import ThemeToggle from '$lib/components/ThemeToggle.svelte';
	import { authClient } from '$lib/client/auth';
	import { sidebar } from '$lib/client/sidebar.svelte';
	import ModelPicker, { type ModelOption } from '$lib/components/ModelPicker.svelte';
	let prompt = $state('');
	let toast = $state('');
	let user = $state<{ name: string; role?: string | null } | null>(null);
	let conversations = $state<{ id: string; title: string }[]>([]);
	let models = $state<ModelOption[]>([]);
	let modelsLoading = $state(true);
	let modelLoadError = $state('');
	let selectedModel = $state('');
	function notify(message: string) {
		toast = message;
		setTimeout(() => (toast = ''), 1600);
	}
	function usePrompt(value: string) {
		prompt = value;
	}

	function modelRef(model: ModelOption) {
		return `${model.provider}/${model.id}`;
	}

	let configuredModels = $derived(
		models.filter((model) => model.configured || model.userConfigured)
	);

	async function loadModels() {
		try {
			const response = await fetch('/api/models');
			if (!response.ok) throw new Error('Could not load models');
			const data = await response.json();
			models = Array.isArray(data.models) ? data.models : [];
			const errors = Array.isArray(data.errors) ? data.errors : [];
			modelLoadError = errors
				.map((error: { message?: string }) => error.message ?? '')
				.filter(Boolean)
				.join(' ');
			if (modelLoadError) notify('Some live models could not be loaded. Check Providers.');
			const preferred = configuredModels.find((model) => modelRef(model) === 'openai/gpt-4o-mini');
			const selected = preferred ?? configuredModels[0];
			selectedModel = selected ? modelRef(selected) : '';
		} catch (error) {
			notify(error instanceof Error ? error.message : 'Could not load models');
		} finally {
			modelsLoading = false;
		}
	}

	async function submitPrompt() {
		const content = prompt.trim();
		if (!content) {
			notify('Write a prompt first');
			return;
		}
		if (!selectedModel) {
			notify(
				modelLoadError
					? 'Live models are unavailable. Check Providers.'
					: 'Configure a provider before starting a chat'
			);
			return;
		}
		try {
			const response = await fetch('/api/conversations', {
				method: 'POST',
				headers: { 'content-type': 'application/json' },
				body: JSON.stringify({ model: selectedModel })
			});
			if (!response.ok)
				throw new Error((await response.json()).error?.message ?? 'Could not start a conversation');
			const conversation = (await response.json()).conversation;
			window.location.href = `/chat?id=${encodeURIComponent(conversation.id)}&prompt=${encodeURIComponent(content)}`;
		} catch (error) {
			notify(error instanceof Error ? error.message : 'Could not start a conversation');
		}
	}

	function onKeydown(event: KeyboardEvent) {
		if (event.key === 'Enter' && !event.shiftKey) {
			event.preventDefault();
			submitPrompt();
		}
	}

	onMount(async () => {
		try {
			const sessionResponse = await authClient.getSession();
			if (sessionResponse.data) user = sessionResponse.data.user ?? null;
		} catch {
			/* ignore */
		}
		await loadModels();
		try {
			const response = await fetch('/api/conversations');
			if (response.ok) conversations = (await response.json()).conversations ?? [];
		} catch {
			/* ignore */
		}
	});

	async function logout() {
		await authClient.signOut();
		window.location.href = '/login';
	}
</script>

<svelte:head><title>Mimin WebUI | Home</title></svelte:head>
<div class="app-shell" class:sidebar-collapsed={sidebar.collapsed}>
	<aside class="sidebar">
		<div class="sidebar-top-row">
			<div class="brand">
				<span class="brand-mark"><Sparkles size={13} /></span><span>mimin</span><span
					class="brand-muted">/ workbench</span
				>
			</div>
			<button class="sidebar-toggle" onclick={() => sidebar.toggle()} title="Collapse sidebar" aria-label="Collapse sidebar"><PanelLeft size={16} /></button>
		</div>
		<a class="new-chat" href={resolve('/chat')}><Plus size={16} /> New chat <kbd>⌘ K</kbd></a>
		<div class="sidebar-scroll">
			<div class="nav-label">Workspace</div>
			<a class="nav-item active" href={resolve('/')}
				><MessageSquare size={16} /> Chat <span class="nav-count">{conversations.length}</span></a
			>
			<a class="nav-item" href={resolve('/projects')}><FolderKanban size={16} /> Projects</a>
			{#if user?.role === 'admin'}<a class="nav-item" href={resolve('/admin/users')}><User size={16} /> Users</a>{/if}
			<div class="nav-label projects-label">Preferences</div>
			<a class="nav-item" href={resolve('/settings')}><Settings size={16} /> Models</a>
			{#if conversations.length > 0}
				<div class="nav-label projects-label">Recent chats</div>
				{#each conversations as conversation (conversation.id)}
					<a class="project-item" href={resolve(`/chat?id=${encodeURIComponent(conversation.id)}`)}
						><span class="project-dot"></span>{conversation.title}</a
					>
				{/each}
			{/if}
		</div>
		<div class="sidebar-bottom">
			<div class="user-row">
				<span class="avatar">{user?.name?.[0]?.toUpperCase() ?? 'F'}</span>
				<div class="user-meta">
					<strong>{user?.name ?? 'Fadhil'}</strong>
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
				{#if sidebar.collapsed}
					<button class="sidebar-toggle topbar-toggle" onclick={() => sidebar.toggle()} title="Expand sidebar" aria-label="Expand sidebar"><PanelLeft size={16} /></button>
				{/if}
				<div class="breadcrumb"><strong>Home</strong></div>
			</div>
			<div class="top-actions">
				<ThemeToggle />
				<span class="avatar avatar-top">{user?.name?.[0]?.toUpperCase() ?? 'F'}</span>
			</div>
		</header>
		<div class="home-wrap">
			<span class="workbench-label">Your workbench</span>
			<h1>Start with the work<br />in front of you.</h1>
			<p class="intro">
				Mimin keeps your conversation, model, and project context together while you think through
				the next step.
			</p>
			{#if !modelsLoading && !selectedModel}
				<a class="setup-callout" href={resolve('/settings')}
					>Connect a model before starting a chat <span>→</span></a
				>
			{/if}
			<div class="home-composer">
				<textarea
					bind:value={prompt}
					aria-label="Prompt"
					placeholder="Ask anything..."
					onkeydown={onKeydown}></textarea>
				<div class="composer-row">
					<ModelPicker
						models={configuredModels}
						value={selectedModel}
						loading={modelsLoading}
						disabled={configuredModels.length === 0}
						placeholder={modelLoadError ? 'Models unavailable' : 'Configure a provider'}
						onselect={(model) => {
							selectedModel = model;
						}}
					/>
					<button
						class="send-button"
						aria-label="Send prompt"
						title="Send prompt"
						onclick={submitPrompt}><Send size={16} aria-hidden="true" /></button
					>
				</div>
			</div>
			<div class="example-row">
				<button onclick={() => usePrompt('Summarize project notes')}>Summarize project notes</button
				><button onclick={() => usePrompt('Design a clean API')}>Design a clean API</button><button
					onclick={() => usePrompt('Explore ideas')}>Explore ideas</button
				>
			</div>
		</div>
	</main>
</div>
{#if toast}<div class="toast" role="status" aria-live="polite">{toast}</div>{/if}

<style>
	.home-wrap {
		max-width: 800px;
		margin: auto;
		padding: clamp(64px, 15vh, 150px) 32px 80px;
	}
	.home-wrap h1 {
		font-family: var(--font-body);
		font-size: var(--text-3xl);
		font-weight: 600;
		line-height: 1.15;
		letter-spacing: -0.03em;
		color: var(--text-strong);
		margin: 0 0 14px;
	}
	.workbench-label {
		display: inline-flex;
		margin-bottom: 12px;
		color: var(--text-muted);
		font-size: var(--text-xs);
		font-weight: 600;
		letter-spacing: 0.04em;
		text-transform: uppercase;
	}
	.intro {
		max-width: 500px;
		color: var(--text-muted);
		font-size: var(--text-base);
		line-height: 1.6;
		margin: 0 0 32px;
	}
	.setup-callout {
		display: flex;
		align-items: center;
		justify-content: space-between;
		max-width: 640px;
		margin: 0 0 16px;
		padding: 10px 14px;
		color: var(--text-body);
		background: var(--surface-2);
		border: 1px solid var(--border);
		border-radius: 8px;
		font-size: var(--text-sm);
		text-decoration: none;
		transition: background 0.15s ease, border-color 0.15s ease;
	}
	.setup-callout:hover {
		background: var(--surface-hover);
		border-color: var(--border-strong);
	}
	.home-composer {
		background: var(--surface);
		border: 1px solid var(--border-strong);
		border-radius: 12px;
		padding: 16px;
		box-shadow: 0 10px 30px var(--shadow-soft);
	}
	.home-composer textarea {
		display: block;
		width: 100%;
		min-height: 78px;
		border: 0;
		outline: 0;
		resize: none;
		font: var(--text-base)/1.5 inherit;
		background: transparent;
	}
	.composer-row {
		display: flex;
		align-items: center;
		gap: 7px;
		border-top: 1px solid var(--border);
		padding-top: 12px;
	}
	.send-button {
		display: grid;
		place-items: center;
		margin-left: auto;
		width: 40px;
		height: 40px;
		flex: 0 0 auto;
		border: 0;
		border-radius: 8px;
		color: var(--accent-fg);
		background: var(--accent-bg);
		text-decoration: none;
		transition: 0.18s ease;
	}
	.send-button:hover {
		background: var(--accent-bg-hover);
	}
	.example-row {
		display: flex;
		gap: 8px;
		flex-wrap: wrap;
		margin-top: 18px;
	}
	.example-row button {
		border: 1px solid var(--border);
		background: transparent;
		color: var(--text-muted);
		border-radius: 18px;
		padding: 7px 11px;
		font-size: var(--text-sm);
	}
	.example-row button:hover {
		color: var(--text-body);
		background: var(--surface-hover);
	}
	.toast {
		position: fixed;
		bottom: 22px;
		left: 50%;
		transform: translateX(-50%);
		background: var(--accent-bg);
		color: var(--accent-fg);
		font-size: var(--text-sm);
		padding: 8px 13px;
		border-radius: 6px;
		z-index: 50;
	}
	@media (max-width: 700px) {
		.home-wrap {
			padding: clamp(48px, 10vh, 84px) 18px 60px;
		}
		.home-wrap h1 {
			font-size: var(--text-2xl);
		}
		.composer-row {
			flex-wrap: wrap;
		}
		.send-button {
			margin-left: auto;
		}
	}
</style>
