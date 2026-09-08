import { describe, expect, it } from 'vitest';
import {
	processingJobStatus,
	shouldRetryProcessingJob
} from '../src/lib/server/files/document-processing';

describe('durable document processing', () => {
	it('exposes queued and terminal status values for UI polling', () => {
		expect(processingJobStatus('queued')).toBe('queued');
		expect(processingJobStatus('succeeded')).toBe('succeeded');
	});

	it('reclaims a failed job only while attempts remain', () => {
		expect(shouldRetryProcessingJob(1, 3)).toBe(true);
		expect(shouldRetryProcessingJob(3, 3)).toBe(false);
	});
});
