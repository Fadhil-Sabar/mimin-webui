import { describe, expect, it } from 'vitest';
import {
	describeTurnOutcome,
	NO_ANSWER_NOTICE,
	persistedStopReason,
	TRUNCATED_ANSWER_NOTICE,
	TRUNCATED_NOTICE
} from '../src/lib/server/ai/turn-outcome';

describe('describeTurnOutcome', () => {
	it('reports a provider output limit as truncated', () => {
		const outcome = describeTurnOutcome({
			stopReason: 'length',
			rawStopReason: 'length',
			text: '',
			toolCallCount: 0
		});
		expect(outcome).toEqual({
			incomplete: true,
			kind: 'truncated',
			notice: TRUNCATED_NOTICE
		});
	});

	it('distinguishes a cut-off answer from a cut-off reasoning phase', () => {
		const partial = describeTurnOutcome({ stopReason: 'length', text: 'Half an answer' });
		expect(partial.kind).toBe('truncated');
		expect(partial.notice).toBe(TRUNCATED_ANSWER_NOTICE);
		expect(describeTurnOutcome({ stopReason: 'length', text: '' }).notice).toBe(TRUNCATED_NOTICE);
	});

	it('reports a clean stop with reasoning only as no-answer', () => {
		const outcome = describeTurnOutcome({ stopReason: 'stop', text: '', toolCallCount: 0 });
		expect(outcome.kind).toBe('no-answer');
		expect(outcome.incomplete).toBe(true);
		expect(outcome.notice).toBe(NO_ANSWER_NOTICE);
	});

	it('accepts the raw finish_reason when pi normalises it away', () => {
		const outcome = describeTurnOutcome({
			stopReason: 'stop',
			rawStopReason: 'length',
			text: '',
			toolCallCount: 0
		});
		expect(outcome.kind).toBe('truncated');
	});

	it('treats whitespace-only text as no answer', () => {
		expect(describeTurnOutcome({ stopReason: 'stop', text: '\n   ' }).incomplete).toBe(true);
	});

	it('stays quiet for a completed answer', () => {
		expect(describeTurnOutcome({ stopReason: 'stop', text: 'Here you go.' })).toEqual({
			incomplete: false,
			kind: null,
			notice: ''
		});
	});

	it('stays quiet when the message requested tools', () => {
		expect(
			describeTurnOutcome({ stopReason: 'toolUse', text: '', toolCallCount: 2 }).incomplete
		).toBe(false);
	});

	it('does not flag provider errors or a user stop', () => {
		expect(describeTurnOutcome({ stopReason: 'error', text: '' }).incomplete).toBe(false);
		expect(describeTurnOutcome({ stopReason: 'aborted', text: '' }).incomplete).toBe(false);
	});
});

describe('persistedStopReason', () => {
	it('keeps pi stop reasons', () => {
		expect(persistedStopReason(describeTurnOutcome({ text: 'ok' }), 'stop')).toBe('stop');
		expect(
			persistedStopReason(describeTurnOutcome({ stopReason: 'length', text: '' }), 'length')
		).toBe('length');
	});

	it('marks a reasoning-only turn so the transcript can flag it later', () => {
		expect(persistedStopReason(describeTurnOutcome({ text: '' }), 'stop')).toBe('no-answer');
	});

	it('falls back to null when the provider reported nothing', () => {
		expect(persistedStopReason(describeTurnOutcome({ text: 'ok' }), undefined)).toBeNull();
	});
});
