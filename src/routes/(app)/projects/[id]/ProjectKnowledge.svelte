<script lang="ts">
	import ProjectFileRow from './ProjectFileRow.svelte';
	import ProjectUpload from './ProjectUpload.svelte';
	import { Button } from '$lib/components/ui/button/index.js';
	import type { PageInfo, ProjectFile, UploadSummary } from './project-types';

	let {
		projectId,
		filteredFiles,
		loadedCount,
		query,
		pagination,
		loadingMore,
		reindexing,
		uploading,
		indexingNotice,
		uploadSummary,
		onupload,
		onreindex,
		ondelete,
		onask,
		onloadmore
	}: {
		projectId: string;
		filteredFiles: ProjectFile[];
		loadedCount: number;
		query: string;
		pagination: PageInfo;
		loadingMore: boolean;
		reindexing: string | null;
		uploading: boolean;
		indexingNotice: string;
		uploadSummary: UploadSummary | null;
		onupload: (selected: FileList | null | undefined) => Promise<void>;
		onreindex: (file: ProjectFile) => void;
		ondelete: (file: ProjectFile) => void;
		onask: (file: ProjectFile) => void;
		onloadmore: () => void;
	} = $props();
</script>

<section class="section-block">
	<div class="section-heading">
		<div>
			<h2>Knowledge</h2>
			<p>Files available to the agent in this project.</p>
			{#if query.trim()}<small class="search-scope">Searching all project files…</small>{/if}
		</div>
	</div>
	<ProjectUpload {uploading} {indexingNotice} {uploadSummary} {onupload} />
	{#if filteredFiles.length > 0}
		<div class="file-list">
			{#each filteredFiles as file (file.id)}
				<ProjectFileRow {file} {projectId} {reindexing} {onreindex} {ondelete} {onask} />
			{/each}
		</div>
	{:else if query.trim() || loadedCount > 0}
		<div class="empty-state filtered-empty">No files match “{query}”.</div>
	{/if}
	{#if pagination.hasMore}
		<Button
			class="mt-[10px] w-full"
			variant="outline"
			type="button"
			onclick={() => void onloadmore()}
			disabled={loadingMore}
			aria-busy={loadingMore}
		>
			{loadingMore ? 'Loading files…' : `Load more files (${loadedCount} of ${pagination.total})`}
		</Button>
	{/if}
</section>

<style>
	.section-block {
		padding-top: var(--space-6);
	}
	.section-heading {
		display: flex;
		align-items: flex-end;
		justify-content: space-between;
		gap: var(--space-4);
		margin-bottom: var(--space-3);
	}
	.section-heading h2 {
		margin: 0;
		font-family: var(--font-body);
		font-size: var(--text-body-lg);
		line-height: var(--text-body-lg--line-height);
		letter-spacing: var(--text-body-lg--letter-spacing);
		color: var(--text-strong);
	}
	.section-heading p {
		margin: 3px 0 0;
		color: var(--text-muted);
		font-size: var(--text-body-md);
		line-height: var(--text-body-md--line-height);
		letter-spacing: var(--text-body-md--letter-spacing);
	}
	.search-scope {
		display: block;
		margin-top: var(--space-1);
		color: var(--text-dim);
		font-size: var(--text-body-sm);
		line-height: var(--text-body-sm--line-height);
		letter-spacing: var(--text-body-sm--letter-spacing);
	}
	.file-list {
		overflow: hidden;
		background: var(--surface);
		border: 1px solid var(--border);
		border-radius: var(--radius-lg);
	}
	.empty-state {
		text-align: center;
		color: var(--text-dim);
		font-size: var(--text-body-md);
		line-height: var(--text-body-md--line-height);
		letter-spacing: var(--text-body-md--letter-spacing);
		padding: 34px 0;
	}
	.filtered-empty {
		padding: var(--space-5) 0;
	}
</style>
