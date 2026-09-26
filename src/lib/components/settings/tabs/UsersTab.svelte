<script lang="ts">
	import { onDestroy, onMount } from 'svelte';
	import {
		ArrowLeft,
		Check,
		Copy,
		KeyRound,
		MoreHorizontal,
		Plus,
		Search,
		X
	} from '@lucide/svelte';
	import Skeleton from '$lib/components/Skeleton.svelte';
	import { authClient } from '$lib/client/auth';
	import { SvelteURLSearchParams } from 'svelte/reactivity';

	type Props = {
		isDirty?: boolean;
		discard?: () => void;
	};

	// eslint-disable-next-line no-useless-assignment
	let { isDirty = $bindable(false), discard = $bindable() }: Props = $props();

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
	let searchQuery = $state('');
	let showCreateForm = $state(false);
	let openMenuUserId = $state<string | null>(null);

	let page = $state(0);
	const pageSize = 10;
	let name = $state('');
	let email = $state('');
	let password = $state('');
	let role = $state<'user' | 'admin'>('user');

	let searchTimer: ReturnType<typeof setTimeout> | undefined;

	type ResetLink = { email: string; url: string; expiresAt: string };
	let resetLink = $state<ResetLink | null>(null);
	let resetLinkBusyId = $state('');
	let resetLinkError = $state('');
	let resetLinkCopied = $state(false);

	let formDirty = $derived(showCreateForm && Boolean(name.trim() || email.trim() || password));

	$effect(() => {
		isDirty = formDirty;
	});

	$effect(() => {
		discard = () => {
			name = '';
			email = '';
			password = '';
			role = 'user';
			error = '';
			showCreateForm = false;
		};
	});

	onDestroy(() => {
		clearTimeout(searchTimer);
		password = '';
	});

	let filteredUsers = $derived.by(() => {
		const q = searchQuery.trim().toLowerCase();
		if (!q) return users;
		return users.filter(
			(u) => u.name.toLowerCase().includes(q) || u.email.toLowerCase().includes(q)
		);
	});

	function messageFrom(errorValue: unknown, fallback: string) {
		return errorValue && typeof errorValue === 'object' && 'message' in errorValue
			? String(errorValue.message)
			: fallback;
	}

	async function loadUsers(query = searchQuery) {
		loading = true;
		error = '';
		try {
			const params = new SvelteURLSearchParams();
			if (query.trim()) {
				params.set('search', query.trim());
			}
			params.set('limit', String(pageSize));
			params.set('offset', String(page * pageSize));

			const response = await fetch(`/api/admin/users?${params.toString()}`);
			if (response.ok) {
				const data = await response.json();
				users = data.users ?? [];
				total = data.total ?? users.length;
			} else {
				const fallback = await authClient.admin.listUsers({
					query: {
						limit: pageSize,
						offset: page * pageSize,
						sortBy: 'createdAt',
						sortDirection: 'asc'
					}
				});
				if (fallback.error) {
					error = messageFrom(fallback.error, 'Could not load users.');
					return;
				}
				users = fallback.data?.users ?? [];
				total = fallback.data?.total ?? users.length;
			}
		} catch (value) {
			error = messageFrom(value, 'Could not load users.');
		} finally {
			loading = false;
		}
	}

	function onSearchInput(e: Event) {
		const target = e.target as HTMLInputElement;
		searchQuery = target.value;
		clearTimeout(searchTimer);
		searchTimer = setTimeout(() => {
			page = 0;
			loadUsers(searchQuery);
		}, 250);
	}

	function abandonCreateForm() {
		if (formDirty) {
			if (!window.confirm('Discard unsaved changes?')) return;
		}
		name = '';
		email = '';
		password = '';
		role = 'user';
		error = '';
		showCreateForm = false;
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
			showCreateForm = false;
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

<svelte:window
	onclick={() => {
		openMenuUserId = null;
	}}
	onkeydown={(e) => {
		if (e.key === 'Escape') openMenuUserId = null;
	}}
/>

<div class="tab-pane">
	{#if showCreateForm}
		<!-- Separate Create Account Form (Screen 13 requirement) -->
		<div class="create-user-view">
			<div class="editor-header">
				<button type="button" class="back-button" onclick={abandonCreateForm}>
					<ArrowLeft size={16} />
					<span>Users</span>
				</button>
				<h1 class="editor-title">Create account</h1>
				<p class="editor-subtitle">
					Users receive access immediately with the initial password you provide.
				</p>
			</div>

			<form
				class="create-form"
				onsubmit={(e) => {
					e.preventDefault();
					createUser();
				}}
			>
				<div class="form-field">
					<label for="new-user-name">Name</label>
					<input
						id="new-user-name"
						type="text"
						bind:value={name}
						placeholder="Admin"
						autocomplete="name"
						required
					/>
				</div>

				<div class="form-field">
					<label for="new-user-email">Email</label>
					<input
						id="new-user-email"
						type="email"
						bind:value={email}
						placeholder="user@example.com"
						autocomplete="email"
						required
					/>
				</div>

				<div class="form-field">
					<label for="new-user-password">Initial password</label>
					<input
						id="new-user-password"
						type="password"
						minlength={8}
						bind:value={password}
						placeholder="At least 8 characters"
						autocomplete="new-password"
						required
					/>
				</div>

				<div class="form-field">
					<label for="new-user-role">Role</label>
					<div class="select-wrapper">
						<select id="new-user-role" bind:value={role}>
							<option value="user">User</option>
							<option value="admin">Admin</option>
						</select>
					</div>
				</div>

				{#if error}
					<div class="message error" role="alert">{error}</div>
				{/if}

				<div class="form-actions">
					<button type="button" class="cancel-btn" onclick={abandonCreateForm}> Cancel </button>
					<button type="submit" class="create-btn" disabled={saving}>
						{saving ? 'Creating…' : 'Create account'}
					</button>
				</div>
			</form>
		</div>
	{:else}
		<!-- Screen 13: Users List View -->
		<div class="users-view">
			<div class="view-header">
				<div class="title-group">
					<h1 class="view-title">Users</h1>
					<p class="view-subtitle">Manage workspace accounts and access.</p>
				</div>
				<button
					type="button"
					class="create-account-btn"
					onclick={() => {
						showCreateForm = true;
						error = '';
						success = '';
					}}
				>
					<Plus size={15} />
					<span>Create account</span>
				</button>
			</div>

			{#if success}
				<div class="message success" role="status">{success}</div>
			{/if}
			{#if error}
				<div class="message error" role="alert">{error}</div>
			{/if}

			<!-- Search bar -->
			<div class="search-bar">
				<Search size={15} />
				<input
					type="text"
					value={searchQuery}
					oninput={onSearchInput}
					placeholder="Search users"
					aria-label="Search users"
				/>
			</div>

			<!-- Users table/list -->
			<div class="users-table-container">
				<div class="table-header-row">
					<span class="col-name">Name</span>
					<span class="col-role">Role</span>
					<span class="col-actions">Actions</span>
				</div>

				{#if loading}
					<div class="skeleton-list">
						{#each [1, 2] as i (i)}
							<div class="skeleton-row">
								<Skeleton width="32px" height="32px" radius="50%" />
								<div class="skeleton-info">
									<Skeleton width="120px" height="13px" />
									<Skeleton width="180px" height="11px" />
								</div>
							</div>
						{/each}
					</div>
				{:else if filteredUsers.length === 0}
					<div class="empty-state">No users found.</div>
				{:else}
					<div class="user-rows">
						{#each filteredUsers as managedUser (managedUser.id)}
							<div class="user-row">
								<div class="user-profile">
									<div class="avatar-circle">
										{managedUser.name.slice(0, 1).toUpperCase()}
									</div>
									<div class="user-identity">
										<strong class="user-name">{managedUser.name}</strong>
										<span class="user-email">{managedUser.email}</span>
									</div>
								</div>

								<div class="user-role-cell">
									<span class="role-text">{managedUser.role === 'admin' ? 'Admin' : 'User'}</span>
								</div>

								<div class="user-actions-cell">
									<button
										type="button"
										class="reset-btn"
										onclick={() => createResetLink(managedUser)}
										disabled={resetLinkBusyId === managedUser.id}
									>
										{resetLinkBusyId === managedUser.id ? 'Creating…' : 'Reset link'}
									</button>
									<div class="menu-container">
										<button
											type="button"
											class="overflow-btn"
											title="User options"
											aria-label={`Options for ${managedUser.name}`}
											aria-haspopup="menu"
											aria-expanded={openMenuUserId === managedUser.id}
											onclick={(e) => {
												e.stopPropagation();
												openMenuUserId = openMenuUserId === managedUser.id ? null : managedUser.id;
											}}
										>
											<MoreHorizontal size={15} />
										</button>
										{#if openMenuUserId === managedUser.id}
											<div
												class="dropdown-menu"
												role="menu"
												aria-label={`Options for ${managedUser.name}`}
											>
												<button
													type="button"
													role="menuitem"
													class="dropdown-item"
													onclick={() => {
														openMenuUserId = null;
														createResetLink(managedUser);
													}}
												>
													<KeyRound size={14} />
													<span>Reset password link</span>
												</button>
												<button
													type="button"
													role="menuitem"
													class="dropdown-item"
													onclick={async () => {
														openMenuUserId = null;
														try {
															await navigator.clipboard.writeText(managedUser.email);
															success = `Copied ${managedUser.email} to clipboard`;
															setTimeout(() => {
																if (success) success = '';
															}, 3000);
														} catch {
															error = 'Could not copy email';
														}
													}}
												>
													<Copy size={14} />
													<span>Copy email</span>
												</button>
												<button
													type="button"
													role="menuitem"
													class="dropdown-item"
													onclick={async () => {
														openMenuUserId = null;
														try {
															await navigator.clipboard.writeText(managedUser.id);
															success = 'Copied user ID to clipboard';
															setTimeout(() => {
																if (success) success = '';
															}, 3000);
														} catch {
															error = 'Could not copy user ID';
														}
													}}
												>
													<Copy size={14} />
													<span>Copy user ID</span>
												</button>
											</div>
										{/if}
									</div>
								</div>
							</div>
						{/each}
					</div>
				{/if}
			</div>

			<!-- Reset Link Modal / Card -->
			{#if resetLink}
				<div class="reset-link-card">
					<div class="reset-link-header">
						<div class="reset-link-title">
							<KeyRound size={15} />
							<strong>Reset link for {resetLink.email}</strong>
						</div>
						<button
							type="button"
							class="close-reset-btn"
							onclick={() => (resetLink = null)}
							aria-label="Close reset link"
						>
							<X size={15} />
						</button>
					</div>
					<p class="reset-link-note">
						Give it to the user privately. It works once and expires at
						{new Date(resetLink.expiresAt).toLocaleTimeString()}.
					</p>
					<div class="reset-link-row">
						<input
							type="text"
							readonly
							value={resetLink.url}
							class="reset-link-input"
							aria-label="Password reset link"
						/>
						<button type="button" class="copy-btn" onclick={copyResetLink}>
							{#if resetLinkCopied}
								<Check size={14} />
								<span>Copied</span>
							{:else}
								<Copy size={14} />
								<span>Copy</span>
							{/if}
						</button>
					</div>
					{#if resetLinkError}
						<p class="reset-error">{resetLinkError}</p>
					{/if}
				</div>
			{/if}

			<!-- Footnote / summary -->
			<div class="users-summary">
				<span>{filteredUsers.length} user{filteredUsers.length === 1 ? '' : 's'}</span>
			</div>
			<div class="users-footnote">New accounts can sign in with their initial password.</div>

			<!-- Pagination if needed -->
			{#if pageCount > 1}
				<div class="pagination">
					<button
						type="button"
						class="page-btn"
						onclick={() => {
							page -= 1;
							loadUsers();
						}}
						disabled={page === 0 || loading}
					>
						Previous
					</button>
					<span class="page-info">Page {page + 1} of {pageCount}</span>
					<button
						type="button"
						class="page-btn"
						onclick={() => {
							page += 1;
							loadUsers();
						}}
						disabled={page + 1 >= pageCount || loading}
					>
						Next
					</button>
				</div>
			{/if}
		</div>
	{/if}
</div>

<style>
	.tab-pane {
		padding: 28px 32px 36px;
		color: #ececee;
		font-family: var(--font-body);
	}
	.view-header {
		display: flex;
		align-items: flex-start;
		justify-content: space-between;
		gap: 16px;
		margin-bottom: 20px;
		padding-right: 40px;
	}
	.view-title {
		margin: 0;
		font-size: 22px;
		font-weight: 600;
		color: #ececee;
		letter-spacing: -0.01em;
	}
	.view-subtitle {
		margin: 4px 0 0;
		font-size: 13px;
		color: #a1a1aa;
	}
	.create-account-btn {
		display: inline-flex;
		align-items: center;
		gap: 6px;
		height: 36px;
		padding: 0 16px;
		background: #f4f4f5;
		border: 0;
		border-radius: 10px;
		color: #18181b;
		font-size: 13px;
		font-weight: 500;
		cursor: pointer;
		white-space: nowrap;
		transition: background-color var(--duration-short2) var(--ease-standard);
	}
	.create-account-btn:hover {
		background: #e4e4e7;
	}
	.message {
		margin-bottom: 14px;
		padding: 10px 14px;
		border-radius: 10px;
		font-size: 13px;
	}
	.message.success {
		background: #1d271f;
		border: 1px solid #28442d;
		color: #4ade80;
	}
	.message.error {
		background: #2b1a19;
		border: 1px solid #4d2321;
		color: #f87171;
	}
	.search-bar {
		display: flex;
		align-items: center;
		gap: 10px;
		height: 38px;
		padding: 0 12px;
		background: #151517;
		border: 1px solid #2c2c30;
		border-radius: 10px;
		color: #71717a;
		margin-bottom: 16px;
		transition: border-color var(--duration-short2) var(--ease-standard);
	}
	.search-bar:focus-within {
		border-color: #3f3f45;
	}
	.search-bar input {
		flex: 1;
		border: 0;
		background: transparent;
		color: #ececee;
		font-size: 13px;
		outline: none;
	}
	.search-bar input::placeholder {
		color: #71717a;
	}
	.users-table-container {
		display: flex;
		flex-direction: column;
		background: #18181b;
		border: 1px solid #2c2c30;
		border-radius: 14px;
		overflow: hidden;
	}
	.table-header-row {
		display: grid;
		grid-template-columns: minmax(0, 1fr) 110px 140px;
		align-items: center;
		padding: 10px 16px;
		background: #1d1d20;
		border-bottom: 1px solid #252528;
		font-size: 12px;
		color: #71717a;
	}
	.col-actions {
		text-align: right;
	}
	.user-rows {
		display: flex;
		flex-direction: column;
	}
	.user-row {
		display: grid;
		grid-template-columns: minmax(0, 1fr) 110px 140px;
		align-items: center;
		padding: 12px 16px;
		border-bottom: 1px solid #222226;
		transition: background-color var(--duration-short2) var(--ease-standard);
	}
	.user-row:last-child {
		border-bottom: none;
	}
	.user-row:hover {
		background: #1e1e22;
	}
	.user-profile {
		display: flex;
		align-items: center;
		gap: 12px;
		min-width: 0;
	}
	.avatar-circle {
		display: flex;
		align-items: center;
		justify-content: center;
		width: 32px;
		height: 32px;
		border-radius: 50%;
		background: #f4f4f5;
		color: #18181b;
		font-weight: 600;
		font-size: 13px;
		flex-shrink: 0;
	}
	.user-identity {
		display: flex;
		flex-direction: column;
		gap: 2px;
		min-width: 0;
	}
	.user-name {
		font-size: 13.5px;
		font-weight: 500;
		color: #ececee;
	}
	.user-email {
		font-size: 12px;
		color: #71717a;
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
	}
	.user-role-cell {
		font-size: 13px;
		color: #ececee;
	}
	.user-actions-cell {
		display: flex;
		align-items: center;
		justify-content: flex-end;
		gap: 8px;
	}
	.reset-btn {
		height: 28px;
		padding: 0 10px;
		background: #26262b;
		border: 1px solid #34343a;
		border-radius: 6px;
		color: #ececee;
		font-size: 12px;
		font-weight: 500;
		cursor: pointer;
		white-space: nowrap;
		transition:
			background-color var(--duration-short2) var(--ease-standard),
			border-color var(--duration-short2) var(--ease-standard);
	}
	.reset-btn:hover:not(:disabled) {
		background: #2f2f35;
		border-color: #404046;
	}
	.reset-btn:disabled {
		opacity: 0.5;
		cursor: not-allowed;
	}
	.overflow-btn {
		display: flex;
		align-items: center;
		justify-content: center;
		width: 28px;
		height: 28px;
		background: transparent;
		border: 0;
		border-radius: 6px;
		color: #71717a;
		cursor: pointer;
		transition: color var(--duration-short2) var(--ease-standard);
	}
	.overflow-btn:hover {
		color: #ececee;
		background: #252528;
	}
	.menu-container {
		position: relative;
		display: inline-flex;
		align-items: center;
	}
	.dropdown-menu {
		position: absolute;
		top: calc(100% + 4px);
		right: 0;
		z-index: 50;
		min-width: 175px;
		padding: 5px;
		border-radius: 10px;
		background: #1c1c20;
		border: 1px solid #2c2c30;
		box-shadow: 0 10px 30px rgba(0, 0, 0, 0.5);
		display: flex;
		flex-direction: column;
		gap: 2px;
	}
	.dropdown-item {
		display: flex;
		align-items: center;
		gap: 8px;
		padding: 8px 10px;
		border: 0;
		border-radius: 6px;
		background: transparent;
		color: #ececee;
		font-size: 13px;
		font-family: inherit;
		text-align: left;
		cursor: pointer;
		transition: background var(--duration-short2) var(--ease-standard);
	}
	.dropdown-item:hover {
		background: #28282d;
	}
	.reset-link-card {
		margin-top: 16px;
		padding: 14px 16px;
		background: #1d1d20;
		border: 1px solid #2c2c30;
		border-radius: 12px;
		display: flex;
		flex-direction: column;
		gap: 8px;
	}
	.reset-link-header {
		display: flex;
		align-items: center;
		justify-content: space-between;
	}
	.reset-link-title {
		display: flex;
		align-items: center;
		gap: 8px;
		font-size: 13px;
		color: #ececee;
	}
	.close-reset-btn {
		background: transparent;
		border: 0;
		color: #71717a;
		cursor: pointer;
		padding: 2px;
	}
	.close-reset-btn:hover {
		color: #ececee;
	}
	.reset-link-note {
		margin: 0;
		font-size: 12px;
		color: #71717a;
	}
	.reset-link-row {
		display: flex;
		gap: 8px;
	}
	.reset-link-input {
		flex: 1;
		height: 36px;
		padding: 0 12px;
		background: #151517;
		border: 1px solid #2c2c30;
		border-radius: 8px;
		color: #ececee;
		font-family: var(--font-mono);
		font-size: 12px;
		outline: none;
	}
	.copy-btn {
		display: inline-flex;
		align-items: center;
		gap: 6px;
		height: 36px;
		padding: 0 14px;
		background: #26262b;
		border: 1px solid #34343a;
		border-radius: 8px;
		color: #ececee;
		font-size: 12px;
		font-weight: 500;
		cursor: pointer;
	}
	.copy-btn:hover {
		background: #2f2f35;
	}
	.reset-error {
		color: #f87171;
		font-size: 12px;
		margin: 2px 0 0;
	}
	.users-summary {
		margin-top: 14px;
		font-size: 12px;
		color: #71717a;
	}
	.users-footnote {
		margin-top: 10px;
		font-size: 12px;
		color: #71717a;
	}
	.pagination {
		display: flex;
		align-items: center;
		justify-content: space-between;
		margin-top: 16px;
		padding-top: 14px;
		border-top: 1px solid #222226;
	}
	.page-btn {
		height: 32px;
		padding: 0 14px;
		background: #26262b;
		border: 1px solid #34343a;
		border-radius: 8px;
		color: #ececee;
		font-size: 12px;
		cursor: pointer;
	}
	.page-btn:hover:not(:disabled) {
		background: #2f2f35;
	}
	.page-btn:disabled {
		opacity: 0.5;
		cursor: not-allowed;
	}
	.page-info {
		font-size: 12px;
		color: #71717a;
	}
	.skeleton-list {
		padding: 12px 16px;
		display: flex;
		flex-direction: column;
		gap: 12px;
	}
	.skeleton-row {
		display: flex;
		align-items: center;
		gap: 12px;
	}
	.skeleton-info {
		display: flex;
		flex-direction: column;
		gap: 6px;
	}
	.empty-state {
		padding: 32px;
		text-align: center;
		font-size: 13px;
		color: #71717a;
	}

	/* Separate Create User View */
	.create-user-view {
		display: flex;
		flex-direction: column;
		padding-right: 40px;
	}
	.editor-header {
		margin-bottom: 22px;
	}
	.back-button {
		display: inline-flex;
		align-items: center;
		gap: 6px;
		background: transparent;
		border: 0;
		color: #a1a1aa;
		font-size: 13px;
		font-weight: 500;
		cursor: pointer;
		padding: 0;
		margin-bottom: 12px;
	}
	.back-button:hover {
		color: #ececee;
	}
	.editor-title {
		margin: 0;
		font-size: 22px;
		font-weight: 600;
		color: #ececee;
		letter-spacing: -0.01em;
	}
	.editor-subtitle {
		margin: 4px 0 0;
		font-size: 13px;
		color: #71717a;
	}
	.create-form {
		display: flex;
		flex-direction: column;
		gap: 16px;
	}
	.form-field {
		display: flex;
		flex-direction: column;
		gap: 6px;
	}
	.form-field label {
		font-size: 13px;
		font-weight: 500;
		color: #a1a1aa;
	}
	.form-field input[type='text'],
	.form-field input[type='email'],
	.form-field input[type='password'],
	.select-wrapper select {
		width: 100%;
		height: 40px;
		padding: 0 12px;
		background: #151517;
		border: 1px solid #2c2c30;
		border-radius: 10px;
		color: #ececee;
		font-family: var(--font-body);
		font-size: 13px;
		outline: none;
	}
	.form-field input:focus,
	.select-wrapper select:focus {
		border-color: #3f3f45;
	}
	.form-field input::placeholder {
		color: #71717a;
	}
	.select-wrapper {
		position: relative;
	}
	.select-wrapper select {
		appearance: none;
		cursor: pointer;
		padding-right: 32px;
	}
	.select-wrapper::after {
		content: '';
		position: absolute;
		right: 14px;
		top: 50%;
		width: 8px;
		height: 8px;
		border-right: 1.5px solid #a1a1aa;
		border-bottom: 1.5px solid #a1a1aa;
		transform: translateY(-65%) rotate(45deg);
		pointer-events: none;
	}
	.form-actions {
		display: flex;
		align-items: center;
		justify-content: flex-end;
		gap: 10px;
		margin-top: 14px;
	}
	.cancel-btn {
		height: 38px;
		padding: 0 18px;
		background: #26262b;
		border: 1px solid #34343a;
		border-radius: 10px;
		color: #ececee;
		font-size: 13px;
		font-weight: 500;
		cursor: pointer;
	}
	.cancel-btn:hover {
		background: #2f2f35;
	}
	.create-btn {
		height: 38px;
		padding: 0 18px;
		background: #f4f4f5;
		border: 0;
		border-radius: 10px;
		color: #18181b;
		font-size: 13px;
		font-weight: 500;
		cursor: pointer;
	}
	.create-btn:hover:not(:disabled) {
		background: #e4e4e7;
	}
	.create-btn:disabled {
		opacity: 0.5;
		cursor: not-allowed;
	}

	@media (max-width: 760px) {
		.tab-pane {
			padding: 16px;
		}
		.view-header {
			padding-right: 0;
		}
		.table-header-row {
			display: none;
		}
		.user-row {
			grid-template-columns: 1fr;
			gap: 10px;
		}
		.user-actions-cell {
			justify-content: flex-start;
		}
		.create-user-view {
			padding-right: 0;
		}
	}
</style>
