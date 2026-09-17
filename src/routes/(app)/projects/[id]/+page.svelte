<script lang="ts">
	import { onMount, untrack } from 'svelte';
	import { page } from '$app/state';
	import { resolve } from '$app/paths';
	import { toast } from 'svelte-sonner';
	import { getLastUsedModel, setLastUsedModel } from '$lib/client/conversations.svelte';
	import ProjectConversations from './ProjectConversations.svelte';
	import ProjectDialogs from './ProjectDialogs.svelte';
	import ProjectHeader from './ProjectHeader.svelte';
	import ProjectInstructions from './ProjectInstructions.svelte';
	import ProjectKnowledge from './ProjectKnowledge.svelte';
	import ProjectSearch from './ProjectSearch.svelte';
	import ProjectSkills from './ProjectSkills.svelte';
	import ProjectCanvases from './ProjectCanvases.svelte';
	import type { CanvasSummary } from '$lib/canvas';
	import { extractionNeedsAttention } from './project-format';
	import type {
		Conversation,
		PageInfo,
		Project,
		ProjectFile,
		UploadSummary
	} from './project-types';
	import Topbar from '$lib/components/Topbar.svelte';
	import Page from '$lib/components/Page.svelte';

	type LoadOptions = {
		reset?: boolean;
		filesPage?: number;
		conversationsPage?: number;
		appendFiles?: boolean;
		appendConversations?: boolean;
		updateFiles?: boolean;
		updateConversations?: boolean;
		fileQuery?: string;
	};

	let project = $state<Project | null>(null);
	let files = $state<ProjectFile[]>([]);
	let conversations = $state<Conversation[]>([]);
	let projectCanvases = $state<CanvasSummary[]>([]);
	let loading = $state(true);
	let loadError = $state('');
	let projectQuery = $state('');
	let uploading = $state(false);
	let indexingNotice = $state('');
	let uploadSummary = $state<UploadSummary | null>(null);
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
	let reindexing = $state<string | null>(null);
	async function reindexFile(file: ProjectFile) {
		reindexing = file.id;
		try {
			const response = await fetch(`/api/projects/${projectId}/files/${file.id}/reindex`, {
				method: 'POST'
			});
			const result = await response.json();
			if (!response.ok) throw new Error(result.error?.message || 'Reindexing failed.');
			await load(projectId, { reset: true });
			toast(
				result.indexing?.status === 'unavailable'
					? 'Text indexed; semantic indexing unavailable. Retry reindexing later.'
					: 'Knowledge index updated.'
			);
		} catch (error) {
			toast(error instanceof Error ? error.message : 'Reindexing failed.');
		} finally {
			reindexing = null;
		}
	}
	let projectId = $derived((page.params.id as string) ?? '');
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
		const fileQuery = options.fileQuery ?? projectQuery.trim();
		const requestSequence = ++loadSequence;
		const query = new URLSearchParams({
			filesPage: String(filesPage),
			filesPageSize: String(filePagination.pageSize),
			conversationsPage: String(conversationsPage),
			conversationsPageSize: String(conversationPagination.pageSize),
			...(fileQuery ? { fileQuery } : {})
		});
		const response = await fetch(`/api/projects/${id}?${query}`);
		if (!response.ok) throw new Error('Could not load project');
		const data = await response.json();
		if (!data.project) throw new Error('Project not found');
		if (id !== projectId || requestSequence !== loadSequence) return;
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
		try {
			const cRes = await fetch(`/api/canvases?projectId=${id}`);
			if (cRes.ok) {
				const cData = await cRes.json();
				projectCanvases = cData.canvases ?? [];
			}
		} catch {
			/* canvases fetch non-critical */
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
				fileQuery: projectQuery.trim(),
				appendFiles: true,
				updateConversations: false
			});
		} catch (error) {
			toast(error instanceof Error ? error.message : 'Could not load more files');
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
			toast(error instanceof Error ? error.message : 'Could not load more conversations');
		} finally {
			loadingMoreConversations = false;
		}
	}

	$effect(() => {
		const id = projectId;
		const query = projectQuery.trim();
		if (!id) return;
		const timer = setTimeout(
			() => {
				loading = true;
				loadError = '';
				void untrack(() => load(id, { fileQuery: query }))
					.catch((error) => {
						if (id === projectId && query === projectQuery.trim())
							loadError = error instanceof Error ? error.message : 'Could not load project';
					})
					.finally(() => {
						if (id === projectId && query === projectQuery.trim()) loading = false;
					});
			},
			query ? 250 : 0
		);
		return () => clearTimeout(timer);
	});

	onMount(async () => {});

	function openEdit() {
		if (!project) return;
		editName = project.name;
		editDescription = project.description ?? '';
		editInstructions = project.instructions ?? '';
		editingProject = true;
	}

	async function saveProject() {
		if (!editName.trim()) {
			toast('Project name is required');
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
			toast('Project updated');
		} catch (error) {
			toast(error instanceof Error ? error.message : 'Could not save project');
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
			toast(error instanceof Error ? error.message : 'Could not delete project');
			deleteProjectLoading = false;
		}
	}

	async function uploadFiles(selected: FileList | null | undefined) {
		if (!selected || selected.length === 0) return;
		uploading = true;
		uploadSummary = null;
		indexingNotice = '';
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
				const payload = await response.json();
				if (payload.indexing?.status === 'unavailable')
					indexingNotice =
						'Files are searchable by text. Semantic indexing is unavailable; use Reindex to retry.';
				succeeded += 1;
			}
			await load();
			if (failed.length > 0) {
				uploadSummary = { succeeded, failed };
				toast(`${succeeded} uploaded, ${failed.length} failed`);
			} else {
				toast(`${succeeded} file${succeeded === 1 ? '' : 's'} uploaded`);
			}
		} catch (error) {
			toast(error instanceof Error ? error.message : 'Upload failed');
		} finally {
			uploading = false;
		}
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
			toast('File deleted');
			await load();
			deletingFile = null;
		} catch (error) {
			toast(error instanceof Error ? error.message : 'Could not delete file');
		} finally {
			deleteFileLoading = false;
		}
	}

	async function startChat() {
		try {
			const lastModel = getLastUsedModel();
			const response = await fetch('/api/conversations', {
				method: 'POST',
				headers: { 'content-type': 'application/json' },
				body: JSON.stringify({
					projectId,
					...(lastModel ? { model: lastModel } : {})
				})
			});
			if (!response.ok) throw new Error('Could not start chat');
			const conversation = (await response.json()).conversation;
			if (conversation.model) {
				setLastUsedModel(conversation.model);
			}
			window.location.href = `/chat?id=${encodeURIComponent(conversation.id)}`;
		} catch (error) {
			toast(error instanceof Error ? error.message : 'Could not start chat');
		}
	}

	async function createProjectCanvas() {
		try {
			const lastModel = getLastUsedModel();
			// First create conversation linked to this project
			const convRes = await fetch('/api/conversations', {
				method: 'POST',
				headers: { 'content-type': 'application/json' },
				body: JSON.stringify({
					projectId,
					title: `${project?.name ?? 'Project'} Canvas`,
					...(lastModel ? { model: lastModel } : {})
				})
			});
			if (!convRes.ok) throw new Error('Could not start canvas conversation');
			const conv = (await convRes.json()).conversation;

			// Next create canvas linked to both
			const canvasRes = await fetch('/api/canvases', {
				method: 'POST',
				headers: { 'content-type': 'application/json' },
				body: JSON.stringify({
					projectId,
					conversationId: conv.id,
					title: `${project?.name ?? 'Project'} Canvas`
				})
			});
			if (!canvasRes.ok) throw new Error('Could not create canvas');
			await canvasRes.json();

			if (conv.model) {
				setLastUsedModel(conv.model);
			}
			window.location.href = `/chat?id=${encodeURIComponent(conv.id)}`;
		} catch (error) {
			toast(error instanceof Error ? error.message : 'Could not create canvas');
		}
	}
</script>

<svelte:head><title>Mimin WebUI | {project?.name ?? 'Project'}</title></svelte:head>
<Topbar
	breadcrumbs={[
		{ label: 'Projects', href: '/projects' },
		{ label: project?.name ?? '...', strong: true }
	]}
	separator="chevron-right"
>
	{#snippet actions()}
		<ProjectSearch bind:value={projectQuery} />
	{/snippet}
</Topbar>
<Page>
	{#if loading}
		<div class="empty-state" role="status">Loading project...</div>
	{:else if loadError}
		<div class="empty-state error-state" role="alert">
			<strong>Couldn’t open this project</strong>
			<span>{loadError}</span>
			<a href={resolve('/projects')}>Back to projects</a>
		</div>
	{:else if project}
		<ProjectHeader
			{project}
			fileTotal={filePagination.total}
			conversationTotal={conversationPagination.total}
			{extractionSummary}
			onstartchat={startChat}
			onedit={openEdit}
			ondelete={promptDeleteProject}
		/>
		<ProjectInstructions {project} onedit={openEdit} />
		<ProjectCanvases canvases={projectCanvases} oncreatecanvas={createProjectCanvas} />
		<ProjectSkills {projectId} />
		<ProjectKnowledge
			filteredFiles={files}
			loadedCount={files.length}
			query={projectQuery}
			pagination={filePagination}
			loadingMore={loadingMoreFiles}
			{reindexing}
			{uploading}
			{indexingNotice}
			{uploadSummary}
			onupload={uploadFiles}
			onreindex={reindexFile}
			ondelete={promptDeleteFile}
			onloadmore={loadMoreFiles}
		/>
		<ProjectConversations
			{filteredConversations}
			loadedCount={conversations.length}
			query={projectQuery}
			pagination={conversationPagination}
			loadingMore={loadingMoreConversations}
			onloadmore={loadMoreConversations}
			onstartchat={startChat}
		/>
	{/if}
</Page>
<ProjectDialogs
	bind:editName
	bind:editDescription
	bind:editInstructions
	{project}
	{editingProject}
	{savingProject}
	oncloseedit={() => (editingProject = false)}
	onsaveedit={saveProject}
	{deletingProject}
	{deleteProjectLoading}
	onclosedeleteproject={() => (deletingProject = false)}
	onconfirmdeleteproject={confirmDeleteProject}
	{deletingFile}
	{deleteFileLoading}
	onclosedeletefile={() => (deletingFile = null)}
	onconfirmdeletefile={confirmDeleteFile}
/>

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
	.empty-state {
		text-align: center;
		color: var(--text-dim);
		font-size: var(--text-body-md);
		line-height: var(--text-body-md--line-height);
		letter-spacing: var(--text-body-md--letter-spacing);
		padding: 34px 0;
	}
	.error-state strong,
	.error-state span,
	.error-state a {
		display: block;
	}
	.error-state strong {
		color: var(--text-strong);
		font-size: var(--text-body-lg);
		line-height: var(--text-body-lg--line-height);
		letter-spacing: var(--text-body-lg--letter-spacing);
		font-weight: 500;
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
</style>
