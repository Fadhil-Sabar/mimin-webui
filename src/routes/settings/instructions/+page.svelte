<script lang="ts">
	import { onMount } from 'svelte';
	import { resolve } from '$app/paths';
	import {
		Check,
		FileText,
		FolderKanban,
		Globe,
		Loader2,
		LogOut,
		MessageSquare,
		PanelLeft,
		Plus,
		Puzzle,
		RotateCcw,
		Settings,
		Sparkles,
		User
	} from '@lucide/svelte';
	import ThemeToggle from '$lib/components/ThemeToggle.svelte';
	import RecentChats from '$lib/components/RecentChats.svelte';
	import { authClient } from '$lib/client/auth';
	import { sidebar } from '$lib/client/sidebar.svelte';

	const MAX_LENGTH = 10000;

	let { data } = $props();
	let user = $derived(data.user);
	let instructions = $state('');
	let savedInstructions = $state('');
	let loading = $state(true);
	let saving = $state(false);
	let notification = $state<{ type: 'success' | 'error'; message: string } | null>(null);
	let changed = $derived(instructions !== savedInstructions);

	function notify(type: 'success' | 'error', message: string) {
		notification = { type, message };
		setTimeout(() => {
			if (notification?.message === message) notification = null;
		}, 4000);
	}

	async function loadInstructions() {
		try {
			const response = await fetch('/api/settings/instructions');
			const body = await response.json();
			if (!response.ok) throw new Error(body.error?.message ?? 'Could not load instructions');
			instructions = body.instructions ?? '';
			savedInstructions = instructions;
		} catch (error) {
			notify('error', error instanceof Error ? error.message : 'Could not load instructions');
		} finally {
			loading = false;
		}
	}

	async function saveInstructions() {
		const pendingInstructions = instructions;
		saving = true;
		try {
			const response = await fetch('/api/settings/instructions', {
				method: 'PUT',
				headers: { 'content-type': 'application/json' },
				body: JSON.stringify({ instructions: pendingInstructions })
			});
			const body = await response.json();
			if (!response.ok) throw new Error(body.error?.message ?? 'Could not save instructions');
			const normalizedInstructions = body.instructions ?? '';
			savedInstructions = normalizedInstructions;
			if (instructions === pendingInstructions) instructions = normalizedInstructions;
			notify('success', normalizedInstructions ? 'Instructions saved' : 'Instructions cleared');
		} catch (error) {
			notify('error', error instanceof Error ? error.message : 'Could not save instructions');
		} finally {
			saving = false;
		}
	}

	async function clearInstructions() {
		if (!confirm('Clear your custom instructions?')) return;
		const pendingInstructions = instructions;
		saving = true;
		try {
			const response = await fetch('/api/settings/instructions', { method: 'DELETE' });
			const body = await response.json();
			if (!response.ok) throw new Error(body.error?.message ?? 'Could not clear instructions');
			savedInstructions = '';
			if (instructions === pendingInstructions) instructions = '';
			notify('success', 'Instructions cleared');
		} catch (error) {
			notify('error', error instanceof Error ? error.message : 'Could not clear instructions');
		} finally {
			saving = false;
		}
	}

	async function logout() {
		await authClient.signOut();
		window.location.href = resolve('/login');
	}

	onMount(loadInstructions);
</script>

<svelte:head>
	<title>Instructions · Mimin</title>
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
			<a class="nav-item active" href={resolve('/settings/instructions')}
				><FileText size={16} /> Instructions</a
			>
			<a class="nav-item" href={resolve('/skills')}><Sparkles size={16} /> Skills</a>
			<a class="nav-item" href={resolve('/settings/web-search')}><Globe size={16} /> Web Search</a>
			<a class="nav-item" href={resolve('/settings/browser-extension')}
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
					<strong>Settings</strong><span class="crumb-sep">/</span><span>Instructions</span>
				</div>
			</div>
			<div class="top-actions">
				<ThemeToggle /><span class="avatar avatar-top">{user?.name?.[0]?.toUpperCase() ?? 'U'}</span
				>
			</div>
		</header>

		<div class="page-wrap">
			<div class="page-heading">
				<span class="hero-icon"><FileText size={20} /></span>
				<div>
					<h1>Custom instructions</h1>
					<p>Tell Mimin how you want it to respond across all of your conversations.</p>
				</div>
			</div>

			{#if notification}
				<div
					class="notification"
					class:error={notification.type === 'error'}
					role={notification.type === 'error' ? 'alert' : 'status'}
				>
					{notification.message}
				</div>
			{/if}

			{#if loading}
				<div class="empty-state" role="status">Loading your instructions...</div>
			{:else}
				<div class="scope-strip" aria-label="Instruction priority">
					<div><span>1</span><small>Mimin defaults</small></div>
					<i aria-hidden="true"></i>
					<div class="current"><span>2</span><small>Your instructions</small></div>
					<i aria-hidden="true"></i>
					<div><span>3</span><small>Project context</small></div>
				</div>

				<form
					class="instruction-card"
					onsubmit={(event) => {
						event.preventDefault();
						saveInstructions();
					}}
				>
					<div class="field-heading">
						<div>
							<label for="custom-instructions">How should Mimin behave?</label>
							<p>Describe your preferred tone, format, working style, or standing context.</p>
						</div>
						<span class:near-limit={instructions.length > MAX_LENGTH * 0.9}
							>{instructions.length.toLocaleString()} / {MAX_LENGTH.toLocaleString()}</span
						>
					</div>
					<textarea
						id="custom-instructions"
						bind:value={instructions}
						maxlength={MAX_LENGTH}
						rows="12"
						placeholder="For example: Be concise and direct. Lead with the answer, explain technical terms in plain language, and use bullet points for multi-step guidance."
						spellcheck="true"></textarea>
					<p class="privacy-note">
						These instructions are added to new responses in every chat. Project instructions can
						add more specific guidance when you work inside a project.
					</p>
					<div class="form-actions">
						{#if savedInstructions}
							<button
								type="button"
								class="button danger"
								onclick={clearInstructions}
								disabled={saving}><RotateCcw size={15} /> Clear</button
							>
						{/if}
						<span class="save-state" aria-live="polite"
							>{changed ? 'Unsaved changes' : 'Up to date'}</span
						>
						<button type="submit" class="button primary" disabled={saving || !changed}>
							{#if saving}<span class="spin"><Loader2 size={16} /></span> Saving...{:else}<Check
									size={16}
								/> Save instructions{/if}
						</button>
					</div>
				</form>
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
		display: flex;
		align-items: flex-start;
		gap: 15px;
		padding-bottom: 27px;
		border-bottom: 1px solid var(--border);
	}
	.hero-icon {
		display: grid;
		place-items: center;
		width: 44px;
		height: 44px;
		flex: 0 0 44px;
		color: var(--text-muted);
		background: var(--surface-2);
		border: 1px solid var(--border);
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
	.field-heading p,
	.privacy-note {
		margin: 0;
		color: var(--text-muted);
		font-size: var(--text-sm);
		line-height: 1.55;
	}
	.notification {
		margin-top: 20px;
		padding: 11px 13px;
		color: var(--status-ok-text);
		background: color-mix(in srgb, var(--status-ok-dot) 8%, var(--surface));
		border: 1px solid color-mix(in srgb, var(--status-ok-dot) 24%, var(--border));
		border-radius: 8px;
		font-size: var(--text-sm);
	}
	.notification.error {
		color: var(--danger-text);
		background: color-mix(in srgb, var(--danger-text) 8%, var(--surface));
		border-color: color-mix(in srgb, var(--danger-text) 24%, var(--border));
	}
	.scope-strip {
		display: grid;
		grid-template-columns: auto 1fr auto 1fr auto;
		align-items: center;
		gap: 12px;
		margin: 24px 0 13px;
		padding: 12px 14px;
		background: var(--surface-2);
		border: 1px solid var(--border);
		border-radius: 9px;
	}
	.scope-strip div {
		display: flex;
		align-items: center;
		gap: 7px;
		color: var(--text-muted);
	}
	.scope-strip span {
		display: grid;
		place-items: center;
		width: 20px;
		height: 20px;
		border: 1px solid var(--border-strong);
		border-radius: 50%;
		font-size: 10px;
		font-style: normal;
		font-weight: 650;
	}
	.scope-strip .current {
		color: var(--text-strong);
		font-weight: 600;
	}
	.scope-strip .current span {
		color: var(--accent-fg);
		background: var(--accent-bg);
		border-color: var(--accent-bg);
	}
	.scope-strip small {
		font-size: var(--text-xs);
		white-space: nowrap;
	}
	.scope-strip i {
		height: 1px;
		background: var(--border-strong);
	}
	.instruction-card {
		padding: 20px;
		background: var(--surface);
		border: 1px solid var(--border);
		border-radius: 10px;
		box-shadow: 0 5px 20px var(--shadow-softer);
	}
	.field-heading {
		display: flex;
		align-items: flex-start;
		justify-content: space-between;
		gap: 20px;
		margin-bottom: 12px;
	}
	.field-heading label {
		display: block;
		margin-bottom: 3px;
		color: var(--text-strong);
		font-size: var(--text-base);
		font-weight: 600;
	}
	.field-heading > span {
		flex: 0 0 auto;
		color: var(--text-faint);
		font-size: var(--text-xs);
		font-variant-numeric: tabular-nums;
	}
	.field-heading > span.near-limit {
		color: var(--danger-text);
	}
	textarea {
		display: block;
		width: 100%;
		min-height: 230px;
		resize: vertical;
		padding: 14px 15px;
		color: var(--text-body);
		background: var(--surface-subtle);
		border: 1px solid var(--input-border);
		border-radius: 8px;
		font-size: var(--text-base);
		line-height: 1.65;
	}
	textarea:focus {
		border-color: var(--focus);
		outline: 2px solid color-mix(in srgb, var(--focus) 20%, transparent);
		outline-offset: 0;
	}
	.privacy-note {
		margin-top: 10px;
	}
	.form-actions {
		display: flex;
		align-items: center;
		gap: 10px;
		margin-top: 20px;
		padding-top: 17px;
		border-top: 1px solid var(--border);
	}
	.form-actions .primary {
		margin-left: auto;
	}
	.save-state {
		color: var(--text-faint);
		font-size: var(--text-xs);
	}
	.spin {
		animation: spin 0.8s linear infinite;
	}
	@keyframes spin {
		to {
			transform: rotate(360deg);
		}
	}
	@media (prefers-reduced-motion: reduce) {
		.spin {
			animation: none;
		}
	}
	@media (max-width: 720px) {
		.page-wrap {
			padding: 28px 18px 60px;
		}
		.scope-strip {
			grid-template-columns: 1fr;
			gap: 8px;
		}
		.scope-strip i {
			display: none;
		}
		.instruction-card {
			padding: 16px;
		}
		.field-heading {
			gap: 10px;
		}
		.form-actions {
			flex-wrap: wrap;
		}
		.save-state {
			order: -1;
			width: 100%;
		}
	}
</style>
