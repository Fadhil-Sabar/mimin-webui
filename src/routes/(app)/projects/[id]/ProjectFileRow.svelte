<script lang="ts">
	import { FileJson2, FileText, RefreshCw, Trash2 } from '@lucide/svelte';
	import { Button } from '$lib/components/ui/button/index.js';
	import { formatBytes, formatDate } from '$lib/format';
	import { extractionLabel, extractionNeedsAttention } from './project-format';
	import type { ProjectFile } from './project-types';

	let {
		file,
		reindexing,
		onreindex,
		ondelete
	}: {
		file: ProjectFile;
		reindexing: string | null;
		onreindex: (file: ProjectFile) => void;
		ondelete: (file: ProjectFile) => void;
	} = $props();
</script>

<div class="file-row">
	<div class="file-icon">
		{#if file.mimeType === 'application/json'}<FileJson2 size={16} />{:else}<FileText
				size={16}
			/>{/if}
	</div>
	<div class="file-name">
		<strong>{file.filename}</strong><small>{file.mimeType}</small>
		<span class="extraction-state {extractionNeedsAttention(file) ? 'danger' : ''}">
			{extractionLabel(file)} · {#if file.pageCount}{file.pageCount} pages ·
			{/if}{file.chunkCount ?? 0} chunks
		</span>
		{#if file.extractionError}<span class="extraction-error">{file.extractionError}</span>{/if}
	</div>
	<span class="muted desktop-only">{formatBytes(file.sizeBytes)}</span>
	<span class="muted desktop-only">{formatDate(file.createdAt)}</span>
	<Button
		variant="ghost"
		size="icon"
		class="h-9 w-auto min-w-9 px-2"
		aria-label={`Reindex ${file.filename}`}
		title="Extract text and rebuild knowledge index"
		disabled={reindexing !== null}
		onclick={() => onreindex(file)}
		><RefreshCw size={16} />{reindexing === file.id ? 'Indexing…' : ''}</Button
	>
	<button class="row-menu" aria-label={`Delete ${file.filename}`} onclick={() => ondelete(file)}
		><Trash2 size={16} /></button
	>
</div>

<style>
	.file-row {
		display: grid;
		align-items: center;
		gap: 12px;
		min-height: 52px;
		width: 100%;
		padding: 10px 14px;
		border-bottom: 1px solid var(--border);
		text-align: left;
		transition: background 0.12s ease;
		grid-template-columns: 32px minmax(0, 1fr) 90px 90px 28px;
	}
	.file-row:last-child {
		border-bottom: 0;
	}
	.file-row:hover {
		background: var(--surface-2);
	}
	.file-icon {
		display: grid;
		place-items: center;
		width: 30px;
		height: 30px;
		color: var(--text-muted);
		background: var(--surface-2);
		border: 1px solid var(--border);
		border-radius: 6px;
	}
	.file-name {
		min-width: 0;
	}
	.file-name strong,
	.file-name small {
		display: block;
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
	}
	.file-name strong {
		font-size: var(--text-body-md);
		line-height: var(--text-body-md--line-height);
		letter-spacing: var(--text-body-md--letter-spacing);
		font-weight: 500;
		color: var(--text-strong);
	}
	.file-name small {
		color: var(--text-dim);
		font-size: var(--text-body-sm);
		line-height: var(--text-body-sm--line-height);
		letter-spacing: var(--text-body-sm--letter-spacing);
		margin-top: 1px;
	}
	.muted {
		color: var(--text-dim);
		font-size: var(--text-body-sm);
		line-height: var(--text-body-sm--line-height);
		letter-spacing: var(--text-body-sm--letter-spacing);
		font-variant-numeric: tabular-nums;
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
		transition:
			color 0.15s ease,
			background 0.15s ease;
	}
	.row-menu:hover {
		color: var(--danger-text);
		background: color-mix(in srgb, var(--danger-text) 10%, transparent);
	}
	.extraction-state {
		display: inline-block;
		margin-top: 3px;
		color: var(--status-ok-text);
		font-size: var(--text-body-sm);
		line-height: var(--text-body-sm--line-height);
		letter-spacing: var(--text-body-sm--letter-spacing);
		font-weight: 400;
	}
	.extraction-state.danger,
	.extraction-error {
		color: var(--danger-text);
	}
	.extraction-error {
		display: block;
		margin-top: 2px;
		font-size: var(--text-body-sm);
		line-height: var(--text-body-sm--line-height);
		letter-spacing: var(--text-body-sm--letter-spacing);
		white-space: normal;
	}
	@media (max-width: 760px) {
		.file-row {
			grid-template-columns: 32px minmax(0, 1fr) 28px;
		}
		.desktop-only {
			display: none;
		}
	}
</style>
