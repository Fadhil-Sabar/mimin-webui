<script lang="ts">
	import { onMount } from 'svelte';
	import { resolve } from '$app/paths';
	import {
		ArrowUpRight,
		FolderKanban,
		Grid2X2,
		List,
		LogOut,
		MessageSquare,
		Plus,
		Search,
		Settings,
		Sparkles
	} from '@lucide/svelte';
	import ThemeToggle from '$lib/components/ThemeToggle.svelte';

	type Project = {
		id: string;
		name: string;
		description: string;
		updatedAt: string;
		fileCount?: number;
		chatCount?: number;
	};

	let view = $state<'grid' | 'list'>('grid');
	let toast = $state('');
	let query = $state('');
	let showCreate = $state(false);
	let newName = $state('');
	let newDescription = $state('');
	let creating = $state(false);
	let user = $state<{ name: string } | null>(null);
	let loading = $state(true);
	let projects = $state<Project[]>([]);

	function notify(v: string) {
		toast = v;
		setTimeout(() => (toast = ''), 1600);
	}

	async function loadProjects() {
		const response = await fetch('/api/projects');
		if (!response.ok) throw new Error('Could not load projects');
		const data = await response.json();
		projects = await Promise.all(
			(data.projects ?? []).map(async (project: Project) => {
				const detail = await fetch(`/api/projects/${project.id}`)
					.then((r) => (r.ok ? r.json() : null))
					.catch(() => null);
				return {
					...project,
					fileCount: detail?.files?.length ?? 0,
					chatCount: detail?.conversations?.length ?? 0
				};
			})
		);
	}

	onMount(async () => {
		try {
			const sessionResponse = await fetch('/api/auth/session');
			if (sessionResponse.ok) user = (await sessionResponse.json()).user ?? null;
		} catch {
			/* ignore */
		}
		try {
			await loadProjects();
		} catch (error) {
			notify(error instanceof Error ? error.message : 'Could not load projects');
		} finally {
			loading = false;
		}
	});

	async function createProject() {
		if (!newName.trim()) {
			notify('Project name is required');
			return;
		}
		creating = true;
		try {
			const response = await fetch('/api/projects', {
				method: 'POST',
				headers: { 'content-type': 'application/json' },
				body: JSON.stringify({ name: newName.trim(), description: newDescription.trim() })
			});
			if (!response.ok)
				throw new Error((await response.json()).error?.message ?? 'Could not create project');
			newName = '';
			newDescription = '';
			showCreate = false;
			notify('Project created');
			await loadProjects();
		} catch (error) {
			notify(error instanceof Error ? error.message : 'Could not create project');
		} finally {
			creating = false;
		}
	}

	async function logout() {
		await fetch('/api/auth/logout', { method: 'POST' });
		window.location.href = '/login';
	}

	function formatDate(iso: string) {
		return new Date(iso).toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
	}
</script>

<svelte:head><title>Mimin WebUI | Projects</title></svelte:head>
<div class="app-shell">
	<aside class="sidebar">
		<div class="brand">
			<span class="brand-mark"><Sparkles size={13} /></span><span>solace</span><span
				class="brand-muted">/ agent</span
			>
		</div>
		<a class="new-chat" href={resolve('/chat')}><Plus size={16} /> New chat <kbd>⌘ K</kbd></a>
		<div class="sidebar-scroll">
			<div class="nav-label">Workspace</div>
			<a class="nav-item" href={resolve('/chat')}><MessageSquare size={16} /> Chat</a>
			<a class="nav-item active" href={resolve('/projects')}
				><FolderKanban size={16} /> Projects <span class="nav-count">{projects.length}</span></a
			>
			<div class="nav-label projects-label">Preferences</div>
			<a class="nav-item" href={resolve('/settings')}><Settings size={16} /> Providers</a>
			{#if projects.length > 0}
				<div class="nav-label projects-label">Your projects</div>
				{#each projects as project (project.id)}
					<a class="project-item" href={resolve(`/projects/${project.id}`)}
						><span class="project-dot"></span>{project.name}</a
					>
				{/each}
			{/if}
		</div>
		<div class="sidebar-bottom">
			<button class="nav-item" onclick={logout}><LogOut size={16} /> Log out</button>
			<div class="user-row">
				<span class="avatar">{user?.name?.[0]?.toUpperCase() ?? 'F'}</span><span
					><strong>{user?.name ?? 'Fadhil'}</strong><small>Personal workspace</small></span
				>
			</div>
		</div>
	</aside>
	<main class="main-content">
		<header class="topbar">
			<div class="breadcrumb"><strong>Projects</strong></div>
			<div class="top-actions">
				<ThemeToggle /><span class="avatar avatar-top">{user?.name?.[0]?.toUpperCase() ?? 'F'}</span
				>
			</div>
		</header>
		<div class="projects-wrap">
			<div class="page-heading">
				<div>
					<div class="eyebrow">WORKSPACE</div>
					<h1>Projects</h1>
					<p>Persistent context for the work you return to.</p>
				</div>
				<button class="button primary" onclick={() => (showCreate = true)}
					><Plus size={16} /> New project</button
				>
			</div>
			<div class="toolbar">
				<span>{projects.length} projects</span>
				<div class="toolbar-right">
					<button class="search-field"
						><Search size={15} /><input
							bind:value={query}
							placeholder="Search projects..."
						/></button
					>
					<button class:chosen={view === 'grid'} class="view-button" onclick={() => (view = 'grid')}
						><Grid2X2 size={16} /></button
					>
					<button class:chosen={view === 'list'} class="view-button" onclick={() => (view = 'list')}
						><List size={16} /></button
					>
				</div>
			</div>
			{#if loading}
				<div class="empty-state">Loading projects...</div>
			{:else if projects.length === 0}
				<div class="empty-state">
					No projects yet. Create your first project to give the agent persistent context.
				</div>
			{/if}
			<div class:grid-view={view === 'grid'} class:list-view={view === 'list'} class="project-grid">
				{#each projects.filter((p) => p.name
						.toLowerCase()
						.includes(query.toLowerCase())) as project (project.id)}
					<a class="project-card" href={resolve(`/projects/${project.id}`)}>
						<div class="card-top"><span class="card-icon"><FolderKanban size={18} /></span></div>
						<h2>{project.name}</h2>
						<p>{project.description || 'No description yet.'}</p>
						<div class="card-footer">
							<span>{project.fileCount ?? 0} files · {project.chatCount ?? 0} chats</span>
							<span>{formatDate(project.updatedAt)}</span>
						</div>
						<span class="card-arrow"><ArrowUpRight size={17} /></span>
					</a>
				{/each}
				<button class="empty-card" onclick={() => (showCreate = true)}
					><Plus size={19} /><strong>Create a new project</strong><span
						>Give your agent persistent context</span
					></button
				>
			</div>
		</div>
	</main>
</div>
{#if showCreate}
	<div
		class="modal-backdrop"
		role="presentation"
		onclick={(event) => event.target === event.currentTarget && (showCreate = false)}
	>
		<form
			class="modal"
			onsubmit={(event) => {
				event.preventDefault();
				createProject();
			}}
		>
			<div class="modal-head">
				<div>
					<div class="eyebrow">NEW WORKSPACE</div>
					<h2>Create a project</h2>
				</div>
				<button
					type="button"
					class="icon-button"
					aria-label="Close"
					onclick={() => (showCreate = false)}>×</button
				>
			</div>
			<label>Project name<input bind:value={newName} placeholder="e.g. Product launch" /></label>
			<label
				>Description<textarea bind:value={newDescription} placeholder="What will you work on here?"
				></textarea></label
			>
			<div class="modal-actions">
				<button type="button" class="button" onclick={() => (showCreate = false)}>Cancel</button
				><button type="submit" class="button primary" disabled={creating}
					>{creating ? 'Creating...' : 'Create project'}</button
				>
			</div>
		</form>
	</div>
{/if}
{#if toast}<div class="toast">{toast}</div>{/if}

<style>
	.projects-wrap {
		max-width: 1050px;
		margin: auto;
		padding: 43px 35px 75px;
	}
	.page-heading {
		display: flex;
		align-items: flex-end;
		justify-content: space-between;
		border-bottom: 1px solid var(--border);
		padding-bottom: 30px;
	}
	.page-heading h1 {
		margin: 7px 0 5px;
		font-size: 32px;
		letter-spacing: -0.06em;
	}
	.page-heading p {
		margin: 0;
		color: var(--text-muted);
	}
	.button {
		display: inline-flex;
		align-items: center;
		gap: 8px;
		padding: 9px 12px;
		border-radius: 6px;
		border: 1px solid var(--border-strong);
		background: var(--surface);
		color: var(--text-body);
	}
	.button.primary {
		color: var(--accent-fg);
		background: var(--accent-bg);
		border-color: var(--accent-bg);
	}
	.button:disabled {
		opacity: 0.6;
	}
	.toolbar {
		display: flex;
		align-items: center;
		justify-content: space-between;
		padding: 22px 0;
		color: var(--text-dim);
		font-size: 12px;
	}
	.toolbar-right {
		display: flex;
		gap: 6px;
	}
	.search-field {
		display: flex;
		align-items: center;
		gap: 7px;
		width: 220px;
		padding: 7px 9px;
		background: var(--surface);
		border: 1px solid var(--border);
		border-radius: 5px;
		color: var(--text-dim);
	}
	.search-field input {
		width: 100%;
		border: 0;
		outline: 0;
		color: var(--text-body);
		font-size: 12px;
	}
	.view-button {
		display: grid;
		place-items: center;
		width: 31px;
		border: 1px solid var(--border);
		background: var(--surface);
		color: var(--text-faint);
		border-radius: 5px;
	}
	.view-button.chosen,
	.view-button:hover {
		color: var(--text-body);
		background: var(--surface-hover);
	}
	.empty-state {
		text-align: center;
		color: var(--text-dim);
		font-size: 13px;
		padding: 40px 0;
	}
	.project-grid {
		display: grid;
		grid-template-columns: repeat(3, minmax(0, 1fr));
		gap: 13px;
	}
	.project-grid.list-view {
		grid-template-columns: 1fr;
	}
	.project-card,
	.empty-card {
		min-height: 235px;
		padding: 18px;
		text-align: left;
		border: 1px solid var(--border);
		border-radius: 9px;
		background: var(--surface);
		transition: 0.18s;
		text-decoration: none;
		color: inherit;
	}
	.project-card:hover {
		border-color: var(--text-dim);
		box-shadow: 0 8px 22px var(--shadow-soft);
		transform: translateY(-2px);
	}
	.card-top {
		display: flex;
		justify-content: space-between;
	}
	.card-icon {
		display: grid;
		place-items: center;
		width: 36px;
		height: 36px;
		border-radius: 8px;
		background: var(--surface-hover);
		color: var(--text-body);
	}
	.project-card h2 {
		margin: 25px 0 7px;
		font-size: 16px;
		letter-spacing: -0.03em;
	}
	.project-card p {
		min-height: 57px;
		margin: 0;
		color: var(--text-muted);
		font-size: 12px;
		line-height: 1.6;
	}
	.card-footer {
		display: flex;
		justify-content: space-between;
		gap: 6px;
		margin-top: 21px;
		padding-top: 13px;
		border-top: 1px solid var(--border);
		color: var(--text-dim);
		font-size: 11px;
	}
	.card-arrow {
		float: right;
		margin-top: -17px;
		color: var(--text-faint);
	}
	.empty-card {
		display: flex;
		flex-direction: column;
		align-items: center;
		justify-content: center;
		gap: 8px;
		color: var(--text-muted);
		border-style: dashed;
		background: transparent;
	}
	.empty-card strong {
		color: var(--text-body);
		font-size: 13px;
		font-weight: 500;
	}
	.empty-card span {
		font-size: 11px;
	}
	.modal-backdrop {
		position: fixed;
		inset: 0;
		display: grid;
		place-items: center;
		padding: 20px;
		background: var(--overlay);
		z-index: 10;
	}
	.modal {
		width: min(420px, 100%);
		padding: 22px;
		background: var(--surface);
		border: 1px solid var(--border-strong);
		border-radius: 10px;
		box-shadow: 0 20px 50px var(--shadow);
	}
	.modal-head {
		display: flex;
		justify-content: space-between;
	}
	.modal h2 {
		margin: 5px 0 20px;
		font-size: 22px;
		letter-spacing: -0.04em;
	}
	.modal label {
		display: block;
		margin-top: 14px;
		color: var(--text-body);
		font-size: 12px;
	}
	.modal input,
	.modal textarea {
		display: block;
		width: 100%;
		margin-top: 6px;
		padding: 10px;
		border: 1px solid var(--input-border);
		border-radius: 5px;
		outline: 0;
	}
	.modal textarea {
		min-height: 80px;
		resize: vertical;
	}
	.modal-actions {
		display: flex;
		justify-content: flex-end;
		gap: 8px;
		margin-top: 22px;
	}
	.toast {
		position: fixed;
		right: 24px;
		bottom: 24px;
		color: var(--accent-fg);
		background: var(--accent-bg);
		border-radius: 6px;
		padding: 10px 14px;
		font-size: 13px;
	}
	@media (max-width: 800px) {
		.projects-wrap {
			padding: 28px 18px;
		}
		.project-grid {
			grid-template-columns: 1fr 1fr;
		}
		.page-heading {
			align-items: flex-start;
			gap: 18px;
			flex-direction: column;
		}
	}
	@media (max-width: 540px) {
		.project-grid {
			grid-template-columns: 1fr;
		}
		.toolbar {
			align-items: flex-start;
			gap: 12px;
			flex-direction: column;
		}
		.search-field {
			width: 100%;
		}
		.toolbar-right {
			width: 100%;
		}
	}
</style>
