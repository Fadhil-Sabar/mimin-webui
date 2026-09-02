<script lang="ts">
	import { onMount } from 'svelte';
	import { resolve } from '$app/paths';
	import {
		FolderKanban,
		Globe,
		LogOut,
		MessageSquare,
		PanelLeft,
		Plus,
		Settings,
		Sparkles,
		User,
		UserPlus,
		Users
	} from '@lucide/svelte';
	import ThemeToggle from '$lib/components/ThemeToggle.svelte';
	import { authClient } from '$lib/client/auth';
	import { sidebar } from '$lib/client/sidebar.svelte';

	type ManagedUser = {
		id: string;
		name: string;
		email: string;
		role?: string;
		emailVerified?: boolean;
		createdAt: Date | string;
	};

	let users = $state<ManagedUser[]>([]);
	let total = $state(0);
	let loading = $state(true);
	let saving = $state(false);
	let error = $state('');
	let success = $state('');
	let page = $state(0);
	const pageSize = 10;
	let name = $state('');
	let email = $state('');
	let password = $state('');
	let role = $state<'user' | 'admin'>('user');
	let user = $state<{ name: string; role?: string | null } | null>(null);

	function messageFrom(errorValue: unknown, fallback: string) {
		return errorValue && typeof errorValue === 'object' && 'message' in errorValue
			? String(errorValue.message)
			: fallback;
	}

	async function loadUsers() {
		loading = true;
		error = '';
		try {
			const result = await authClient.admin.listUsers({
				query: {
					limit: pageSize,
					offset: page * pageSize,
					sortBy: 'createdAt',
					sortDirection: 'asc'
				}
			});
			if (result.error) {
				error = messageFrom(result.error, 'Could not load users.');
				return;
			}
			users = result.data?.users ?? [];
			total = result.data?.total ?? users.length;
		} catch (value) {
			error = messageFrom(value, 'Could not load users.');
		} finally {
			loading = false;
		}
	}

	async function createUser() {
		error = '';
		success = '';
		const cleanName = name.trim();
		const cleanEmail = email.trim().toLowerCase();
		if (!cleanName || !cleanEmail || !password) {
			error = 'Name, email, and password are required.';
			return;
		}
		if (password.length < 8) {
			error = 'Password must be at least 8 characters.';
			return;
		}
		saving = true;
		try {
			const result = await authClient.admin.createUser({
				name: cleanName,
				email: cleanEmail,
				password,
				role
			});
			if (result.error) {
				error = messageFrom(result.error, 'Could not create user.');
				return;
			}
			name = '';
			email = '';
			password = '';
			role = 'user';
			success = 'User created successfully.';
			await loadUsers();
		} catch (value) {
			error = messageFrom(value, 'Could not create user.');
		} finally {
			saving = false;
		}
	}

	async function logout() {
		await authClient.signOut();
		window.location.href = '/login';
	}

	onMount(async () => {
		try {
			const sessionResponse = await authClient.getSession();
			if (sessionResponse.data) user = sessionResponse.data.user ?? null;
		} catch {
			/* ignore */
		}
		await loadUsers();
	});
	let pageCount = $derived(Math.max(1, Math.ceil(total / pageSize)));
</script>

<svelte:head><title>User management | Mimin WebUI</title></svelte:head>

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
			{#if user?.role === 'admin'}<a class="nav-item active" href={resolve('/admin/users')}
					><User size={16} /> Users</a
				>{/if}
			<div class="nav-label projects-label">Preferences</div>
			<a class="nav-item" href={resolve('/settings')}><Settings size={16} /> Models</a>
			<a class="nav-item" href={resolve('/settings/web-search')}><Globe size={16} /> Web Search</a>
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
				<button
					class="sidebar-toggle topbar-toggle"
					onclick={() => sidebar.toggle()}
					title="Toggle sidebar"
					aria-label="Toggle sidebar"><PanelLeft size={16} /></button
				>
				<div class="breadcrumb">
					<strong>Admin</strong><span class="crumb-sep">/</span><span>Users</span>
				</div>
			</div>
			<div class="top-actions">
				<ThemeToggle /><span class="avatar avatar-top">{user?.name?.[0]?.toUpperCase() ?? 'F'}</span
				>
			</div>
		</header>
		<div class="admin-page">
			<header class="page-header">
				<div>
					<p class="eyebrow">Administration</p>
					<h1>User management</h1>
					<p class="subtitle">Provision workspace accounts and choose their access role.</p>
				</div>
				<Users size={24} aria-hidden="true" />
			</header>

			<div class="admin-grid">
				<section class="panel">
					<div class="panel-heading">
						<UserPlus size={18} />
						<h2>Create account</h2>
					</div>
					<p class="muted">
						Users receive access immediately with the initial password you provide.
					</p>
					<form
						onsubmit={(event) => {
							event.preventDefault();
							createUser();
						}}
						aria-busy={saving}
					>
						<label>Name<input bind:value={name} autocomplete="name" required /></label>
						<label
							>Email<input bind:value={email} type="email" autocomplete="email" required /></label
						>
						<label
							>Initial password<input
								bind:value={password}
								type="password"
								minlength="8"
								autocomplete="new-password"
								required
							/></label
						>
						<label
							>Role<select bind:value={role}
								><option value="user">User</option><option value="admin">Admin</option></select
							></label
						>
						{#if error}<p class="message error" role="alert">{error}</p>{/if}
						{#if success}<p class="message success" role="status">{success}</p>{/if}
						<button class="primary" type="submit" disabled={saving}
							>{saving ? 'Creating…' : 'Create user'}</button
						>
					</form>
				</section>

				<section class="panel users-panel">
					<div class="panel-heading">
						<Users size={18} />
						<h2>Workspace users</h2>
						<span class="count">{total}</span>
					</div>
					{#if loading}<p class="muted">Loading users…</p>
					{:else if users.length === 0}<p class="muted">No users found.</p>
					{:else}
						<div class="user-list">
							{#each users as managedUser (managedUser.id)}
								<div class="user-entry">
									<span class="avatar-chip">{managedUser.name.slice(0, 1).toUpperCase()}</span>
									<div class="identity">
										<strong>{managedUser.name}</strong><span>{managedUser.email}</span>
									</div>
									<span class:admin-role={managedUser.role === 'admin'} class="role"
										>{managedUser.role ?? 'user'}</span
									>
								</div>
							{/each}
						</div>
						<div class="pagination">
							<button
								type="button"
								onclick={() => {
									page -= 1;
									loadUsers();
								}}
								disabled={page === 0 || loading}>Previous</button
							><span>Page {page + 1} of {pageCount}</span><button
								type="button"
								onclick={() => {
									page += 1;
									loadUsers();
								}}
								disabled={page + 1 >= pageCount || loading}>Next</button
							>
						</div>
					{/if}
				</section>
			</div>
		</div>
	</main>
</div>

<style>
	.admin-page {
		max-width: 1100px;
		margin: 0 auto;
		padding: 48px 32px 80px;
	}
	.page-header {
		display: flex;
		align-items: flex-start;
		justify-content: space-between;
		margin-bottom: 32px;
		color: var(--text-muted);
	}
	.eyebrow {
		margin: 0 0 6px;
		color: var(--text-muted);
		font-size: var(--text-xs);
		font-weight: 600;
		letter-spacing: 0.04em;
		text-transform: uppercase;
	}
	h1 {
		margin: 0 0 6px;
		color: var(--text-strong);
		font-family: var(--font-body);
		font-size: var(--text-2xl);
		font-weight: 600;
		line-height: 1.2;
		letter-spacing: -0.025em;
	}
	.subtitle,
	.muted {
		color: var(--text-muted);
		font-size: var(--text-sm);
	}
	.admin-grid {
		display: grid;
		grid-template-columns: minmax(260px, 0.8fr) minmax(0, 1.2fr);
		gap: 20px;
	}
	.panel {
		padding: 24px;
		background: var(--surface);
		border: 1px solid var(--border);
		border-radius: 12px;
		box-shadow: 0 8px 24px var(--shadow-soft);
	}
	.panel-heading {
		display: flex;
		align-items: center;
		gap: 9px;
		color: var(--text-strong);
	}
	.panel-heading h2 {
		margin: 0;
		font-family: var(--font-body);
		font-size: var(--text-base);
		font-weight: 600;
		letter-spacing: -0.015em;
		line-height: 1.3;
	}
	.count {
		margin-left: auto;
		color: var(--text-dim);
		font-size: var(--text-xs);
	}
	form {
		margin-top: 20px;
	}
	label {
		display: block;
		margin: 14px 0;
		color: var(--text-body);
		font-size: var(--text-sm);
		font-weight: 550;
	}
	input,
	select {
		display: block;
		width: 100%;
		min-height: 42px;
		margin-top: 6px;
		padding: 9px 10px;
		color: var(--text);
		background: var(--surface-subtle);
		border: 1px solid var(--input-border);
		border-radius: 7px;
		font: inherit;
	}
	.primary {
		width: 100%;
		min-height: 42px;
		margin-top: 8px;
		color: var(--accent-fg);
		background: var(--accent-bg);
		border: 0;
		border-radius: 7px;
		font-weight: 600;
	}
	.primary:disabled {
		opacity: 0.6;
	}
	.message {
		padding: 9px 11px;
		border-radius: 6px;
		font-size: var(--text-sm);
	}
	.error {
		color: var(--danger-text);
		background: color-mix(in srgb, var(--danger-text) 10%, transparent);
	}
	.success {
		color: var(--success-text, var(--text));
		background: color-mix(in srgb, var(--accent-bg) 18%, transparent);
	}
	.user-list {
		margin-top: 18px;
		border-top: 1px solid var(--border);
	}
	.user-entry {
		display: flex;
		align-items: center;
		gap: 11px;
		padding: 14px 0;
		border-bottom: 1px solid var(--border);
	}
	.avatar-chip {
		display: grid;
		flex: 0 0 32px;
		place-items: center;
		width: 32px;
		height: 32px;
		color: var(--accent-fg);
		background: var(--accent-bg);
		border-radius: 50%;
		font-size: var(--text-sm);
		font-weight: 650;
	}
	.crumb-sep {
		color: var(--text-faint);
		margin: 0 3px;
	}
	.identity {
		display: grid;
		min-width: 0;
		gap: 3px;
	}
	.identity strong {
		color: var(--text);
		font-size: var(--text-sm);
	}
	.identity span {
		overflow: hidden;
		color: var(--text-muted);
		font-size: var(--text-xs);
		text-overflow: ellipsis;
		white-space: nowrap;
	}
	.role {
		margin-left: auto;
		padding: 4px 8px;
		color: var(--text-muted);
		background: var(--surface-3);
		border-radius: 999px;
		font-size: var(--text-xs);
	}
	.admin-role {
		color: var(--accent-fg);
		background: var(--accent-bg);
	}
	.pagination {
		display: flex;
		align-items: center;
		justify-content: space-between;
		gap: 10px;
		margin-top: 18px;
		color: var(--text-muted);
		font-size: var(--text-xs);
	}
	.pagination button {
		padding: 7px 9px;
		color: var(--text-body);
		background: var(--surface-subtle);
		border: 1px solid var(--border);
		border-radius: 6px;
	}
	.pagination button:disabled {
		opacity: 0.45;
	}
	@media (max-width: 760px) {
		.admin-page {
			padding: 32px 18px 60px;
		}
		.admin-grid {
			grid-template-columns: 1fr;
		}
	}
</style>
