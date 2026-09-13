import type { ProjectFile } from './project-types';

export function formatSize(bytes: number) {
	return bytes > 1024 * 1024
		? `${(bytes / 1024 / 1024).toFixed(1)} MB`
		: `${Math.max(1, Math.round(bytes / 1024))} KB`;
}

export function formatDate(iso: string) {
	return new Date(iso).toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
}

export function extractionNeedsAttention(file: ProjectFile) {
	return Boolean(
		file.extractionError ||
		['failed', 'empty', 'not_started', 'partial', 'truncated'].includes(
			file.extractionStatus ?? ''
		) ||
		(file.chunkCount ?? 0) === 0
	);
}

export function extractionLabel(file: ProjectFile) {
	if (file.extractionError || file.extractionStatus === 'failed') return 'Needs attention';
	switch (file.extractionStatus) {
		case 'not_started':
			return 'Not indexed';
		case 'pending':
		case 'queued':
			return 'Queued';
		case 'processing':
			return 'Processing';
		case 'empty':
			return 'No text found';
		case 'truncated':
		case 'partial':
			return 'Partially indexed';
		case 'extracted':
		case 'complete':
		case 'completed':
		case 'success':
		default:
			return 'Ready';
	}
}
