<script lang="ts">
	import {
		Download,
		ExternalLink,
		FileJson2,
		FileText,
		MessageSquarePlus,
		RefreshCw,
		Trash2
	} from '@lucide/svelte';
	import { Button } from '$lib/components/ui/button/index.js';
	import { formatBytes, formatDate } from '$lib/format';
	import { extractionLabel, extractionNeedsAttention, isProcessing } from './project-format';
	import type { ProjectFile } from './project-types';

	let {
		file,
		projectId,
		reindexing,
		onreindex,
		ondelete,
		onask
	}: {
		file: ProjectFile;
		projectId: string;
		reindexing: string | null;
		onreindex: (file: ProjectFile) => void;
		ondelete: (file: ProjectFile) => void;
		onask: (file: ProjectFile) => void;
	} = $props();

	/** The stored original, served inline for preview and as an attachment to download. */
	const fileUrl = $derived(
		`/api/projects/${encodeURIComponent(projectId)}/files/${encodeURIComponent(file.id)}`
	);
</script>

<div class="file-row">
	<div class="file-icon">
		{#if file.mimeType === 'application/json'}<FileJson2 size={16} />{:else}<FileText
				size={16}
			/>{/if}
	</div>
	<div class="file-name">
		<strong>{file.filename}</strong><small>{file.mimeType}</small>
		<span
			class="extraction-state"
			class:danger={extractionNeedsAttention(file)}
			class:working={isProcessing(file)}
		>
			{extractionLabel(file)} · {#if file.pageCount}{file.pageCount} pages ·
			{/if}{file.chunkCount ?? 0} chunks
		</span>
		{#if file.extractionError}<span class="extraction-error">{file.extractionError}</span>{/if}
	</div>
	<span class="muted desktop-only">{formatBytes(file.sizeBytes)}</span>
	<span class="muted desktop-only">{formatDate(file.createdAt)}</span>
	<div class="row-actions">
		<Button
			variant="ghost"
			size="icon"
			class="size-8 text-[var(--text-dim)]"
			href={fileUrl}
			target="_blank"
			rel="noopener noreferrer"
			aria-label={`Open ${file.filename}`}
			title="Open the original file"
		>
			<ExternalLink size={15} />
		</Button>
		<Button
			variant="ghost"
			size="icon"
			class="size-8 text-[var(--text-dim)]"
			href={`${fileUrl}?download=1`}
			aria-label={`Download ${file.filename}`}
			title="Download the original file"
		>
			<Download size={15} />
		</Button>
		<Button
			variant="ghost"
			size="icon"
			class="size-8 text-[var(--text-dim)]"
			onclick={() => onask(file)}
			aria-label={`Ask about ${file.filename}`}
			title="Start a chat about this file"
		>
			<MessageSquarePlus size={15} />
		</Button>
		<Button
			variant="ghost"
			size="icon"
			class="h-8 w-auto min-w-8 gap-1 px-1.5 text-[var(--text-dim)]"
			aria-label={`Reindex ${file.filename}`}
			title="Extract text and rebuild knowledge index"
			aria-busy={reindexing === file.id}
			disabled={reindexing !== null}
			onclick={() => onreindex(file)}
		>
			<RefreshCw size={15} class={reindexing === file.id ? 'animate-spin' : undefined} />
			{#if reindexing === file.id}<span class="row-action-label">Indexing…</span>{/if}
		</Button>
		<Button
			variant="ghost"
			size="icon-xs"
			class="text-[var(--text-dim)] hover:bg-[color-mix(in_srgb,var(--danger-text)_10%,transparent)] hover:text-[var(--danger-text)]"
			type="button"
			aria-label={`Delete ${file.filename}`}
			onclick={() => ondelete(file)}><Trash2 size={15} /></Button
		>
	</div>
</div>

<style>
	.file-row {
		display: grid;
		align-items: center;
		gap: var(--space-3);
		min-height: 52px;
		width: 100%;
		padding: 10px 14px;
		border-bottom: 1px solid var(--border);
		text-align: left;
		transition: background var(--duration-short2) var(--ease-standard);
		grid-template-columns: 32px minmax(0, 1fr) 90px 90px auto;
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
		border-radius: var(--radius-md);
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
	.row-actions {
		display: flex;
		align-items: center;
		justify-content: flex-end;
		gap: 2px;
	}
	.row-action-label {
		font-size: var(--text-body-sm);
		line-height: var(--text-body-sm--line-height);
		letter-spacing: var(--text-body-sm--letter-spacing);
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
	.extraction-state.working {
		color: var(--status-working-text);
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
			grid-template-columns: 32px minmax(0, 1fr) auto;
		}
		.desktop-only {
			display: none;
		}
		.row-action-label {
			display: none;
		}
	}
</style>
