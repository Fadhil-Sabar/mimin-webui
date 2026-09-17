<script lang="ts">
	import { onMount } from 'svelte';
	import { resolve } from '$app/paths';
	import { ArrowUpRight, FolderKanban, Grid2X2, List, Plus, Search, X } from '@lucide/svelte';
	import { toast } from 'svelte-sonner';
	import { Button } from '$lib/components/ui/button/index.js';
	import * as Dialog from '$lib/components/ui/dialog/index.js';
	import { Card } from '$lib/components/ui/card/index.js';
	import { Input } from '$lib/components/ui/input/index.js';
	import { Textarea } from '$lib/components/ui/textarea/index.js';
	import Topbar from '$lib/components/Topbar.svelte';
	import Page from '$lib/components/Page.svelte';
	import PageHeader from '$lib/components/PageHeader.svelte';
	import Skeleton from '$lib/components/Skeleton.svelte';

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
	let query = $state('');
	let showCreate = $state(false);
	let newName = $state('');
	let newDescription = $state('');
	let newInstructions = $state('');
	let creating = $state(false);
	let createProjectTrigger = $state<HTMLButtonElement | null>(null);
	let loading = $state(true);
	let projects = $state<Project[]>([]);
	let filteredProjects = $derived(
		projects.filter((project) =>
			`${project.name} ${project.description}`.toLowerCase().includes(query.trim().toLowerCase())
		)
	);

	function closeCreateProject() {
		showCreate = false;
		createProjectTrigger?.focus();
	}

	function handleCreateOpenChange(next: boolean) {
		if (!next) closeCreateProject();
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
			await loadProjects();
		} catch (error) {
			toast(error instanceof Error ? error.message : 'Could not load projects');
		} finally {
			loading = false;
		}
	});

	async function createProject() {
		if (!newName.trim()) {
			toast('Project name is required');
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
			closeCreateProject();
			toast('Project created');
			await loadProjects();
		} catch (error) {
			toast(error instanceof Error ? error.message : 'Could not create project');
		} finally {
			creating = false;
		}
	}

	function formatDate(iso: string) {
		return new Date(iso).toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
	}
</script>

<svelte:head><title>Mimin WebUI | Projects</title></svelte:head>
<Topbar />
<Page>
	<PageHeader title="Projects" subtitle="Persistent context for the work you return to.">
		{#snippet actions()}
			<Button variant="default" bind:ref={createProjectTrigger} onclick={() => (showCreate = true)}
				><Plus size={16} /> New project</Button
			>
		{/snippet}
	</PageHeader>
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
			<Button
				variant="ghost"
				size="icon"
				class="size-[38px] border border-[var(--border)] bg-[var(--surface)] text-[var(--text-faint)] hover:bg-[var(--surface-hover)] hover:text-[var(--text-body)] {view ===
				'grid'
					? 'bg-[var(--surface-hover)] text-[var(--text-body)]'
					: ''}"
				aria-label="Grid view"
				aria-pressed={view === 'grid'}
				title="Grid view"
				onclick={() => (view = 'grid')}><Grid2X2 size={16} /></Button
			>
			<Button
				variant="ghost"
				size="icon"
				class="size-[38px] border border-[var(--border)] bg-[var(--surface)] text-[var(--text-faint)] hover:bg-[var(--surface-hover)] hover:text-[var(--text-body)] {view ===
				'list'
					? 'bg-[var(--surface-hover)] text-[var(--text-body)]'
					: ''}"
				aria-label="List view"
				aria-pressed={view === 'list'}
				title="List view"
				onclick={() => (view = 'list')}><List size={16} /></Button
			>
		</div>
	</div>
	{#if loading}
		<div
			class:grid-view={view === 'grid'}
			class:list-view={view === 'list'}
			class="project-grid"
			role="status"
			aria-label="Loading projects"
		>
			{#each [1, 2, 3, 4, 5, 6] as i (i)}
				<div class="project-skeleton">
					<Skeleton width="36px" height="36px" radius="var(--radius-lg)" />
					<Skeleton width="60%" height="1.125rem" />
					<Skeleton width="100%" />
					<Skeleton width="84%" />
					<Skeleton width="52%" />
				</div>
			{/each}
		</div>
	{:else if projects.length === 0}
		<div class="empty-state">
			No projects yet. Create your first project to give the agent persistent context.
		</div>
	{:else if filteredProjects.length === 0}
		<div class="empty-state">No projects match “{query}”.</div>
	{/if}
	{#if !loading}
		<div class:grid-view={view === 'grid'} class:list-view={view === 'list'} class="project-grid">
			{#each filteredProjects as project (project.id)}
				<Card
					href={resolve(`/projects/${project.id}`)}
					padding="none"
					class="flex min-h-[220px] flex-col p-[18px] text-left text-inherit no-underline transition-[border-color,box-shadow,transform] duration-(--duration-short4) ease-standard hover:-translate-y-[2px] hover:border-[var(--text-dim)] hover:shadow-[0_8px_22px_var(--shadow-soft)]"
				>
					<div class="card-top">
						<span class="card-icon"><FolderKanban size={18} /></span>
						<span class="card-arrow"><ArrowUpRight size={17} /></span>
					</div>
					<h2 class="md-body-lg mt-5 mb-[6px] text-[var(--text-strong)]">{project.name}</h2>
					<p class="md-body-md m-0 min-h-[52px] text-[var(--text-muted)]">
						{project.description || 'No description yet.'}
					</p>
					<div class="card-footer">
						<span>Context · {project.fileCount ?? 0} files · {project.chatCount ?? 0} chats</span>
						<span>Updated {formatDate(project.updatedAt)}</span>
					</div>
				</Card>
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
</Page>
<Dialog.Root open={showCreate} onOpenChange={handleCreateOpenChange}>
	<Dialog.Content
		showCloseButton={false}
		class="w-[min(420px,100%)] max-w-none! gap-0 rounded-xl border border-[var(--border-strong)] p-6 shadow-[0_20px_50px_var(--shadow)] ring-0"
		onCloseAutoFocus={(event) => event.preventDefault()}
	>
		<form
			class="dialog-shell"
			onsubmit={(event) => {
				event.preventDefault();
				createProject();
			}}
		>
			<Dialog.Header class="flex flex-row items-start justify-between gap-4 text-left">
				<Dialog.Title
					id="create-project-title"
					class="mb-4 text-headline-sm text-[var(--text-strong)]"
				>
					Create a project
				</Dialog.Title>
				<Button
					variant="ghost"
					size="icon"
					aria-label="Close"
					title="Close dialog"
					onclick={closeCreateProject}><X size={18} /></Button
				>
			</Dialog.Header>
			<label
				>Project name<Input
					class="mt-1.5"
					bind:value={newName}
					maxlength={120}
					required
					placeholder="e.g. Product launch"
				/></label
			>
			<label
				>Description<Textarea
					class="mt-1.5"
					maxlength={2000}
					bind:value={newDescription}
					placeholder="What will you work on here?"
				></Textarea></label
			>
			<label
				>Instructions<Textarea
					class="mt-1.5"
					maxlength={10000}
					bind:value={newInstructions}
					placeholder="How should the agent help with this project?"
				></Textarea></label
			>
			<div class="modal-actions">
				<Button variant="outline" onclick={closeCreateProject}>Cancel</Button><Button
					variant="default"
					type="submit"
					disabled={creating}>{creating ? 'Creating...' : 'Create project'}</Button
				>
			</div>
		</form>
	</Dialog.Content>
</Dialog.Root>

<style>
	.toolbar {
		display: flex;
		align-items: center;
		justify-content: space-between;
		padding: 20px 0;
		color: var(--text-dim);
		font-size: var(--text-body-md);
		line-height: var(--text-body-md--line-height);
		letter-spacing: var(--text-body-md--letter-spacing);
	}
	.toolbar-right {
		display: flex;
		gap: 6px;
	}
	.search-field {
		display: flex;
		align-items: center;
		gap: var(--space-2);
		width: 220px;
		min-height: 38px;
		padding: 7px 10px;
		background: var(--surface);
		border: 1px solid var(--border);
		border-radius: var(--radius-md);
		color: var(--text-dim);
	}
	.search-field input {
		min-width: 0;
		width: 100%;
		border: 0;
		color: var(--text-strong);
		font-family: var(--font-body);
		font-size: var(--text-body-md);
		line-height: var(--text-body-md--line-height);
		letter-spacing: var(--text-body-md--letter-spacing);
		background: transparent;
	}
	.empty-state {
		text-align: center;
		color: var(--text-dim);
		font-size: var(--text-body-md);
		line-height: var(--text-body-md--line-height);
		letter-spacing: var(--text-body-md--letter-spacing);
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
	.empty-card {
		min-height: 220px;
		padding: 18px;
		text-align: left;
		border: 1px dashed var(--border);
		border-radius: var(--radius-xl);
		background: transparent;
		display: flex;
		flex-direction: column;
		align-items: center;
		justify-content: center;
		gap: var(--space-2);
		color: var(--text-muted);
		cursor: pointer;
	}
	/* Mirrors the project Card's box so the placeholder occupies the space the real
	 * card will, keeping the grid from reflowing when the data lands. */
	.project-skeleton {
		display: flex;
		flex-direction: column;
		gap: var(--space-2);
		min-height: 220px;
		padding: 18px;
		border: 1px solid var(--border);
		border-radius: var(--radius-xl);
		background: var(--surface);
	}
	.card-top {
		display: flex;
		align-items: center;
		justify-content: space-between;
	}
	.card-icon {
		display: grid;
		place-items: center;
		width: 36px;
		height: 36px;
		border-radius: var(--radius-lg);
		background: var(--surface-hover);
		color: var(--text-body);
	}
	.card-footer {
		display: flex;
		justify-content: space-between;
		gap: 6px;
		margin-top: 18px;
		padding-top: var(--space-3);
		border-top: 1px solid var(--border);
		color: var(--text-dim);
		font-size: var(--text-body-sm);
		line-height: var(--text-body-sm--line-height);
		letter-spacing: var(--text-body-sm--letter-spacing);
	}
	/* The arrow rides in `.card-top`'s space-between row. It cannot float: the Card
	 * is a flex column, and floats are ignored on flex items. */
	.card-arrow {
		color: var(--text-faint);
	}
	.empty-card {
		display: flex;
		flex-direction: column;
		align-items: center;
		justify-content: center;
		gap: var(--space-2);
		color: var(--text-muted);
		border-style: dashed;
		background: transparent;
	}
	.empty-card strong {
		color: var(--text-strong);
		font-size: var(--text-body-md);
		line-height: var(--text-body-md--line-height);
		letter-spacing: var(--text-body-md--letter-spacing);
		font-weight: 500;
	}
	.empty-card span {
		font-size: var(--text-body-sm);
		line-height: var(--text-body-sm--line-height);
		letter-spacing: var(--text-body-sm--letter-spacing);
		color: var(--text-dim);
	}
	.dialog-shell label {
		display: block;
		margin-top: 14px;
		color: var(--text-muted);
		font-size: var(--text-body-sm);
		line-height: var(--text-body-sm--line-height);
		letter-spacing: var(--text-body-sm--letter-spacing);
		font-weight: 500;
	}
	.modal-actions {
		display: flex;
		justify-content: flex-end;
		gap: var(--space-2);
		margin-top: 22px;
	}
	/* Two columns until the cards have room for three. The sidebar still takes 260px
	 * above 760px, so three 200px cards only fit from 900px up. */
	@media (max-width: 900px) {
		.project-grid {
			grid-template-columns: 1fr 1fr;
		}
	}
	@media (max-width: 560px) {
		.project-grid {
			grid-template-columns: 1fr;
		}
		.toolbar {
			align-items: flex-start;
			gap: var(--space-3);
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
