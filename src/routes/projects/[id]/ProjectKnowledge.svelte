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
			{#if query.trim()}<small class="search-scope">Search filters loaded files only.</small>{/if}
		</div>
	</div>
	<ProjectUpload {uploading} {indexingNotice} {uploadSummary} {onupload} />
	{#if filteredFiles.length > 0}
		<div class="file-list">
			{#each filteredFiles as file (file.id)}
				<ProjectFileRow {file} {reindexing} {onreindex} {ondelete} />
			{/each}
		</div>
	{:else if loadedCount > 0}
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
	.file-list {
		overflow: hidden;
		background: var(--surface);
		border: 1px solid var(--border);
		border-radius: 8px;
	}
	.empty-state {
		text-align: center;
		color: var(--text-dim);
		font-size: var(--text-sm);
		padding: 34px 0;
		line-height: 1.5;
	}
	.filtered-empty {
		padding: 24px 0;
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
</style>
