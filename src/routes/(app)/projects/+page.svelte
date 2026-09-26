<script lang="ts">
	import { onMount } from 'svelte';
	import { resolve } from '$app/paths';
	import { ArrowUpRight, Folder, Grid2X2, List, Plus, Search, X } from '@lucide/svelte';
	import { toast } from 'svelte-sonner';
	import { Button } from '$lib/components/ui/button/index.js';
	import * as Dialog from '$lib/components/ui/dialog/index.js';
	import { Card } from '$lib/components/ui/card/index.js';
	import { Input } from '$lib/components/ui/input/index.js';
	import { Textarea } from '$lib/components/ui/textarea/index.js';
	import Topbar from '$lib/components/Topbar.svelte';
	import Page from '$lib/components/Page.svelte';
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

	function countLabel(count: number, noun: string) {
		return `${count} ${noun}${count === 1 ? '' : 's'}`;
	}
</script>

<svelte:head><title>Mimin WebUI | Projects</title></svelte:head>
<Topbar />
<Page width="wide">
	<header
		class="flex flex-col gap-4 min-[760px]:flex-row min-[760px]:items-end min-[760px]:justify-between"
	>
		<div class="min-w-0">
			<h1 class="md-headline-lg m-0 text-[var(--text-strong)]">Projects</h1>
			<p class="md-body-lg mt-1.5 mb-0 text-[var(--text-muted)]">A space for work you return to.</p>
		</div>
		<Button
			variant="default"
			class="shrink-0"
			bind:ref={createProjectTrigger}
			onclick={() => (showCreate = true)}><Plus size={16} /> New project</Button
		>
	</header>
	<div class="toolbar">
		<span class="count">{projects.length} {projects.length === 1 ? 'project' : 'projects'}</span>
		<div class="toolbar-right">
			<div class="search-field">
				<Search size={15} aria-hidden="true" /><input
					bind:value={query}
					aria-label="Search projects"
					placeholder="Search projects"
				/>
			</div>
			<div class="view-toggle" role="group" aria-label="Project layout">
				<Button
					variant="ghost"
					size="icon"
					class="view-toggle-button {view === 'grid' ? 'active' : ''}"
					aria-label="Grid view"
					aria-pressed={view === 'grid'}
					title="Grid view"
					onclick={() => (view = 'grid')}><Grid2X2 size={16} /></Button
				>
				<Button
					variant="ghost"
					size="icon"
					class="view-toggle-button {view === 'list' ? 'active' : ''}"
					aria-label="List view"
					aria-pressed={view === 'list'}
					title="List view"
					onclick={() => (view = 'list')}><List size={16} /></Button
				>
			</div>
		</div>
	</div>
	{#if loading}
		<div class="project-grid" role="status" aria-label="Loading projects">
			{#each [1, 2, 3, 4, 5, 6] as i (i)}
				<div class="project-skeleton">
					<Skeleton width="24px" height="24px" radius="var(--radius-sm)" />
					<Skeleton width="60%" height="1.375rem" />
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
		<div class:list-view={view === 'list'} class="project-grid">
			{#each filteredProjects as project (project.id)}
				<Card href={resolve(`/projects/${project.id}`)} padding="none" class="project-card">
					<div class="card-top">
						<span class="card-icon"><Folder size={22} aria-hidden="true" /></span>
						<span class="card-arrow"><ArrowUpRight size={18} aria-hidden="true" /></span>
					</div>
					<h2 class="card-title md-title-lg">{project.name}</h2>
					<p class="card-description md-body-lg">
						{project.description || 'No description yet.'}
					</p>
					<div class="card-footer">
						<span
							>{countLabel(project.fileCount ?? 0, 'file')} ·
							{countLabel(project.chatCount ?? 0, 'chat')}</span
						>
						<span>{formatDate(project.updatedAt)}</span>
					</div>
				</Card>
			{/each}
		</div>
	{/if}
</Page>
<Dialog.Root open={showCreate} onOpenChange={handleCreateOpenChange}>
	<Dialog.Content
		showCloseButton={false}
		class="w-[min(420px,100%)] max-w-none! gap-0 rounded-xl border border-[var(--border-strong)] p-6 shadow-[0_20px_50px_var(--shadow)] ring-0"
		onCloseAutoFocus={(event) => {
			// The trigger is outside the dialog, and the close focus scope lands on
			// <body> once the content unmounts, so focus is handed back here.
			event.preventDefault();
			createProjectTrigger?.focus();
		}}
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
	/* The page heading is local rather than PageHeader: the design drops the
	 * divider and lifts the title a step, and PageHeader is shared with screens
	 * that have not been redesigned yet. */
	.toolbar {
		display: flex;
		align-items: center;
		justify-content: space-between;
		gap: var(--space-4);
		padding: var(--space-6) 0 var(--space-5);
	}
	.count {
		color: var(--text-dim);
		font-size: var(--text-body-md);
		line-height: var(--text-body-md--line-height);
		letter-spacing: var(--text-body-md--letter-spacing);
	}
	.toolbar-right {
		display: flex;
		align-items: center;
		gap: var(--space-2);
		min-width: 0;
	}
	.search-field {
		display: flex;
		align-items: center;
		gap: var(--space-2);
		/* Shrinks before the view toggle and the tabs do. */
		flex: 0 1 280px;
		width: 280px;
		min-width: 0;
		min-height: 38px;
		padding: 7px 10px;
		background: var(--surface);
		border: 1px solid var(--border);
		border-radius: var(--radius-md);
		color: var(--text-dim);
	}
	.search-field:focus-within {
		border-color: var(--focus);
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
	.view-toggle {
		display: flex;
		align-items: center;
		flex: none;
		gap: 3px;
	}
	.view-toggle :global(.view-toggle-button) {
		border: 1px solid var(--border);
		background: var(--surface);
		color: var(--text-faint);
	}
	.view-toggle :global(.view-toggle-button:hover) {
		background: var(--surface-hover);
		color: var(--text-body);
	}
	.view-toggle :global(.view-toggle-button.active) {
		background: var(--surface-hover);
		color: var(--text-body);
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
		gap: var(--space-4);
	}
	.project-grid.list-view {
		grid-template-columns: 1fr;
	}
	/* Mirrors the project Card's box so the placeholder occupies the space the real
	 * card will, keeping the grid from reflowing when the data lands. */
	.project-skeleton {
		display: flex;
		flex-direction: column;
		gap: var(--space-3);
		min-height: 240px;
		padding: var(--space-5);
		border: 1px solid var(--border);
		border-radius: var(--radius-xl);
		background: var(--surface);
	}
	/* The card class is handed to the Card component, so its selector has to be global. */
	:global(.project-card) {
		display: flex;
		min-height: 240px;
		flex-direction: column;
		padding: var(--space-5);
		color: inherit;
		text-align: left;
		text-decoration: none;
		transition:
			border-color var(--duration-short4) var(--ease-standard),
			box-shadow var(--duration-short4) var(--ease-standard);
	}
	:global(.project-card:hover) {
		border-color: var(--text-dim);
		box-shadow: 0 8px 22px var(--shadow-soft);
	}
	.card-top {
		display: flex;
		align-items: flex-start;
		justify-content: space-between;
		gap: var(--space-2);
	}
	.card-icon {
		display: grid;
		place-items: center;
		color: var(--text-body);
	}
	.card-arrow {
		color: var(--text-faint);
	}
	.card-title {
		margin: var(--space-5) 0 0;
		color: var(--text-strong);
	}
	.card-description {
		display: -webkit-box;
		min-height: 3rem;
		margin: var(--space-2) 0 0;
		overflow: hidden;
		color: var(--text-muted);
		-webkit-box-orient: vertical;
		-webkit-line-clamp: 2;
		line-clamp: 2;
	}
	.card-footer {
		display: flex;
		justify-content: space-between;
		gap: var(--space-3);
		margin-top: auto;
		padding-top: var(--space-5);
		color: var(--text-dim);
		font-size: var(--text-body-md);
		line-height: var(--text-body-md--line-height);
		letter-spacing: var(--text-body-md--letter-spacing);
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
			align-items: stretch;
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
