<script lang="ts">
	import { onMount } from 'svelte';
	import { resolve } from '$app/paths';
	import {
		ArrowUpRight,
		FolderKanban,
		Globe,
		Grid2X2,
		List,
		LogOut,
		MessageSquare,
		PanelLeft,
		Plus,
		Search,
		Settings,
		Sparkles,
		User,
		X
	} from '@lucide/svelte';
	import ThemeToggle from '$lib/components/ThemeToggle.svelte';
	import { authClient } from '$lib/client/auth';
	import { sidebar } from '$lib/client/sidebar.svelte';

	type Project = {
		id: string;
		name: string;
		description: string;
		instructions?: string | null;
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
	let newInstructions = $state('');
	let creating = $state(false);
	let user = $state<{ name: string; role?: string | null } | null>(null);
	let loading = $state(true);
	let projects = $state<Project[]>([]);
	let filteredProjects = $derived(
		projects.filter((project) =>
			`${project.name} ${project.description}`.toLowerCase().includes(query.trim().toLowerCase())
		)
	);

	function notify(v: string) {
		toast = v;
		setTimeout(() => (toast = ''), 1600);
	}

	async function loadProjects() {
		const response = await fetch('/api/projects');
		if (!response.ok) throw new Error('Could not load projects');
		const data = await response.json();
		projects = (data.projects ?? []).map((project: Project) => ({
			...project,
			fileCount: project.fileCount ?? 0,
			chatCount: project.chatCount ?? 0
		}));
	}

	onMount(async () => {
		try {
			const sessionResponse = await authClient.getSession();
			if (sessionResponse.data) user = sessionResponse.data.user ?? null;
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
				body: JSON.stringify({
					name: newName.trim(),
					description: newDescription.trim(),
					instructions: newInstructions.trim()
				})
			});
			if (!response.ok)
				throw new Error((await response.json()).error?.message ?? 'Could not create project');
			newName = '';
			newDescription = '';
			newInstructions = '';
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
		await authClient.signOut();
		window.location.href = '/login';
	}

	function formatDate(iso: string) {
		return new Date(iso).toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
	}
</script>

<svelte:head><title>Mimin WebUI | Projects</title></svelte:head>
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
			<a class="nav-item active" href={resolve('/projects')}
				><FolderKanban size={16} /> Projects <span class="nav-count">{projects.length}</span></a
			>
			{#if user?.role === 'admin'}<a class="nav-item" href={resolve('/admin/users')}
					><User size={16} /> Users</a
				>{/if}
			<div class="nav-label projects-label">Preferences</div>
			<a class="nav-item" href={resolve('/settings')}><Settings size={16} /> Models</a>
			<a class="nav-item" href={resolve('/settings/web-search')}><Globe size={16} /> Web Search</a>
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
				<div class="breadcrumb"><strong>Projects</strong></div>
			</div>
			<div class="top-actions">
				<ThemeToggle /><span class="avatar avatar-top">{user?.name?.[0]?.toUpperCase() ?? 'F'}</span
				>
			</div>
		</header>
		<div class="projects-wrap">
			<div class="page-heading">
				<div>
					<h1>Projects</h1>
					<p>Persistent context for the work you return to.</p>
				</div>
				<button class="button primary" onclick={() => (showCreate = true)}
					><Plus size={16} /> New project</button
				>
			</div>
			<div class="toolbar">
				<span>{projects.length} {projects.length === 1 ? 'project' : 'projects'}</span>
				<div class="toolbar-right">
					<div class="search-field">
						<Search size={15} aria-hidden="true" /><input
							bind:value={query}
							aria-label="Search projects"
							placeholder="Search projects..."
						/>
					</div>
					<button
						class:chosen={view === 'grid'}
						class="view-button"
						aria-label="Grid view"
						aria-pressed={view === 'grid'}
						title="Grid view"
						onclick={() => (view = 'grid')}><Grid2X2 size={16} /></button
					>
					<button
						class:chosen={view === 'list'}
						class="view-button"
						aria-label="List view"
						aria-pressed={view === 'list'}
						title="List view"
						onclick={() => (view = 'list')}><List size={16} /></button
					>
				</div>
			</div>
			{#if loading}
				<div class="empty-state" role="status">Loading projects...</div>
			{:else if projects.length === 0}
				<div class="empty-state">
					No projects yet. Create your first project to give the agent persistent context.
				</div>
			{:else if filteredProjects.length === 0}
				<div class="empty-state">No projects match “{query}”.</div>
			{/if}
			{#if !loading}
				<div
					class:grid-view={view === 'grid'}
					class:list-view={view === 'list'}
					class="project-grid"
				>
					{#each filteredProjects as project (project.id)}
						<a class="project-card" href={resolve(`/projects/${project.id}`)}>
							<div class="card-top"><span class="card-icon"><FolderKanban size={18} /></span></div>
							<h2>{project.name}</h2>
							<p>{project.description || 'No description yet.'}</p>
							<div class="card-footer">
								<span
									>Context · {project.fileCount ?? 0} files · {project.chatCount ?? 0} chats</span
								>
								<span>Updated {formatDate(project.updatedAt)}</span>
							</div>
							<span class="card-arrow"><ArrowUpRight size={17} /></span>
						</a>
					{/each}
					{#if !query.trim()}
						<button class="empty-card" onclick={() => (showCreate = true)}
							><Plus size={19} /><strong>Create a new project</strong><span
								>Give your agent persistent context</span
							></button
						>
					{/if}
				</div>
			{/if}
		</div>
	</main>
</div>
{#if showCreate}
	<div
		class="modal-backdrop"
		role="dialog"
		aria-modal="true"
		aria-labelledby="create-project-title"
		tabindex="-1"
		onclick={(event) => event.target === event.currentTarget && (showCreate = false)}
		onkeydown={(event) => event.key === 'Escape' && (showCreate = false)}
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
					<h2 id="create-project-title">Create a project</h2>
				</div>
				<button
					type="button"
					class="icon-button"
					aria-label="Close"
					title="Close dialog"
					onclick={() => (showCreate = false)}><X size={18} /></button
				>
			</div>
			<label
				>Project name<input
					bind:value={newName}
					maxlength="120"
					required
					placeholder="e.g. Product launch"
				/></label
			>
			<label
				>Description<textarea
					maxlength="2000"
					bind:value={newDescription}
					placeholder="What will you work on here?"></textarea></label
			>
			<label
				>Instructions<textarea
					maxlength="10000"
					bind:value={newInstructions}
					placeholder="How should the agent help with this project?"></textarea></label
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
{#if toast}<div class="toast" role="status" aria-live="polite">{toast}</div>{/if}

<svelte:window onkeydown={(event) => event.key === 'Escape' && (showCreate = false)} />

<style>
	.projects-wrap {
		max-width: 1050px;
		margin: auto;
		padding: clamp(32px, 6vh, 56px) 35px 75px;
	}
	.page-heading {
		display: flex;
		align-items: flex-end;
		justify-content: space-between;
		border-bottom: 1px solid var(--border);
		padding-bottom: 30px;
	}
	.page-heading h1 {
		margin: 0 0 6px;
		font-family: var(--font-body);
		font-size: var(--text-2xl);
		font-weight: 600;
		line-height: 1.2;
		letter-spacing: -0.025em;
		color: var(--text-strong);
	}
	.page-heading p {
		margin: 0;
		color: var(--text-muted);
		font-size: var(--text-sm);
		line-height: 1.5;
	}
	.button {
		display: inline-flex;
		align-items: center;
		gap: 8px;
		min-height: 38px;
		padding: 8px 13px;
		border-radius: 6px;
		border: 1px solid var(--border-strong);
		background: var(--surface);
		color: var(--text-body);
		font-family: var(--font-body);
		font-size: var(--text-sm);
		font-weight: 500;
		transition: 0.18s ease;
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
		padding: 20px 0;
		color: var(--text-dim);
		font-size: var(--text-sm);
	}
	.toolbar-right {
		display: flex;
		gap: 6px;
	}
	.search-field {
		display: flex;
		align-items: center;
		gap: 8px;
		width: 220px;
		min-height: 38px;
		padding: 7px 10px;
		background: var(--surface);
		border: 1px solid var(--border);
		border-radius: 6px;
		color: var(--text-dim);
	}
	.search-field input {
		min-width: 0;
		width: 100%;
		border: 0;
		outline: 0;
		color: var(--text-strong);
		font-family: var(--font-body);
		font-size: var(--text-sm);
		background: transparent;
	}
	.view-button {
		display: grid;
		place-items: center;
		width: 38px;
		height: 38px;
		border: 1px solid var(--border);
		background: var(--surface);
		color: var(--text-faint);
		border-radius: 6px;
	}
	.view-button.chosen,
	.view-button:hover {
		color: var(--text-body);
		background: var(--surface-hover);
	}
	.empty-state {
		text-align: center;
		color: var(--text-dim);
		font-size: var(--text-sm);
		padding: 40px 0;
		line-height: 1.5;
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
		min-height: 220px;
		padding: 18px;
		text-align: left;
		border: 1px solid var(--border);
		border-radius: 10px;
		background: var(--surface);
		transition: 0.18s ease;
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
		margin: 20px 0 6px;
		font-family: var(--font-body);
		font-size: var(--text-base);
		font-weight: 600;
		letter-spacing: -0.015em;
		color: var(--text-strong);
	}
	.project-card p {
		min-height: 52px;
		margin: 0;
		color: var(--text-muted);
		font-size: var(--text-sm);
		line-height: 1.55;
	}
	.card-footer {
		display: flex;
		justify-content: space-between;
		gap: 6px;
		margin-top: 18px;
		padding-top: 12px;
		border-top: 1px solid var(--border);
		color: var(--text-dim);
		font-size: var(--text-xs);
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
		color: var(--text-strong);
		font-size: var(--text-sm);
		font-weight: 500;
	}
	.empty-card span {
		font-size: var(--text-xs);
		color: var(--text-dim);
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
		padding: 24px;
		background: var(--surface);
		border: 1px solid var(--border-strong);
		border-radius: 12px;
		box-shadow: 0 20px 50px var(--shadow);
	}
	.modal-head {
		display: flex;
		align-items: flex-start;
		justify-content: space-between;
		gap: 16px;
	}
	.modal h2 {
		margin: 0 0 16px;
		font-family: var(--font-body);
		font-size: var(--text-lg);
		font-weight: 600;
		line-height: 1.3;
		letter-spacing: -0.015em;
		color: var(--text-strong);
	}
	.modal label {
		display: block;
		margin-top: 14px;
		color: var(--text-muted);
		font-size: var(--text-xs);
		font-weight: 500;
	}
	.modal input,
	.modal textarea {
		display: block;
		width: 100%;
		margin-top: 6px;
		padding: 8px 11px;
		border: 1px solid var(--input-border);
		border-radius: 6px;
		outline: 0;
		font-family: var(--font-body);
		font-size: var(--text-sm);
		color: var(--text-strong);
		background: var(--surface);
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
		font-size: var(--text-sm);
		font-weight: 500;
		z-index: 50;
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
		.page-heading .button {
			width: 100%;
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
			align-items: center;
		}
		.toolbar-right .search-field {
			flex: 1;
		}
	}
</style>
