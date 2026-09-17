<script lang="ts">
	import { onMount } from 'svelte';
	import { Check, Copy, KeyRound, UserPlus, Users } from '@lucide/svelte';
	import PageHeader from '$lib/components/PageHeader.svelte';
	import { authClient } from '$lib/client/auth';

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

	type ResetLink = { email: string; url: string; expiresAt: string };
	let resetLink = $state<ResetLink | null>(null);
	let resetLinkBusyId = $state('');
	let resetLinkError = $state('');
	let resetLinkCopied = $state(false);

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

	async function createResetLink(managedUser: ManagedUser) {
		resetLinkError = '';
		resetLinkCopied = false;
		resetLinkBusyId = managedUser.id;
		try {
			const response = await fetch(`/api/admin/users/${managedUser.id}/reset-link`, {
				method: 'POST'
			});
			const payload = await response.json().catch(() => null);
			if (!response.ok) {
				resetLinkError = payload?.error?.message ?? 'Could not create a reset link.';
				return;
			}
			resetLink = {
				email: managedUser.email,
				url: payload.url,
				expiresAt: payload.expiresAt
			};
		} catch {
			resetLinkError = 'Could not reach the server.';
		} finally {
			resetLinkBusyId = '';
		}
	}

	async function copyResetLink() {
		if (!resetLink) return;
		try {
			await navigator.clipboard.writeText(resetLink.url);
			resetLinkCopied = true;
		} catch {
			resetLinkError = 'Copying failed. Select the link and copy it manually.';
		}
	}

	onMount(async () => {
		await loadUsers();
	});
	let pageCount = $derived(Math.max(1, Math.ceil(total / pageSize)));
</script>

<div class="tab-content">
	<PageHeader
		title="User management"
		eyebrow="Administration"
		subtitle="Provision workspace accounts and choose their access role."
	>
		{#snippet icon()}<Users size={24} aria-hidden="true" />{/snippet}
	</PageHeader>

	<div class="admin-grid">
		<section class="panel">
			<div class="panel-heading">
				<UserPlus size={18} />
				<h2>Create account</h2>
			</div>
			<p class="muted">Users receive access immediately with the initial password you provide.</p>
			<form
				onsubmit={(event) => {
					event.preventDefault();
					createUser();
				}}
				aria-busy={saving}
			>
				<label>Name<input bind:value={name} autocomplete="name" required /></label>
				<label>Email<input bind:value={email} type="email" autocomplete="email" required /></label>
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
							<button
								type="button"
								class="ghost"
								onclick={() => createResetLink(managedUser)}
								disabled={resetLinkBusyId === managedUser.id}
							>
								{resetLinkBusyId === managedUser.id ? 'Creating…' : 'Reset link'}
							</button>
						</div>
					{/each}
				</div>
				{#if resetLinkError}<p class="message error" role="alert">{resetLinkError}</p>{/if}
				{#if resetLink}
					<div class="reset-link">
						<div class="reset-link-head">
							<KeyRound size={15} />
							<strong>Reset link for {resetLink.email}</strong>
						</div>
						<p class="muted">
							Give it to the user privately. It works once and expires at
							{new Date(resetLink.expiresAt).toLocaleTimeString()}.
						</p>
						<div class="reset-link-row">
							<input readonly value={resetLink.url} aria-label="Password reset link" />
							<button type="button" class="copy" onclick={copyResetLink}>
								{#if resetLinkCopied}<Check size={14} /> Copied{:else}<Copy size={14} /> Copy{/if}
							</button>
						</div>
					</div>
				{/if}
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

<style>
	.tab-content {
		padding: 28px 32px 48px;
	}
	.muted {
		color: var(--text-muted);
		font-size: var(--text-body-md);
		line-height: var(--text-body-md--line-height);
		letter-spacing: var(--text-body-md--letter-spacing);
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
		font-size: var(--text-body-lg);
		line-height: var(--text-body-lg--line-height);
		letter-spacing: var(--text-body-lg--letter-spacing);
		font-weight: 500;
	}
	.count {
		margin-left: auto;
		color: var(--text-dim);
		font-size: var(--text-body-sm);
		line-height: var(--text-body-sm--line-height);
		letter-spacing: var(--text-body-sm--letter-spacing);
	}
	form {
		margin-top: 20px;
	}
	label {
		display: block;
		margin: 14px 0;
		color: var(--text-body);
		font-size: var(--text-body-md);
		line-height: var(--text-body-md--line-height);
		letter-spacing: var(--text-body-md--letter-spacing);
		font-weight: 500;
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
		font-weight: 500;
	}
	.primary:disabled {
		opacity: 0.6;
	}
	.message {
		padding: 9px 11px;
		border-radius: 6px;
		font-size: var(--text-body-md);
		line-height: var(--text-body-md--line-height);
		letter-spacing: var(--text-body-md--letter-spacing);
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
		font-size: var(--text-body-md);
		line-height: var(--text-body-md--line-height);
		letter-spacing: var(--text-body-md--letter-spacing);
		font-weight: 500;
	}
	.identity {
		display: grid;
		min-width: 0;
		gap: 3px;
	}
	.identity strong {
		color: var(--text);
		font-size: var(--text-body-md);
		line-height: var(--text-body-md--line-height);
		letter-spacing: var(--text-body-md--letter-spacing);
	}
	.identity span {
		overflow: hidden;
		color: var(--text-muted);
		font-size: var(--text-body-sm);
		line-height: var(--text-body-sm--line-height);
		letter-spacing: var(--text-body-sm--letter-spacing);
		text-overflow: ellipsis;
		white-space: nowrap;
	}
	.role {
		margin-left: auto;
		padding: 4px 8px;
		color: var(--text-muted);
		background: var(--surface-3);
		border-radius: 999px;
		font-size: var(--text-body-sm);
		line-height: var(--text-body-sm--line-height);
		letter-spacing: var(--text-body-sm--letter-spacing);
	}
	.admin-role {
		color: var(--accent-fg);
		background: var(--accent-bg);
	}
	.ghost {
		padding: 7px 11px;
		color: var(--text-body);
		background: var(--surface-subtle);
		border: 1px solid var(--border);
		border-radius: 6px;
		font-size: var(--text-body-sm);
		line-height: var(--text-body-sm--line-height);
		letter-spacing: var(--text-body-sm--letter-spacing);
		white-space: nowrap;
	}
	.ghost:hover {
		background: var(--surface-hover);
	}
	.ghost:disabled {
		opacity: 0.5;
	}
	.reset-link {
		margin-top: 16px;
		padding: 14px;
		background: var(--surface-2);
		border: 1px solid var(--border);
		border-radius: 10px;
	}
	.reset-link-head {
		display: flex;
		align-items: center;
		gap: 7px;
		color: var(--text-strong);
		font-size: var(--text-body-md);
		line-height: var(--text-body-md--line-height);
		letter-spacing: var(--text-body-md--letter-spacing);
	}
	.reset-link .muted {
		margin: 8px 0 10px;
	}
	.reset-link-row {
		display: flex;
		gap: 8px;
	}
	.reset-link-row input {
		margin-top: 0;
		font-size: var(--text-body-sm);
		line-height: var(--text-body-sm--line-height);
		letter-spacing: var(--text-body-sm--letter-spacing);
	}
	.copy {
		display: flex;
		flex: 0 0 auto;
		align-items: center;
		gap: 6px;
		padding: 0 12px;
		color: var(--text-body);
		background: var(--surface);
		border: 1px solid var(--border);
		border-radius: 7px;
		font-size: var(--text-body-sm);
		line-height: var(--text-body-sm--line-height);
		letter-spacing: var(--text-body-sm--letter-spacing);
	}
	.pagination {
		display: flex;
		align-items: center;
		justify-content: space-between;
		gap: 10px;
		margin-top: 18px;
		color: var(--text-muted);
		font-size: var(--text-body-sm);
		line-height: var(--text-body-sm--line-height);
		letter-spacing: var(--text-body-sm--letter-spacing);
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
		.tab-content {
			padding: 20px 16px 48px;
		}
		.admin-grid {
			grid-template-columns: 1fr;
		}
	}
</style>
