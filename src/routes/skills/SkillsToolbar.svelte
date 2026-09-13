<script lang="ts">
	import { ChevronDown, Search } from '@lucide/svelte';
	import type { Project, ScopeFilter } from './skills-types';

	let {
		scopeFilter,
		allCount,
		personalCount,
		projectCount,
		projects,
		selectedProjectId = $bindable(''),
		query = $bindable(''),
		onselectscope
	}: {
		scopeFilter: ScopeFilter;
		allCount: number;
		personalCount: number;
		projectCount: number;
		projects: Project[];
		selectedProjectId?: string;
		query?: string;
		onselectscope: (filter: ScopeFilter) => void;
	} = $props();
</script>

<div class="toolbar">
	<div class="scope-tabs" role="group" aria-label="Filter skills by scope">
		<button class:chosen={scopeFilter === 'all'} onclick={() => onselectscope('all')}
			>All <span>{allCount}</span></button
		>
		<button class:chosen={scopeFilter === 'personal'} onclick={() => onselectscope('personal')}
			>Personal <span>{personalCount}</span></button
		>
		<button class:chosen={scopeFilter === 'project'} onclick={() => onselectscope('project')}
			>Project <span>{projectCount}</span></button
		>
	</div>
	<div class="toolbar-tools">
		{#if scopeFilter === 'project'}
			<label class="project-filter">
				<span class="sr-only">Filter by project</span>
				<select bind:value={selectedProjectId} aria-label="Filter by project">
					<option value="">All projects</option>
					{#each projects as project (project.id)}<option value={project.id}>{project.name}</option
						>{/each}
				</select><ChevronDown size={14} aria-hidden="true" />
			</label>
		{/if}
		<label class="search-field"
			><Search size={15} aria-hidden="true" /><span class="sr-only">Search skills</span><input
				bind:value={query}
				placeholder="Search skills..."
			/></label
		>
	</div>
</div>

<style>
	.toolbar {
		display: flex;
		align-items: center;
		justify-content: space-between;
		padding: 20px 0;
		color: var(--text-dim);
		font-size: var(--text-sm);
	}
	.scope-tabs {
		display: flex;
		align-items: center;
		gap: 3px;
		padding: 3px;
		background: var(--surface-2);
		border: 1px solid var(--border);
		border-radius: 7px;
	}
	.scope-tabs button {
		min-height: 30px;
		padding: 5px 10px;
		color: var(--text-muted);
		background: transparent;
		border: 0;
		border-radius: 5px;
		font-size: var(--text-xs);
		font-weight: 500;
		transition: 0.15s ease;
	}
	.scope-tabs button:hover {
		color: var(--text-strong);
	}
	.scope-tabs button.chosen {
		color: var(--text-strong);
		background: var(--surface);
		box-shadow: 0 1px 3px var(--shadow-soft);
	}
	.scope-tabs span {
		margin-left: 4px;
		color: var(--text-faint);
		font-size: 10px;
		font-variant-numeric: tabular-nums;
	}
	.toolbar-tools {
		display: flex;
		align-items: center;
		gap: 8px;
	}
	.search-field,
	.project-filter {
		display: flex;
		align-items: center;
		gap: 8px;
		min-height: 38px;
		color: var(--text-dim);
		background: var(--surface);
		border: 1px solid var(--border);
		border-radius: 6px;
	}
	.search-field {
		width: 220px;
		padding: 7px 10px;
	}
	.search-field input,
	.project-filter select {
		min-width: 0;
		color: var(--text-strong);
		font-family: var(--font-body);
		background: transparent;
		border: 0;
		outline: 0;
		font-size: var(--text-sm);
	}
	.search-field input {
		width: 100%;
	}
	.project-filter {
		position: relative;
		padding: 0 9px;
	}
	.project-filter select {
		appearance: none;
		padding: 8px 22px 8px 2px;
		cursor: pointer;
	}
	:global(.project-filter svg) {
		position: absolute;
		right: 8px;
		pointer-events: none;
	}
	.search-field:focus-within,
	.project-filter:focus-within {
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
	@media (max-width: 720px) {
		.toolbar {
			align-items: stretch;
			flex-direction: column;
		}
		.toolbar-tools {
			align-items: stretch;
			flex-direction: column;
		}
		.search-field {
			width: 100%;
		}
		.project-filter {
			width: 100%;
		}
		.project-filter select {
			width: 100%;
		}
	}
	@media (max-width: 560px) {
		.scope-tabs {
			width: 100%;
		}
		.scope-tabs button {
			flex: 1;
		}
	}
</style>
