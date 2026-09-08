import { describe, expect, it } from 'vitest';
import {
	processingJobStatus,
	shouldRetryProcessingJob,
	leaseHeartbeatDelay,
	DocumentLeaseLostError
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

	it('uses a bounded heartbeat interval for long-running work', () => {
		expect(leaseHeartbeatDelay(9_000)).toBe(3_000);
		expect(leaseHeartbeatDelay(1_000)).toBe(1_000);
	});

	it('has a distinct error for fenced lease loss', () => {
		expect(new DocumentLeaseLostError().message).toBe('DOCUMENT_PROCESSING_LEASE_LOST');
	});
});
