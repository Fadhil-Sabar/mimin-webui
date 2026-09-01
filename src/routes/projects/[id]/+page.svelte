<script lang="ts">
	import { onMount } from 'svelte';
	import { page } from '$app/state';
	import { resolve } from '$app/paths';
	import {
		Bot,
		ChevronRight,
		FileJson2,
		FileText,
		FolderKanban,
		LogOut,
		MessageSquare,
		PanelLeft,
		Plus,
		Search,
		Settings,
		Sparkles,
		Trash2,
		Upload,
		User
	} from '@lucide/svelte';
	import ThemeToggle from '$lib/components/ThemeToggle.svelte';
	import { authClient } from '$lib/client/auth';
	import { sidebar } from '$lib/client/sidebar.svelte';

	type Project = {
		id: string;
		name: string;
		description: string;
		instructions: string | null;
		updatedAt: string;
	};
	type ProjectFile = {
		id: string;
		filename: string;
		mimeType: string;
		sizeBytes: number;
		createdAt: string;
	};
	type Conversation = { id: string; title: string; model: string; updatedAt: string };

	let user = $state<{ name: string; role?: string | null } | null>(null);
	let project = $state<Project | null>(null);
	let files = $state<ProjectFile[]>([]);
	let conversations = $state<Conversation[]>([]);
	let loading = $state(true);
	let loadError = $state('');
	let toast = $state('');
	let uploading = $state(false);
	let dragActive = $state(false);
	let fileInput = $state<HTMLInputElement | undefined>(undefined);
	function notify(message: string) {
		toast = message;
		setTimeout(() => (toast = ''), 1800);
	}

	let projectId = $derived((page.params.id as string) ?? '');

	async function load() {
		const response = await fetch(`/api/projects/${projectId}`);
		if (!response.ok) throw new Error('Could not load project');
		const data = await response.json();
		if (!data.project) throw new Error('Project not found');
		project = data.project;
		files = data.files ?? [];
		conversations = data.conversations ?? [];
	}

	onMount(async () => {
		try {
			const sessionResponse = await authClient.getSession();
			if (sessionResponse.data) user = sessionResponse.data.user ?? null;
		} catch {
			/* ignore */
		}
		try {
			await load();
		} catch (error) {
			loadError = error instanceof Error ? error.message : 'Could not load project';
			notify(loadError);
		} finally {
			loading = false;
		}
	});

	async function uploadFiles(selected: FileList | null | undefined) {
		if (!selected || selected.length === 0) return;
		uploading = true;
		try {
			for (const file of Array.from(selected)) {
				const form = new FormData();
				form.set('file', file);
				const response = await fetch(`/api/projects/${projectId}/files`, {
					method: 'POST',
					body: form
				});
				if (!response.ok)
					throw new Error(
						(await response.json()).error?.message ?? `Could not upload ${file.name}`
					);
			}
			notify('Files uploaded');
			await load();
		} catch (error) {
			notify(error instanceof Error ? error.message : 'Upload failed');
		} finally {
			uploading = false;
			dragActive = false;
			if (fileInput) fileInput.value = '';
		}
	}

	function handleDragOver(event: DragEvent) {
		event.preventDefault();
		dragActive = true;
	}

	function handleDragLeave(event: DragEvent) {
		if (event.currentTarget === event.target) dragActive = false;
	}

	function handleDrop(event: DragEvent) {
		event.preventDefault();
		dragActive = false;
		void uploadFiles(event.dataTransfer?.files);
	}

	async function deleteFile(fileId: string) {
		try {
			const response = await fetch(`/api/projects/${projectId}/files/${fileId}`, {
				method: 'DELETE'
			});
			if (!response.ok) throw new Error('Could not delete file');
			notify('File deleted');
			await load();
		} catch (error) {
			notify(error instanceof Error ? error.message : 'Could not delete file');
		}
	}

	async function startChat() {
		try {
			const response = await fetch('/api/conversations', {
				method: 'POST',
				headers: { 'content-type': 'application/json' },
				body: JSON.stringify({ projectId })
			});
			if (!response.ok) throw new Error('Could not start chat');
			const conversation = (await response.json()).conversation;
			window.location.href = `/chat?id=${encodeURIComponent(conversation.id)}`;
		} catch (error) {
			notify(error instanceof Error ? error.message : 'Could not start chat');
		}
	}

	async function logout() {
		await authClient.signOut();
		window.location.href = '/login';
	}

	function formatSize(bytes: number) {
		return bytes > 1024 * 1024
			? `${(bytes / 1024 / 1024).toFixed(1)} MB`
			: `${Math.max(1, Math.round(bytes / 1024))} KB`;
	}
	function formatDate(iso: string) {
		return new Date(iso).toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
	}
</script>

<svelte:head><title>Mimin WebUI | {project?.name ?? 'Project'}</title></svelte:head>
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
			<a class="nav-item" href={resolve('/chat')}><MessageSquare size={16} /> Chat</a>
			<a class="nav-item active" href={resolve('/projects')}><FolderKanban size={16} /> Projects</a>
			{#if user?.role === 'admin'}<a class="nav-item" href={resolve('/admin/users')}><User size={16} /> Users</a>{/if}
			<div class="nav-label projects-label">Preferences</div>
			<a class="nav-item" href={resolve('/settings')}><Settings size={16} /> Models</a>
			{#if project}
				<div class="nav-label projects-label">Knowledge files</div>
				{#each files as file (file.id)}
					<span class="project-item file-item"
						><span class="project-dot"></span>{file.filename}</span
					>
				{/each}
				{#if files.length === 0}<span class="project-item file-item muted-item">No files yet</span
					>{/if}
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
				<div class="breadcrumb">
					<a href={resolve('/projects')}>Projects</a><ChevronRight size={14} /><strong
						>{project?.name ?? '...'}</strong
					>
				</div>
			</div>
			<div class="top-actions">
				<button
					class="icon-button"
					aria-label="Search project"
					title="Search project"
					onclick={() => notify('Search opened')}><Search size={17} /></button
				><ThemeToggle />
			</div>
		</header>
		<div class="page-wrap">
			{#if loading}
				<div class="empty-state" role="status">Loading project...</div>
			{:else if loadError}
				<div class="empty-state error-state" role="alert">
					<strong>Couldn’t open this project</strong>
					<span>{loadError}</span>
					<a href={resolve('/projects')}>Back to projects</a>
				</div>
			{:else if project}
				<section class="hero">
					<div>
						<div class="title-row">
							<div class="project-symbol"><Bot size={22} /></div>
							<div>
								<h1>{project.name}</h1>
								<p>{project.description || 'No description yet.'}</p>
							</div>
						</div>
					</div>
					<div class="hero-actions">
						<button class="button primary" onclick={startChat}
							><MessageSquare size={15} /> Start chat</button
						>
					</div>
				</section>
				<div class="stats">
					<div><strong>{files.length}</strong><span>Knowledge files</span></div>
					<div><strong>{conversations.length}</strong><span>Conversations</span></div>
					<div><strong>{formatDate(project.updatedAt)}</strong><span>Last updated</span></div>
					<div class="context">
						<span class="status-dot"></span><span>Project context active</span>
					</div>
				</div>

				<section class="section-block">
					<div class="section-heading">
						<div>
							<h2>Knowledge</h2>
							<p>Files available to the agent in this project.</p>
						</div>
					</div>
					<button
						class="upload-zone"
						class:drag-active={dragActive}
						aria-label="Upload knowledge files"
						onclick={() => fileInput?.click()}
						ondragover={handleDragOver}
						ondragleave={handleDragLeave}
						ondrop={handleDrop}
						disabled={uploading}
					>
						<Upload size={18} /><span
							><strong>{uploading ? 'Uploading...' : 'Drop files here or browse'}</strong><small
								>PDF, Markdown, JSON, TXT · up to 25 MB</small
							></span
						>
					</button>
					<input
						class="hidden-input"
						type="file"
						multiple
						accept=".txt,.md,.json,.pdf"
						bind:this={fileInput}
						onchange={(e) => uploadFiles(e.currentTarget.files)}
					/>
					{#if files.length > 0}
						<div class="file-list">
							{#each files as file (file.id)}
								<div class="file-row">
									<div class="file-icon">
										{#if file.mimeType === 'application/json'}<FileJson2
												size={16}
											/>{:else}<FileText size={16} />{/if}
									</div>
									<div class="file-name">
										<strong>{file.filename}</strong><small>{file.mimeType}</small>
									</div>
									<span class="muted desktop-only">{formatSize(file.sizeBytes)}</span>
									<span class="muted desktop-only">{formatDate(file.createdAt)}</span>
									<button
										class="row-menu"
										aria-label={`Delete ${file.filename}`}
										onclick={() => deleteFile(file.id)}><Trash2 size={16} /></button
									>
								</div>
							{/each}
						</div>
					{/if}
				</section>

				<section class="section-block conversations">
					<div class="section-heading">
						<div>
							<h2>Conversations</h2>
							<p>Continue work from previous project sessions.</p>
						</div>
						<button class="button primary" onclick={startChat}><Plus size={15} /> New chat</button>
					</div>
					<div class="conversation-list">
						{#each conversations as conversation (conversation.id)}
							<a
								class="conversation-row"
								href={resolve(`/chat?id=${encodeURIComponent(conversation.id)}`)}
							>
								<div class="conversation-icon"><MessageSquare size={16} /></div>
								<div class="conversation-name">
									<strong>{conversation.title}</strong><small>{conversation.model}</small>
								</div>
								<span class="muted">{formatDate(conversation.updatedAt)}</span>
							</a>
						{/each}
						{#if conversations.length === 0}<div class="empty-state conversation-empty">
								No conversations yet.
							</div>{/if}
					</div>
				</section>
			{/if}
		</div>
	</main>
</div>
{#if toast}<div class="toast" role="status" aria-live="polite">{toast}</div>{/if}

<style>
	.page-wrap {
		max-width: 970px;
		margin: auto;
		padding: clamp(32px, 6vh, 56px) 35px 70px;
	}
	.empty-state {
		text-align: center;
		color: var(--text-dim);
		font-size: 13px;
		padding: 34px 0;
		line-height: 1.5;
	}
	.error-state strong,
	.error-state span,
	.error-state a {
		display: block;
	}
	.error-state strong {
		color: var(--text-body);
		font-size: var(--text-base);
	}
	.error-state span {
		margin-top: 5px;
	}
	.error-state a {
		margin-top: 14px;
		color: var(--text-body);
		text-decoration: underline;
		text-underline-offset: 3px;
	}
	.hero {
		display: flex;
		align-items: flex-start;
		justify-content: space-between;
		gap: 28px;
		padding-bottom: 28px;
		border-bottom: 1px solid var(--border);
	}
	.title-row {
		display: flex;
		gap: 13px;
	}
	.project-symbol {
		display: grid;
		place-items: center;
		width: 44px;
		height: 44px;
		flex: 0 0 auto;
		color: var(--text-body);
		background: var(--surface-3);
		border: 1px solid var(--border);
		border-radius: 10px;
	}
	.hero h1 {
		margin: 0 0 8px;
		font-family: var(--font-display);
		font-size: 30px;
		line-height: 1.1;
		letter-spacing: -0.03em;
	}
	.hero p {
		max-width: 560px;
		margin: 0;
		color: var(--text-muted);
	}
	.hero-actions {
		display: flex;
		gap: 8px;
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
		white-space: nowrap;
		transition: 0.18s ease;
	}
	.button.primary {
		color: var(--accent-fg);
		background: var(--accent-bg);
		border-color: var(--accent-bg);
	}
	.button:hover {
		color: var(--text);
		border-color: var(--text-dim);
	}
	.button.primary:hover {
		background: var(--accent-bg-hover);
		color: var(--accent-fg);
	}
	.stats {
		display: flex;
		align-items: center;
		gap: 35px;
		padding: 19px 0;
		border-bottom: 1px solid var(--border);
	}
	.stats strong,
	.stats span {
		display: block;
	}
	.stats strong {
		font-size: 17px;
		letter-spacing: -0.03em;
	}
	.stats span {
		color: var(--text-dim);
		font-size: 11px;
	}
	.stats .context {
		display: flex;
		align-items: center;
		gap: 7px;
		margin-left: auto;
		color: var(--status-ok-text);
	}
	.status-dot {
		width: 7px;
		height: 7px;
		background: var(--status-ok-dot);
		border-radius: 50%;
	}
	.section-block {
		padding-top: 31px;
	}
	.section-heading {
		display: flex;
		align-items: center;
		justify-content: space-between;
		gap: 15px;
		margin-bottom: 12px;
	}
	.section-heading h2 {
		margin: 0 0 3px;
		font-size: 16px;
		letter-spacing: -0.025em;
	}
	.section-heading p {
		margin: 0;
		color: var(--text-dim);
		font-size: 12px;
	}
	.upload-zone {
		display: flex;
		align-items: center;
		justify-content: center;
		gap: 11px;
		width: 100%;
		min-height: 76px;
		padding: 17px;
		color: var(--text-muted);
		background: var(--surface-subtle);
		border: 1px dashed var(--border-strong);
		border-radius: 7px;
		text-align: left;
		transition: 0.18s ease;
	}
	.upload-zone:hover {
		color: var(--text-body);
		border-color: var(--text-muted);
	}
	.upload-zone.drag-active {
		color: var(--text-body);
		background: var(--surface-3);
		border-color: var(--focus);
	}
	.upload-zone strong,
	.upload-zone small {
		display: block;
	}
	.upload-zone strong {
		color: var(--text-muted);
		font-size: 12px;
		font-weight: 500;
	}
	.upload-zone small {
		font-size: 11px;
	}
	.hidden-input {
		display: none;
	}
	.file-list,
	.conversation-list {
		overflow: hidden;
		background: var(--surface);
		border: 1px solid var(--border);
		border-radius: 10px;
	}
	.file-row,
	.conversation-row {
		display: grid;
		align-items: center;
		gap: 11px;
		min-height: 54px;
		width: 100%;
		padding: 12px 14px;
		border-bottom: 1px solid var(--border);
		text-align: left;
	}
	.file-row {
		grid-template-columns: 31px minmax(0, 1fr) 90px 90px 30px;
	}
	.conversation-row {
		grid-template-columns: 31px minmax(0, 1fr) 80px;
		color: inherit;
		text-decoration: none;
	}
	.file-row:last-child,
	.conversation-row:last-child {
		border-bottom: 0;
	}
	.file-row:hover,
	.conversation-row:hover {
		background: var(--surface-subtle);
	}
	.file-icon,
	.conversation-icon {
		display: grid;
		place-items: center;
		width: 28px;
		height: 29px;
		color: var(--text-muted);
		background: var(--surface-3);
		border: 1px solid var(--border);
		border-radius: 5px;
	}
	.conversation-icon {
		height: 28px;
		border-radius: 50%;
	}
	.file-name,
	.conversation-name {
		min-width: 0;
	}
	.file-name strong,
	.file-name small,
	.conversation-name strong,
	.conversation-name small {
		display: block;
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
	}
	.file-name strong,
	.conversation-name strong {
		font-size: 13px;
		font-weight: 550;
	}
	.file-name small,
	.conversation-name small {
		color: var(--text-dim);
		font-size: 11px;
	}
	.muted {
		color: var(--text-dim);
		font-size: 11px;
	}
	.row-menu {
		display: grid;
		place-items: center;
		color: var(--text-dim);
		background: transparent;
		border: 0;
	}
	.row-menu:hover {
		color: var(--danger-text);
	}
	.breadcrumb a {
		color: var(--text-dim);
		text-decoration: none;
	}
	.breadcrumb a:hover {
		color: var(--text-body);
	}
	.file-item {
		cursor: default;
	}
	.muted-item {
		color: var(--text-faint);
	}
	.toast {
		position: fixed;
		right: 24px;
		bottom: 24px;
		color: white;
		background: var(--accent-bg);
		border-radius: 6px;
		padding: 10px 14px;
		font-size: 13px;
	}
	@media (max-width: 760px) {
		.page-wrap {
			padding: 28px 18px 60px;
		}
		.hero {
			display: block;
		}
		.hero-actions {
			margin-top: 20px;
		}
		.stats {
			gap: 20px;
			flex-wrap: wrap;
		}
		.stats .context {
			width: 100%;
			margin-left: 0;
		}
		.file-row {
			grid-template-columns: 31px minmax(0, 1fr) 30px;
		}
		.desktop-only {
			display: none;
		}
	}
</style>
