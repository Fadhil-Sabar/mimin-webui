<script lang="ts">
	import { onMount } from 'svelte';
	import {
		ArrowUpRight,
		FolderKanban,
		Grid2X2,
		List,
		Plus,
		Search,
		Settings2,
		Sparkles,
		MessageSquare
	} from '@lucide/svelte';
	let view = $state<'grid' | 'list'>('grid');
	let toast = $state('');
	let query = $state('');
	let showCreate = $state(false);
	let newName = $state('');
	let newDescription = $state('');
	let projects = $state([
		{
			name: 'Mimin Coding Agent',
			description:
				'Development workspace for designing and building a lightweight multi-agent coding system.',
			files: 4,
			chats: 12,
			updated: 'Today',
			tone: 'dark'
		},
		{
			name: 'Personal knowledge',
			description: 'Notes, references, and personal research collected in one place.',
			files: 18,
			chats: 34,
			updated: 'Yesterday',
			tone: 'light'
		},
		{
			name: 'Website redesign',
			description: 'Design exploration and implementation notes for the Solace web experience.',
			files: 7,
			chats: 8,
			updated: 'Aug 28',
			tone: 'mid'
		}
	]);
	function notify(v: string) {
		toast = v;
		setTimeout(() => (toast = ''), 1600);
	}
	onMount(async () => {
		try {
			const response = await fetch('/api/projects');
			if (!response.ok) return;
			const data = await response.json();
			if (data.projects?.length)
				projects = data.projects.map(
					(project: { name: string; description: string; updatedAt: string }) => ({
						...project,
						files: 0,
						chats: 0,
						updated: new Date(project.updatedAt).toLocaleDateString(),
						tone: 'light'
					})
				);
		} catch {
			/* keep the visual fallback while backend is not configured */
		}
	});
	function createProject() {
		if (!newName.trim()) {
			notify('Project name is required');
			return;
		}
		projects = [
			...projects,
			{
				name: newName.trim(),
				description: newDescription.trim() || 'A new AI workspace with persistent project context.',
				files: 0,
				chats: 0,
				updated: 'Just now',
				tone: 'light'
			}
		];
		newName = '';
		newDescription = '';
		showCreate = false;
		notify('Project created');
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
		<button class="new-chat" onclick={() => notify('New chat ready')}
			><Plus size={16} /> New chat <kbd>⌘ K</kbd></button
		>
		<div class="sidebar-scroll">
			<div class="nav-label">Workspace</div>
			<a class="nav-item" href="/chat"
				><MessageSquare size={16} /> Chat <span class="nav-count">12</span></a
			><a class="nav-item active" href="/projects"
				><FolderKanban size={16} /> Projects <span class="nav-count">3</span></a
			>
			<div class="nav-label projects-label">Your projects</div>
			<a class="project-item active-project" href="/projects/mimin-coding-agent"
				>Mimin Coding Agent</a
			><a class="project-item" href="/projects/personal-knowledge">Personal knowledge</a><a
				class="project-item"
				href="/projects/website-redesign">Website redesign</a
			>
		</div>
		<div class="sidebar-bottom">
			<button class="nav-item"><Settings2 size={16} /> Settings</button>
			<div class="user-row">
				<span class="avatar">F</span><span
					><strong>Fadhil</strong><small>Personal workspace</small></span
				>
			</div>
		</div>
	</aside>
	<main class="main-content">
		<header class="topbar">
			<div class="breadcrumb"><strong>Projects</strong></div>
			<div class="top-actions">
				<button class="icon-button" onclick={() => notify('Search opened')}
					><Search size={17} /></button
				><span class="avatar avatar-top">F</span>
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
					><button
						class:chosen={view === 'grid'}
						class="view-button"
						onclick={() => (view = 'grid')}><Grid2X2 size={16} /></button
					><button
						class:chosen={view === 'list'}
						class="view-button"
						onclick={() => (view = 'list')}><List size={16} /></button
					>
				</div>
			</div>
			<div class:grid-view={view === 'grid'} class:list-view={view === 'list'} class="project-grid">
				{#each projects.filter((p) => p.name
						.toLowerCase()
						.includes(query.toLowerCase())) as project}<a
						class="project-card"
						href="/projects/mimin-coding-agent"
						><div class="card-top">
							<span
								class:dark={project.tone === 'dark'}
								class:mid={project.tone === 'mid'}
								class="card-icon"><FolderKanban size={18} /></span
							><button
								class="card-menu"
								onclick={(e) => {
									e.preventDefault();
									notify('Project actions opened');
								}}>•••</button
							>
						</div>
						<h2>{project.name}</h2>
						<p>{project.description}</p>
						<div class="card-footer">
							<span>{project.files} files · {project.chats} chats</span><span
								>{project.updated}</span
							>
						</div>
						<span class="card-arrow"><ArrowUpRight size={17} /></span></a
					>{/each}<button class="empty-card" onclick={() => (showCreate = true)}
					><Plus size={19} /><strong>Create a new project</strong><span
						>Give your agent persistent context</span
					></button
				>
			</div>
		</div>
	</main>
</div>
{#if showCreate}<div
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
			<label>Project name<input bind:value={newName} placeholder="e.g. Product launch" /></label
			><label
				>Description<textarea bind:value={newDescription} placeholder="What will you work on here?"
				></textarea></label
			>
			<div class="modal-actions">
				<button type="button" class="button" onclick={() => (showCreate = false)}>Cancel</button
				><button type="submit" class="button primary">Create project</button>
			</div>
		</form>
	</div>{/if}{#if toast}<div class="toast">{toast}</div>{/if}

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
		border-bottom: 1px solid #e0e0dc;
		padding-bottom: 30px;
	}
	.page-heading h1 {
		margin: 7px 0 5px;
		font-size: 32px;
		letter-spacing: -0.06em;
	}
	.page-heading p {
		margin: 0;
		color: #888;
	}
	.button {
		display: inline-flex;
		align-items: center;
		gap: 8px;
		padding: 9px 12px;
		border-radius: 6px;
		border: 1px solid #d5d5d1;
		background: #fff;
		color: #555;
	}
	.button.primary {
		color: #fff;
		background: #181818;
		border-color: #181818;
	}
	.toolbar {
		display: flex;
		align-items: center;
		justify-content: space-between;
		padding: 22px 0;
		color: #999;
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
		background: white;
		border: 1px solid #deded9;
		border-radius: 5px;
		color: #999;
	}
	.search-field input {
		width: 100%;
		border: 0;
		outline: 0;
		color: #333;
		font-size: 12px;
	}
	.view-button {
		display: grid;
		place-items: center;
		width: 31px;
		border: 1px solid #deded9;
		background: white;
		color: #aaa;
		border-radius: 5px;
	}
	.view-button.chosen,
	.view-button:hover {
		color: #222;
		background: #f0f0ed;
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
		border: 1px solid #dfdfda;
		border-radius: 9px;
		background: white;
		transition: 0.18s;
		text-decoration: none;
		color: inherit;
	}
	.project-card:hover {
		border-color: #999;
		box-shadow: 0 8px 22px #0000000a;
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
		background: #f0f0ed;
		color: #555;
	}
	.card-icon.dark {
		color: #fff;
		background: #181818;
	}
	.card-icon.mid {
		background: #dddcd7;
	}
	.card-menu {
		border: 0;
		background: transparent;
		color: #aaa;
		letter-spacing: 2px;
	}
	.project-card h2 {
		margin: 25px 0 7px;
		font-size: 16px;
		letter-spacing: -0.03em;
	}
	.project-card p {
		min-height: 57px;
		margin: 0;
		color: #777;
		font-size: 12px;
		line-height: 1.6;
	}
	.card-footer {
		display: flex;
		justify-content: space-between;
		gap: 6px;
		margin-top: 21px;
		padding-top: 13px;
		border-top: 1px solid #eee;
		color: #999;
		font-size: 11px;
	}
	.card-arrow {
		float: right;
		margin-top: -17px;
		color: #aaa;
	}
	.empty-card {
		display: flex;
		flex-direction: column;
		align-items: center;
		justify-content: center;
		gap: 8px;
		color: #888;
		border-style: dashed;
		background: transparent;
	}
	.empty-card strong {
		color: #555;
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
		background: #1116;
		z-index: 10;
	}
	.modal {
		width: min(420px, 100%);
		padding: 22px;
		background: #fff;
		border: 1px solid #ddd;
		border-radius: 10px;
		box-shadow: 0 20px 50px #0002;
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
		color: #555;
		font-size: 12px;
	}
	.modal input,
	.modal textarea {
		display: block;
		width: 100%;
		margin-top: 6px;
		padding: 10px;
		border: 1px solid #d6d6d1;
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
		color: white;
		background: #181818;
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
