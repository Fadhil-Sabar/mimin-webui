import { describe, expect, it } from 'vitest';
import {
	processingJobStatus,
	shouldRetryProcessingJob,
	leaseHeartbeatDelay,
	DocumentLeaseLostError,
	isProcessingJobClaimable,
	assertOwnedProcessingUpdate,
	MAX_PROCESSING_ATTEMPTS
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

	it('never reclaims an expired job after the final attempt', () => {
		expect(
			isProcessingJobClaimable('processing', MAX_PROCESSING_ATTEMPTS, {
				available: true,
				leaseExpired: true
			})
		).toBe(false);
		expect(
			isProcessingJobClaimable('processing', MAX_PROCESSING_ATTEMPTS - 1, {
				available: true,
				leaseExpired: true
			})
		).toBe(true);
	});

	it('rejects a fenced update that affected no owned row', () => {
		expect(() => assertOwnedProcessingUpdate(undefined)).toThrow(DocumentLeaseLostError);
		expect(assertOwnedProcessingUpdate({ id: 'job-1' })).toEqual({ id: 'job-1' });
	});
});
