<script lang="ts">
	import { Upload } from '@lucide/svelte';
	import type { UploadSummary } from './project-types';

	let {
		uploading,
		indexingNotice,
		uploadSummary,
		onupload
	}: {
		uploading: boolean;
		indexingNotice: string;
		uploadSummary: UploadSummary | null;
		onupload: (selected: FileList | null | undefined) => Promise<void>;
	} = $props();

	let dragActive = $state(false);
	let fileInput = $state<HTMLInputElement | undefined>(undefined);

	async function runUpload(selected: FileList | null | undefined) {
		try {
			await onupload(selected);
		} finally {
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
		void runUpload(event.dataTransfer?.files);
	}
</script>

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
{#if indexingNotice}<p role="status">{indexingNotice}</p>{/if}
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
	onchange={(e) => void runUpload(e.currentTarget.files)}
/>

<style>
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
		font-size: var(--text-body-md);
		line-height: var(--text-body-md--line-height);
		letter-spacing: var(--text-body-md--letter-spacing);
		font-weight: 500;
	}
	.upload-zone small {
		display: block;
		color: var(--text-dim);
		font-size: var(--text-body-sm);
		line-height: var(--text-body-sm--line-height);
		letter-spacing: var(--text-body-sm--letter-spacing);
		margin-top: 2px;
	}
	.upload-summary {
		margin-top: 10px;
		padding: 10px 14px;
		color: var(--text-muted);
		background: var(--surface-2);
		border: 1px solid var(--border);
		border-radius: 6px;
		font-size: var(--text-body-sm);
		line-height: var(--text-body-sm--line-height);
		letter-spacing: var(--text-body-sm--letter-spacing);
	}
	.upload-summary strong {
		color: var(--status-ok-text);
		font-weight: 500;
	}
	.upload-summary ul {
		margin: 6px 0 0 16px;
		padding: 0;
		color: var(--danger-text);
		line-height: var(--text-body-md--line-height);
	}
	.hidden-input {
		display: none;
	}
</style>
