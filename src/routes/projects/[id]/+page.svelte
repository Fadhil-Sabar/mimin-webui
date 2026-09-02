<script lang="ts">
	import { onMount, untrack } from 'svelte';
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
		Pencil,
		Plus,
		Search,
		Settings,
		Sparkles,
		Trash2,
		Upload,
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
		instructions: string | null;
		updatedAt: string;
	};
	type ProjectFile = {
		id: string;
		filename: string;
		mimeType: string;
		sizeBytes: number;
		createdAt: string;
		extractionStatus?: string | null;
		pageCount?: number | null;
		extractionError?: string | null;
		chunkCount?: number | null;
	};
	type Conversation = { id: string; title: string; model: string; updatedAt: string };
	type PageInfo = { page: number; pageSize: number; total: number; hasMore: boolean };
	type LoadOptions = {
		reset?: boolean;
		filesPage?: number;
		conversationsPage?: number;
		appendFiles?: boolean;
		appendConversations?: boolean;
		updateFiles?: boolean;
		updateConversations?: boolean;
	};

	let user = $state<{ name: string; role?: string | null } | null>(null);
	let project = $state<Project | null>(null);
	let files = $state<ProjectFile[]>([]);
	let conversations = $state<Conversation[]>([]);
	let loading = $state(true);
	let loadError = $state('');
	let toast = $state('');
	let projectQuery = $state('');
	let uploading = $state(false);
	let dragActive = $state(false);
	let fileInput = $state<HTMLInputElement | undefined>(undefined);
	let uploadSummary = $state<{ succeeded: number; failed: string[] } | null>(null);
	let editingProject = $state(false);
	let editName = $state('');
	let editDescription = $state('');
	let editInstructions = $state('');
	let savingProject = $state(false);
	let deletingProject = $state(false);
	let deleteProjectLoading = $state(false);
	let deletingFile = $state<ProjectFile | null>(null);
	let deleteFileLoading = $state(false);
	let loadingMoreFiles = $state(false);
	let loadingMoreConversations = $state(false);
	let filePagination = $state<PageInfo>({ page: 1, pageSize: 25, total: 0, hasMore: false });
	let conversationPagination = $state<PageInfo>({
		page: 1,
		pageSize: 25,
		total: 0,
		hasMore: false
	});
	let loadSequence = 0;
	function notify(message: string) {
		toast = message;
		setTimeout(() => (toast = ''), 1800);
	}

	let projectId = $derived((page.params.id as string) ?? '');
	let filteredFiles = $derived(
		files.filter((file) => file.filename.toLowerCase().includes(projectQuery.trim().toLowerCase()))
	);
	let filteredConversations = $derived(
		conversations.filter((conversation) =>
			`${conversation.title} ${conversation.model}`
				.toLowerCase()
				.includes(projectQuery.trim().toLowerCase())
		)
	);
	let extractionSummary = $derived.by(() => {
		const failed = files.filter(extractionNeedsAttention).length;
		const processing = files.filter((file) =>
			['pending', 'processing', 'queued'].includes(file.extractionStatus ?? '')
		).length;
		if (failed > 0)
			return { label: `${failed} file${failed === 1 ? '' : 's'} need attention`, tone: 'danger' };
		if (processing > 0)
			return {
				label: `${processing} file${processing === 1 ? '' : 's'} processing`,
				tone: 'working'
			};
		if (files.length === 0) return { label: 'No project context yet', tone: 'muted' };
		if (filePagination.hasMore)
			return {
				label: `${files.length} of ${filePagination.total} files checked`,
				tone: 'muted'
			};
		return { label: 'Project context active', tone: 'ok' };
	});

	async function load(id = projectId, options: LoadOptions = {}) {
		const reset = options.reset ?? true;
		const filesPage = options.filesPage ?? (reset ? 1 : filePagination.page);
		const conversationsPage =
			options.conversationsPage ?? (reset ? 1 : conversationPagination.page);
		const query = new URLSearchParams({
			filesPage: String(filesPage),
			filesPageSize: String(filePagination.pageSize),
			conversationsPage: String(conversationsPage),
			conversationsPageSize: String(conversationPagination.pageSize)
		});
		const response = await fetch(`/api/projects/${id}?${query}`);
		if (!response.ok) throw new Error('Could not load project');
		const data = await response.json();
		if (!data.project) throw new Error('Project not found');
		if (id !== projectId) return;
		project = data.project;
		const nextFiles = data.files ?? [];
		const nextConversations = data.conversations ?? [];
		if (options.updateFiles !== false) {
			files = options.appendFiles ? [...files, ...nextFiles] : nextFiles;
			filePagination = data.pagination?.files ?? {
				page: filesPage,
				pageSize: filePagination.pageSize,
				total: files.length,
				hasMore: false
			};
		}
		if (options.updateConversations !== false) {
			conversations = options.appendConversations
				? [...conversations, ...nextConversations]
				: nextConversations;
			conversationPagination = data.pagination?.conversations ?? {
				page: conversationsPage,
				pageSize: conversationPagination.pageSize,
				total: conversations.length,
				hasMore: false
			};
		}
	}

	async function loadMoreFiles() {
		if (!filePagination.hasMore || loadingMoreFiles) return;
		loadingMoreFiles = true;
		try {
			await load(projectId, {
				reset: false,
				filesPage: filePagination.page + 1,
				conversationsPage: conversationPagination.page,
				appendFiles: true,
				updateConversations: false
			});
		} catch (error) {
			notify(error instanceof Error ? error.message : 'Could not load more files');
		} finally {
			loadingMoreFiles = false;
		}
	}

	async function loadMoreConversations() {
		if (!conversationPagination.hasMore || loadingMoreConversations) return;
		loadingMoreConversations = true;
		try {
			await load(projectId, {
				reset: false,
				filesPage: filePagination.page,
				conversationsPage: conversationPagination.page + 1,
				appendConversations: true,
				updateFiles: false
			});
		} catch (error) {
			notify(error instanceof Error ? error.message : 'Could not load more conversations');
		} finally {
			loadingMoreConversations = false;
		}
	}

	$effect(() => {
		const id = projectId;
		if (!id) return;
		const sequence = ++loadSequence;
		loading = true;
		loadError = '';
		// Pagination is updated by load(); only a route ID change should restart this effect.
		void untrack(() => load(id))
			.catch((error) => {
				if (sequence === loadSequence) {
					loadError = error instanceof Error ? error.message : 'Could not load project';
				}
			})
			.finally(() => {
				if (sequence === loadSequence) loading = false;
			});
	});

	onMount(async () => {
		try {
			const sessionResponse = await authClient.getSession();
			if (sessionResponse.data) user = sessionResponse.data.user ?? null;
		} catch {
			/* ignore */
		}
	});

	function openEdit() {
		if (!project) return;
		editName = project.name;
		editDescription = project.description ?? '';
		editInstructions = project.instructions ?? '';
		editingProject = true;
	}

	async function saveProject() {
		if (!editName.trim()) {
			notify('Project name is required');
			return;
		}
		savingProject = true;
		try {
			const response = await fetch(`/api/projects/${projectId}`, {
				method: 'PATCH',
				headers: { 'content-type': 'application/json' },
				body: JSON.stringify({
					name: editName.trim(),
					description: editDescription.trim(),
					instructions: editInstructions.trim()
				})
			});
			if (!response.ok)
				throw new Error((await response.json()).error?.message ?? 'Could not save project');
			const data = await response.json();
			project = data.project;
			editingProject = false;
			notify('Project updated');
		} catch (error) {
			notify(error instanceof Error ? error.message : 'Could not save project');
		} finally {
			savingProject = false;
		}
	}

	function promptDeleteProject() {
		deletingProject = true;
	}

	async function confirmDeleteProject() {
		if (!project) return;
		deleteProjectLoading = true;
		try {
			const response = await fetch(`/api/projects/${project.id}`, { method: 'DELETE' });
			if (!response.ok) throw new Error('Could not delete project');
			window.location.href = resolve('/projects');
		} catch (error) {
			notify(error instanceof Error ? error.message : 'Could not delete project');
			deleteProjectLoading = false;
		}
	}

	async function uploadFiles(selected: FileList | null | undefined) {
		if (!selected || selected.length === 0) return;
		uploading = true;
		uploadSummary = null;
		let succeeded = 0;
		const failed: string[] = [];
		try {
			for (const file of Array.from(selected)) {
				const form = new FormData();
				form.set('file', file);
				const response = await fetch(`/api/projects/${projectId}/files`, {
					method: 'POST',
					body: form
				});
				if (!response.ok) {
					const payload = await response.json().catch(() => null);
					failed.push(`${file.name}: ${payload?.error?.message ?? 'upload failed'}`);
					continue;
				}
				succeeded += 1;
			}
			await load();
			if (failed.length > 0) {
				uploadSummary = { succeeded, failed };
				notify(`${succeeded} uploaded, ${failed.length} failed`);
			} else {
				notify(`${succeeded} file${succeeded === 1 ? '' : 's'} uploaded`);
			}
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

	function promptDeleteFile(file: ProjectFile) {
		deletingFile = file;
	}

	async function confirmDeleteFile() {
		if (!deletingFile) return;
		const fileId = deletingFile.id;
		deleteFileLoading = true;
		try {
			const response = await fetch(`/api/projects/${projectId}/files/${fileId}`, {
				method: 'DELETE'
			});
			if (!response.ok) throw new Error('Could not delete file');
			notify('File deleted');
			await load();
			deletingFile = null;
		} catch (error) {
			notify(error instanceof Error ? error.message : 'Could not delete file');
		} finally {
			deleteFileLoading = false;
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
	function extractionNeedsAttention(file: ProjectFile) {
		return Boolean(
			file.extractionError ||
			['failed', 'empty', 'not_started'].includes(file.extractionStatus ?? '') ||
			(file.chunkCount ?? 0) === 0
		);
	}
	function extractionLabel(file: ProjectFile) {
		if (file.extractionError || file.extractionStatus === 'failed') return 'Needs attention';
		switch (file.extractionStatus) {
			case 'not_started':
				return 'Not indexed';
			case 'pending':
			case 'queued':
				return 'Queued';
			case 'processing':
				return 'Processing';
			case 'empty':
				return 'No text found';
			case 'truncated':
				return 'Partially indexed';
			case 'extracted':
			case 'complete':
			case 'completed':
			case 'success':
			default:
				return 'Ready';
		}
	}
</script>

<svelte:head><title>Mimin WebUI | {project?.name ?? 'Project'}</title></svelte:head>
<div class="app-shell" class:sidebar-collapsed={sidebar.collapsed} class:mobile-open={sidebar.mobileOpen}>
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
				title="Toggle sidebar"
				aria-label="Toggle sidebar"><PanelLeft size={16} /></button
			>
		</div>
		<a class="new-chat" href={resolve('/chat')}><Plus size={16} /> New chat <kbd>⌘ K</kbd></a>
		<div class="sidebar-scroll">
			<div class="nav-label">Workspace</div>
			<a class="nav-item" href={resolve('/chat')}><MessageSquare size={16} /> Chat</a>
			<a class="nav-item active" href={resolve('/projects')}><FolderKanban size={16} /> Projects</a>
			{#if user?.role === 'admin'}<a class="nav-item" href={resolve('/admin/users')}
					><User size={16} /> Users</a
				>{/if}
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
				<button
					class="sidebar-toggle topbar-toggle"
					onclick={() => sidebar.toggle()}
					title="Toggle sidebar"
					aria-label="Toggle sidebar"><PanelLeft size={16} /></button
				>
				<div class="breadcrumb">
					<a href={resolve('/projects')}>Projects</a><ChevronRight size={14} /><strong
						>{project?.name ?? '...'}</strong
					>
				</div>
			</div>
			<div class="top-actions">
				<label class="project-search">
					<Search size={15} aria-hidden="true" />
					<span id="project-search-note" class="sr-only"
						>Search filters the loaded files and conversations only.</span
					>
					<input
						bind:value={projectQuery}
						placeholder="Search project"
						aria-label="Search files and conversations"
						aria-describedby="project-search-note"
					/>
				</label>
				<ThemeToggle />
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
						<button class="button" onclick={openEdit}><Pencil size={15} /> Edit</button>
						<button class="button danger" onclick={promptDeleteProject} aria-label="Delete project"
							><Trash2 size={15} /></button
						>
					</div>
				</section>
				<div class="stats">
					<div class="stat-item"><strong>{filePagination.total}</strong><span>Knowledge files</span></div>
					<div class="stat-item"><strong>{conversationPagination.total}</strong><span>Conversations</span></div>
					<div class="stat-item"><strong>{formatDate(project.updatedAt)}</strong><span>Last updated</span></div>
					<div class="context {extractionSummary.tone}">
						<span class="status-dot"></span><span>{extractionSummary.label}</span>
					</div>
				</div>
				<section class="instructions-band" aria-labelledby="project-instructions-heading">
					<div class="instructions-band-content">
						<span id="project-instructions-heading" class="instructions-band-title">Agent instructions</span>
						<p>{project.instructions || 'No project-specific instructions set.'}</p>
					</div>
					<button class="button" onclick={openEdit}
						>{project.instructions ? 'Update instructions' : 'Add instructions'}</button
					>
				</section>

				<section class="section-block">
					<div class="section-heading">
						<div>
							<h2>Knowledge</h2>
							<p>Files available to the agent in this project.</p>
							{#if projectQuery.trim()}<small class="search-scope"
									>Search filters loaded files only.</small
								>{/if}
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
					{#if uploadSummary}
						<div class="upload-summary" role="alert">
							<strong>{uploadSummary.succeeded} uploaded</strong>
							<span>{uploadSummary.failed.length} failed</span>
							<ul>
								{#each uploadSummary.failed as failure, index (index)}<li>{failure}</li>{/each}
							</ul>
						</div>
					{/if}
					<input
						class="hidden-input"
						type="file"
						multiple
						accept=".txt,.md,.json,.pdf"
						bind:this={fileInput}
						onchange={(e) => uploadFiles(e.currentTarget.files)}
					/>
					{#if filteredFiles.length > 0}
						<div class="file-list">
							{#each filteredFiles as file (file.id)}
								<div class="file-row">
									<div class="file-icon">
										{#if file.mimeType === 'application/json'}<FileJson2
												size={16}
											/>{:else}<FileText size={16} />{/if}
									</div>
									<div class="file-name">
										<strong>{file.filename}</strong><small>{file.mimeType}</small>
										<span class="extraction-state {extractionNeedsAttention(file) ? 'danger' : ''}">
											{extractionLabel(file)} · {#if file.pageCount}{file.pageCount} pages ·
											{/if}{file.chunkCount ?? 0} chunks
										</span>
										{#if file.extractionError}<span class="extraction-error"
												>{file.extractionError}</span
											>{/if}
									</div>
									<span class="muted desktop-only">{formatSize(file.sizeBytes)}</span>
									<span class="muted desktop-only">{formatDate(file.createdAt)}</span>
									<button
										class="row-menu"
										aria-label={`Delete ${file.filename}`}
										onclick={() => promptDeleteFile(file)}><Trash2 size={16} /></button
									>
								</div>
							{/each}
						</div>
					{:else if files.length > 0}
						<div class="empty-state filtered-empty">No files match “{projectQuery}”.</div>
					{/if}
					{#if filePagination.hasMore}
						<button
							class="load-more"
							type="button"
							onclick={() => void loadMoreFiles()}
							disabled={loadingMoreFiles}
							aria-busy={loadingMoreFiles}
						>
							{loadingMoreFiles
								? 'Loading files…'
								: `Load more files (${files.length} of ${filePagination.total})`}
						</button>
					{/if}
				</section>

				<section class="section-block conversations">
					<div class="section-heading">
						<div>
							<h2>Conversations</h2>
							<p>Continue work from previous project sessions.</p>
							{#if projectQuery.trim()}<small class="search-scope"
									>Search filters loaded conversations only.</small
								>{/if}
						</div>
						<button class="button primary" onclick={startChat}><Plus size={15} /> New chat</button>
					</div>
					<div class="conversation-list">
						{#each filteredConversations as conversation (conversation.id)}
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
						{#if conversations.length > 0 && filteredConversations.length === 0}<div
								class="empty-state conversation-empty"
							>
								No conversations match “{projectQuery}”.
							</div>{/if}
					</div>
					{#if conversationPagination.hasMore}
						<button
							class="load-more"
							type="button"
							onclick={() => void loadMoreConversations()}
							disabled={loadingMoreConversations}
							aria-busy={loadingMoreConversations}
						>
							{loadingMoreConversations
								? 'Loading conversations…'
								: `Load more conversations (${conversations.length} of ${conversationPagination.total})`}
						</button>
					{/if}
				</section>
			{/if}
		</div>
	</main>
</div>
{#if editingProject}
	<div
		class="modal-backdrop"
		role="dialog"
		aria-modal="true"
		aria-labelledby="edit-project-title"
		tabindex="-1"
		onclick={(event) => event.target === event.currentTarget && (editingProject = false)}
		onkeydown={(event) => event.key === 'Escape' && (editingProject = false)}
	>
		<form
			class="modal"
			onsubmit={(event) => {
				event.preventDefault();
				void saveProject();
			}}
		>
			<div class="modal-head">
				<h2 id="edit-project-title">Edit project</h2>
				<button
					type="button"
					class="icon-button"
					onclick={() => (editingProject = false)}
					aria-label="Close dialog"><X size={16} /></button
				>
			</div>
			<label>Project name<input bind:value={editName} maxlength="120" required /></label>
			<label>Description<textarea bind:value={editDescription} maxlength="2000"></textarea></label>
			<label
				>Instructions<textarea
					bind:value={editInstructions}
					maxlength="10000"
					placeholder="How should the agent help with this project?"></textarea></label
			>
			<div class="modal-actions">
				<button
					type="button"
					class="button"
					onclick={() => (editingProject = false)}
					disabled={savingProject}>Cancel</button
				>
				<button type="submit" class="button primary" disabled={savingProject}
					>{savingProject ? 'Saving...' : 'Save changes'}</button
				>
			</div>
		</form>
	</div>
{/if}
{#if deletingProject && project}
	<div
		class="modal-backdrop"
		role="dialog"
		aria-modal="true"
		aria-labelledby="delete-project-title"
		tabindex="-1"
		onclick={(event) => event.target === event.currentTarget && (deletingProject = false)}
		onkeydown={(event) => event.key === 'Escape' && (deletingProject = false)}
	>
		<div class="modal" role="document">
			<div class="modal-head">
				<h2 id="delete-project-title">Delete project</h2>
				<button
					class="icon-button"
					onclick={() => (deletingProject = false)}
					aria-label="Close dialog"><X size={16} /></button
				>
			</div>
			<p class="modal-text">
				Delete <strong>“{project.name}”</strong>? This permanently removes the project and its
				knowledge files. Its conversations will remain available as standalone chats.
			</p>
			<div class="modal-actions">
				<button
					class="button"
					onclick={() => (deletingProject = false)}
					disabled={deleteProjectLoading}>Cancel</button
				>
				<button
					class="button danger"
					onclick={() => void confirmDeleteProject()}
					disabled={deleteProjectLoading}
					>{deleteProjectLoading ? 'Deleting...' : 'Delete project'}</button
				>
			</div>
		</div>
	</div>
{/if}
{#if deletingFile}
	<div
		class="modal-backdrop"
		role="dialog"
		aria-modal="true"
		aria-labelledby="delete-file-title"
		tabindex="-1"
		onclick={(event) => event.target === event.currentTarget && (deletingFile = null)}
		onkeydown={(event) => event.key === 'Escape' && (deletingFile = null)}
	>
		<div class="modal" role="document">
			<div class="modal-head">
				<h2 id="delete-file-title">Delete knowledge file</h2>
				<button class="icon-button" onclick={() => (deletingFile = null)} aria-label="Close dialog"
					><X size={16} /></button
				>
			</div>
			<p class="modal-text">
				Remove <strong>“{deletingFile.filename}”</strong> from this project? The agent will no longer
				be able to use it.
			</p>
			<div class="modal-actions">
				<button class="button" onclick={() => (deletingFile = null)} disabled={deleteFileLoading}
					>Cancel</button
				>
				<button
					class="button danger"
					onclick={() => void confirmDeleteFile()}
					disabled={deleteFileLoading}>{deleteFileLoading ? 'Deleting...' : 'Delete file'}</button
				>
			</div>
		</div>
	</div>
{/if}
{#if toast}<div class="toast" role="status" aria-live="polite">{toast}</div>{/if}

<svelte:window
	onkeydown={(event) => {
		if (event.key === 'Escape') {
			editingProject = false;
			deletingProject = false;
			if (!deleteFileLoading) deletingFile = null;
		}
	}}
/>

<style>
	.page-wrap {
		max-width: 970px;
		margin: auto;
		padding: clamp(32px, 6vh, 56px) 35px 70px;
	}
	.top-actions {
		display: flex;
		align-items: center;
		gap: 8px;
	}
	.project-search {
		display: flex;
		align-items: center;
		gap: 8px;
		width: 200px;
		padding: 7px 10px;
		color: var(--text-dim);
		background: var(--surface);
		border: 1px solid var(--border);
		border-radius: 6px;
		transition: border-color 0.15s ease;
	}
	.project-search input {
		width: 100%;
		min-width: 0;
		padding: 0;
		border: 0;
		outline: 0;
		color: var(--text-strong);
		background: transparent;
		font-family: var(--font-body);
		font-size: var(--text-sm);
	}
	.project-search:focus-within {
		border-color: var(--focus);
	}
	.sr-only {
		position: absolute;
		width: 1px;
		height: 1px;
		padding: 0;
		margin: -1px;
		overflow: hidden;
		clip: rect(0, 0, 0, 0);
		white-space: nowrap;
		border: 0;
	}
	.button {
		display: inline-flex;
		align-items: center;
		justify-content: center;
		gap: 7px;
		min-height: 36px;
		padding: 7px 12px;
		border-radius: 6px;
		border: 1px solid var(--border-strong);
		background: var(--surface);
		color: var(--text-body);
		font-family: var(--font-body);
		font-size: var(--text-sm);
		font-weight: 500;
		line-height: 1;
		white-space: nowrap;
		transition: 0.15s ease;
	}
	.button:hover {
		color: var(--text-strong);
		border-color: var(--text-dim);
		background: var(--surface-hover);
	}
	.button.primary {
		color: var(--accent-fg);
		background: var(--accent-bg);
		border-color: var(--accent-bg);
	}
	.button.primary:hover {
		background: var(--accent-bg-hover);
		border-color: var(--accent-bg-hover);
	}
	.button.danger {
		color: var(--danger-text);
		border-color: color-mix(in srgb, var(--danger-text) 30%, transparent);
		background: transparent;
	}
	.button.danger:hover {
		background: color-mix(in srgb, var(--danger-text) 10%, transparent);
		border-color: var(--danger-text);
		color: var(--danger-text);
	}
	.context.danger {
		color: var(--danger-text);
	}
	.context.danger .status-dot {
		background: var(--danger-text);
	}
	.context.working {
		color: var(--status-working-text);
	}
	.context.working .status-dot {
		background: var(--status-working-dot);
	}
	.context.muted {
		color: var(--text-dim);
	}
	.context.muted .status-dot {
		background: var(--text-faint);
	}
	.instructions-band {
		display: flex;
		align-items: flex-start;
		justify-content: space-between;
		gap: 20px;
		margin-top: 20px;
		padding: 16px 18px;
		background: var(--surface-2);
		border: 1px solid var(--border);
		border-radius: 8px;
	}
	.instructions-band-content {
		flex: 1;
		min-width: 0;
	}
	.instructions-band-title {
		display: block;
		color: var(--text-muted);
		font-size: var(--text-xs);
		font-weight: 600;
		letter-spacing: 0.02em;
	}
	.instructions-band p {
		max-width: 650px;
		margin: 5px 0 0;
		color: var(--text-body);
		font-size: var(--text-sm);
		line-height: 1.55;
		white-space: pre-wrap;
	}
	.instructions-band .button {
		flex: 0 0 auto;
	}
	.upload-summary {
		margin-top: 10px;
		padding: 10px 14px;
		color: var(--text-muted);
		background: var(--surface-2);
		border: 1px solid var(--border);
		border-radius: 6px;
		font-size: var(--text-xs);
		line-height: 1.4;
	}
	.upload-summary strong {
		color: var(--status-ok-text);
		font-weight: 600;
	}
	.upload-summary ul {
		margin: 6px 0 0 16px;
		padding: 0;
		color: var(--danger-text);
		line-height: 1.5;
	}
	.extraction-state {
		display: inline-block;
		margin-top: 3px;
		color: var(--status-ok-text);
		font-size: var(--text-xs);
		font-weight: 450;
		line-height: 1.3;
	}
	.extraction-state.danger,
	.extraction-error {
		color: var(--danger-text);
	}
	.extraction-error {
		display: block;
		margin-top: 2px;
		font-size: var(--text-xs);
		line-height: 1.35;
		white-space: normal;
	}
	.filtered-empty {
		padding: 24px 0;
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
		width: min(480px, 100%);
		max-height: min(680px, calc(100dvh - 40px));
		overflow: auto;
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
		color: var(--text-strong);
		background: var(--surface);
		font-family: var(--font-body);
		font-size: var(--text-sm);
		line-height: 1.5;
		transition: border-color 0.15s ease;
	}
	.modal input:focus,
	.modal textarea:focus {
		border-color: var(--focus);
	}
	.modal textarea {
		min-height: 80px;
		resize: vertical;
	}
	.modal-text {
		margin: 0 0 16px;
		color: var(--text-body);
		font-size: var(--text-sm);
		line-height: 1.55;
	}
	.modal-actions {
		display: flex;
		justify-content: flex-end;
		gap: 8px;
		margin-top: 22px;
	}
	.empty-state {
		text-align: center;
		color: var(--text-dim);
		font-size: var(--text-sm);
		padding: 34px 0;
		line-height: 1.5;
	}
	.error-state strong,
	.error-state span,
	.error-state a {
		display: block;
	}
	.error-state strong {
		color: var(--text-strong);
		font-size: var(--text-base);
		font-weight: 600;
	}
	.error-state span {
		margin-top: 5px;
		color: var(--text-muted);
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
		gap: 24px;
		padding-bottom: 24px;
		border-bottom: 1px solid var(--border);
	}
	.title-row {
		display: flex;
		align-items: flex-start;
		gap: 14px;
	}
	.project-symbol {
		display: grid;
		place-items: center;
		width: 42px;
		height: 42px;
		flex: 0 0 42px;
		color: var(--text-muted);
		background: var(--surface-2);
		border: 1px solid var(--border);
		border-radius: 10px;
	}
	.hero h1 {
		margin: 0;
		font-family: var(--font-body);
		font-size: var(--text-2xl);
		font-weight: 600;
		line-height: 1.2;
		letter-spacing: -0.025em;
		color: var(--text-strong);
	}
	.hero p {
		max-width: 580px;
		margin: 6px 0 0;
		color: var(--text-muted);
		font-size: var(--text-sm);
		line-height: 1.55;
	}
	.hero-actions {
		display: flex;
		gap: 8px;
		flex: 0 0 auto;
	}
	.stats {
		display: flex;
		align-items: center;
		gap: 32px;
		padding: 16px 0;
		border-bottom: 1px solid var(--border);
	}
	.stat-item {
		display: flex;
		flex-direction: column;
		gap: 2px;
	}
	.stats strong {
		display: block;
		font-size: var(--text-lg);
		font-weight: 600;
		letter-spacing: -0.02em;
		color: var(--text-strong);
		font-variant-numeric: tabular-nums;
		line-height: 1.2;
	}
	.stats span {
		display: block;
		color: var(--text-muted);
		font-size: var(--text-xs);
		font-weight: 450;
		line-height: 1.3;
	}
	.stats .context {
		display: flex;
		align-items: center;
		gap: 7px;
		margin-left: auto;
		font-size: var(--text-xs);
		font-weight: 500;
	}
	.status-dot {
		width: 7px;
		height: 7px;
		flex: 0 0 7px;
		background: var(--status-ok-dot);
		border-radius: 50%;
	}
	.section-block {
		padding-top: 32px;
	}
	.section-heading {
		display: flex;
		align-items: flex-end;
		justify-content: space-between;
		gap: 16px;
		margin-bottom: 12px;
	}
	.section-heading h2 {
		margin: 0;
		font-family: var(--font-body);
		font-size: var(--text-base);
		font-weight: 600;
		letter-spacing: -0.015em;
		color: var(--text-strong);
		line-height: 1.3;
	}
	.section-heading p {
		margin: 3px 0 0;
		color: var(--text-muted);
		font-size: var(--text-sm);
		line-height: 1.4;
	}
	.search-scope {
		display: block;
		margin-top: 4px;
		color: var(--text-dim);
		font-size: var(--text-xs);
	}
	.upload-zone {
		display: flex;
		align-items: center;
		justify-content: center;
		gap: 12px;
		width: 100%;
		min-height: 72px;
		padding: 16px;
		color: var(--text-muted);
		background: var(--surface-subtle);
		border: 1px dashed var(--border-strong);
		border-radius: 8px;
		text-align: left;
		transition: 0.15s ease;
	}
	.upload-zone:hover {
		color: var(--text-strong);
		border-color: var(--text-dim);
		background: var(--surface-2);
	}
	.upload-zone.drag-active {
		color: var(--text-strong);
		background: var(--surface-3);
		border-color: var(--focus);
	}
	.upload-zone strong {
		display: block;
		color: var(--text-body);
		font-size: var(--text-sm);
		font-weight: 500;
		line-height: 1.3;
	}
	.upload-zone small {
		display: block;
		color: var(--text-dim);
		font-size: var(--text-xs);
		line-height: 1.3;
		margin-top: 2px;
	}
	.hidden-input {
		display: none;
	}
	.file-list,
	.conversation-list {
		overflow: hidden;
		background: var(--surface);
		border: 1px solid var(--border);
		border-radius: 8px;
	}
	.load-more {
		display: block;
		width: 100%;
		margin-top: 10px;
		padding: 9px 12px;
		color: var(--text-muted);
		background: var(--surface);
		border: 1px solid var(--border);
		border-radius: 6px;
		font-size: var(--text-sm);
		font-weight: 500;
		transition: 0.15s ease;
	}
	.load-more:hover:not(:disabled) {
		color: var(--text-strong);
		border-color: var(--text-dim);
		background: var(--surface-2);
	}
	.load-more:focus-visible {
		outline: 2px solid var(--focus);
		outline-offset: 2px;
	}
	.load-more:disabled {
		cursor: wait;
		opacity: 0.65;
	}
	.file-row,
	.conversation-row {
		display: grid;
		align-items: center;
		gap: 12px;
		min-height: 52px;
		width: 100%;
		padding: 10px 14px;
		border-bottom: 1px solid var(--border);
		text-align: left;
		transition: background 0.12s ease;
	}
	.file-row {
		grid-template-columns: 32px minmax(0, 1fr) 90px 90px 28px;
	}
	.conversation-row {
		grid-template-columns: 32px minmax(0, 1fr) 90px;
		color: inherit;
		text-decoration: none;
	}
	.file-row:last-child,
	.conversation-row:last-child {
		border-bottom: 0;
	}
	.file-row:hover,
	.conversation-row:hover {
		background: var(--surface-2);
	}
	.file-icon,
	.conversation-icon {
		display: grid;
		place-items: center;
		width: 30px;
		height: 30px;
		color: var(--text-muted);
		background: var(--surface-2);
		border: 1px solid var(--border);
		border-radius: 6px;
	}
	.conversation-icon {
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
		font-size: var(--text-sm);
		font-weight: 500;
		color: var(--text-strong);
		line-height: 1.35;
	}
	.file-name small,
	.conversation-name small {
		color: var(--text-dim);
		font-size: var(--text-xs);
		line-height: 1.3;
		margin-top: 1px;
	}
	.muted {
		color: var(--text-dim);
		font-size: var(--text-xs);
		font-variant-numeric: tabular-nums;
		line-height: 1.3;
	}
	.row-menu {
		display: grid;
		place-items: center;
		width: 28px;
		height: 28px;
		color: var(--text-dim);
		background: transparent;
		border: 0;
		border-radius: 4px;
		transition: color 0.15s ease, background 0.15s ease;
	}
	.row-menu:hover {
		color: var(--danger-text);
		background: color-mix(in srgb, var(--danger-text) 10%, transparent);
	}
	.breadcrumb a {
		color: var(--text-dim);
		text-decoration: none;
		transition: color 0.15s ease;
	}
	.breadcrumb a:hover {
		color: var(--text-strong);
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
		color: var(--accent-fg);
		background: var(--accent-bg);
		border-radius: 6px;
		padding: 10px 14px;
		font-size: var(--text-sm);
		font-weight: 500;
		box-shadow: 0 8px 24px var(--shadow);
		z-index: 50;
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
			flex-wrap: wrap;
		}
		.project-search {
			width: min(190px, 42vw);
		}
		.stats {
			gap: 20px;
			flex-wrap: wrap;
		}
		.stats .context {
			width: 100%;
			margin-left: 0;
		}
		.instructions-band {
			align-items: stretch;
			flex-direction: column;
			gap: 12px;
		}
		.instructions-band .button {
			justify-content: center;
			width: 100%;
		}
		.file-row {
			grid-template-columns: 32px minmax(0, 1fr) 28px;
		}
		.desktop-only {
			display: none;
		}
	}
</style>
