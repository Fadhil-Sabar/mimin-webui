import type { ProjectFile } from './project-types';

/** Document-worker states that mean work is still in flight. */
const ACTIVE_PROCESSING_STATUSES = ['queued', 'processing'];

/** True while the document worker still has work for this file. */
export function isProcessing(file: ProjectFile) {
	return ACTIVE_PROCESSING_STATUSES.includes(file.processingStatus ?? '');
}

export function extractionNeedsAttention(file: ProjectFile) {
	// A file the worker is still handling is not a problem, and its chunk count is
	// still zero while it runs — treating that as attention is what made every fresh
	// upload look broken.
	if (isProcessing(file)) return false;
	return Boolean(
		file.extractionError ||
		file.processingStatus === 'failed' ||
		['failed', 'empty', 'not_started', 'partial', 'truncated'].includes(
			file.extractionStatus ?? ''
		) ||
		(file.chunkCount ?? 0) === 0
	);
}

export function extractionLabel(file: ProjectFile) {
	if (
		file.extractionError ||
		file.extractionStatus === 'failed' ||
		file.processingStatus === 'failed'
	)
		return 'Needs attention';
	// The worker's status is the live signal; extraction_status is only written once
	// extraction has actually run, which is after the file leaves the queue.
	if (file.processingStatus === 'queued') return 'Queued';
	if (file.processingStatus === 'processing') return 'Processing';
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
