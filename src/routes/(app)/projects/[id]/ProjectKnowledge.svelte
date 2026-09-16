<script lang="ts">
	import ProjectFileRow from './ProjectFileRow.svelte';
	import ProjectUpload from './ProjectUpload.svelte';
	import type { PageInfo, ProjectFile, UploadSummary } from './project-types';

	let {
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
		onloadmore
	}: {
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
				<ProjectFileRow {file} {reindexing} {onreindex} {ondelete} />
			{/each}
		</div>
	{:else if query.trim() || loadedCount > 0}
		<div class="empty-state filtered-empty">No files match “{query}”.</div>
	{/if}
	{#if pagination.hasMore}
		<button
			class="load-more"
			type="button"
			onclick={() => void onloadmore()}
			disabled={loadingMore}
			aria-busy={loadingMore}
		>
			{loadingMore ? 'Loading files…' : `Load more files (${loadedCount} of ${pagination.total})`}
		</button>
	{/if}
</section>

<style>
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
		font-size: var(--text-body-lg);
		line-height: var(--text-body-lg--line-height);
		letter-spacing: var(--text-body-lg--letter-spacing);
		font-weight: 500;
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
		margin-top: 4px;
		color: var(--text-dim);
		font-size: var(--text-body-sm);
		line-height: var(--text-body-sm--line-height);
		letter-spacing: var(--text-body-sm--letter-spacing);
	}
	.file-list {
		overflow: hidden;
		background: var(--surface);
		border: 1px solid var(--border);
		border-radius: 8px;
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
		padding: 24px 0;
	}
</style>
