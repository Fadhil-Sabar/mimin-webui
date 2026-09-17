<script lang="ts">
	import { onMount } from 'svelte';
	import { Check, Copy, KeyRound, UserPlus, Users } from '@lucide/svelte';
	import PageHeader from '$lib/components/PageHeader.svelte';
	import Skeleton from '$lib/components/Skeleton.svelte';
	import { Button } from '$lib/components/ui/button/index.js';
	import { Card } from '$lib/components/ui/card/index.js';
	import { Input } from '$lib/components/ui/input/index.js';
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
		<Card shadow="raised">
			<div class="panel-heading">
				<UserPlus size={18} />
				<h2 class="md-body-lg">Create account</h2>
			</div>
			<p class="muted">Users receive access immediately with the initial password you provide.</p>
			<form
				onsubmit={(event) => {
					event.preventDefault();
					createUser();
				}}
				aria-busy={saving}
			>
				<label>Name<Input class="mt-1.5" bind:value={name} autocomplete="name" required /></label>
				<label
					>Email<Input
						class="mt-1.5"
						bind:value={email}
						type="email"
						autocomplete="email"
						required
					/></label
				>
				<label
					>Initial password<Input
						class="mt-1.5"
						bind:value={password}
						type="password"
						minlength={8}
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
				<Button class="mt-[var(--space-2)] w-full" size="lg" type="submit" disabled={saving}
					>{saving ? 'Creating…' : 'Create user'}</Button
				>
			</form>
		</Card>

		<Card shadow="raised">
			<div class="panel-heading">
				<Users size={18} />
				<h2 class="md-body-lg">Workspace users</h2>
				<span class="count">{total}</span>
			</div>
			{#if loading}
				<div class="user-list" role="status" aria-label="Loading users">
					{#each [1, 2, 3, 4, 5] as i (i)}
						<div class="user-entry">
							<Skeleton width="32px" height="32px" radius="50%" />
							<div class="identity">
								<Skeleton width="140px" height="14px" />
								<Skeleton width="200px" height="12px" />
							</div>
						</div>
					{/each}
				</div>
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
							<Button
								variant="secondary"
								size="sm"
								class="whitespace-nowrap"
								onclick={() => createResetLink(managedUser)}
								disabled={resetLinkBusyId === managedUser.id}
							>
								{resetLinkBusyId === managedUser.id ? 'Creating…' : 'Reset link'}
							</Button>
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
							<Input
								class="reset-link-input"
								readonly
								value={resetLink.url}
								aria-label="Password reset link"
							/>
							<Button
								variant="outline"
								size="sm"
								class="flex-none gap-1.5 px-[var(--space-3)]"
								onclick={copyResetLink}
							>
								{#if resetLinkCopied}<Check size={14} /> Copied{:else}<Copy size={14} /> Copy{/if}
							</Button>
						</div>
					</div>
				{/if}
				<div class="pagination">
					<Button
						variant="outline"
						size="sm"
						onclick={() => {
							page -= 1;
							loadUsers();
						}}
						disabled={page === 0 || loading}>Previous</Button
					><span>Page {page + 1} of {pageCount}</span><Button
						variant="outline"
						size="sm"
						onclick={() => {
							page += 1;
							loadUsers();
						}}
						disabled={page + 1 >= pageCount || loading}>Next</Button
					>
				</div>
			{/if}
		</Card>
	</div>
</div>

<style>
	.tab-content {
		padding: 28px var(--space-6) var(--space-7);
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
	.panel-heading {
		display: flex;
		align-items: center;
		gap: 9px;
		color: var(--text-strong);
		min-width: 0;
	}
	.panel-heading h2 {
		margin: 0;
		font-family: var(--font-body);
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
	/* The inputs are the shared `Input`; the native `<select>` beside them is styled
	 * to the same treatment so the two read as one field type. */
	select {
		display: block;
		width: 100%;
		min-height: 44px;
		margin-top: var(--space-2);
		padding: var(--space-2) 11px;
		color: var(--text);
		background: var(--surface);
		border: 1px solid var(--input-border);
		border-radius: var(--radius-md);
		font-family: var(--font-body);
		font-size: var(--text-body-md);
		line-height: var(--text-body-md--line-height);
		letter-spacing: var(--text-body-md--letter-spacing);
	}
	.message {
		padding: 9px 11px;
		border-radius: var(--radius-md);
		font-size: var(--text-body-md);
		line-height: var(--text-body-md--line-height);
		letter-spacing: var(--text-body-md--letter-spacing);
	}
	.error {
		color: var(--danger-text);
		background: color-mix(in srgb, var(--danger-text) 10%, transparent);
	}
	.success {
		color: var(--status-ok-text);
		background: color-mix(in srgb, var(--accent-bg) 18%, transparent);
	}
	.user-list {
		margin-top: 18px;
		border-top: 1px solid var(--border);
	}
	.user-entry {
		display: flex;
		align-items: center;
		flex-wrap: wrap;
		gap: var(--space-3);
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
		padding: var(--space-1) var(--space-2);
		color: var(--text-muted);
		background: var(--surface-3);
		border-radius: 999px;
		font-family: var(--font-body);
		font-size: var(--text-label-sm);
		line-height: var(--text-label-sm--line-height);
		letter-spacing: var(--text-label-sm--letter-spacing);
		font-weight: 500;
	}
	.admin-role {
		color: var(--accent-fg);
		background: var(--accent-bg);
	}
	.reset-link {
		margin-top: var(--space-4);
		padding: 14px;
		background: var(--surface-2);
		border: 1px solid var(--border);
		border-radius: var(--radius-xl);
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
		margin: var(--space-2) 0 10px;
	}
	.reset-link-row {
		display: flex;
		gap: var(--space-2);
	}
	/* The reset URL is the one field rendered in the mono face. Two-class selector so
	 * it outranks the shared input primitive's `md-body-md` role class. */
	:global(.reset-link-row .reset-link-input) {
		font-family: var(--font-mono);
		font-size: var(--text-body-sm);
		line-height: var(--text-body-sm--line-height);
		letter-spacing: var(--text-body-sm--letter-spacing);
	}
	.pagination {
		display: flex;
		align-items: center;
		flex-wrap: wrap;
		justify-content: space-between;
		gap: 10px;
		margin-top: 18px;
		color: var(--text-muted);
		font-size: var(--text-body-sm);
		line-height: var(--text-body-sm--line-height);
		letter-spacing: var(--text-body-sm--letter-spacing);
	}
	/* Two columns only once the settings pane is wide enough to give the users panel
	 * a usable second column: the 260px floor on the form panel leaves the list panel
	 * too narrow below this, and its rows used to spill past the dialog edge. */
	@media (max-width: 1024px) {
		.tab-content {
			padding: 20px var(--space-4) var(--space-7);
		}
		.admin-grid {
			grid-template-columns: 1fr;
		}
	}
</style>
