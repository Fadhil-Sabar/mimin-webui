import { describe, expect, it, vi, beforeEach } from 'vitest';
import {
	requestQuestionAnswer,
	resolveQuestionAnswer,
	cancelQuestionRequests,
	clearAllQuestionRequests,
	isQuestionPending,
	type QuestionItem
} from '../src/lib/server/ai/question-broker';

describe('question broker', () => {
	beforeEach(() => {
		clearAllQuestionRequests();
	});

	const sampleQuestions: QuestionItem[] = [
		{
			id: 'q-1',
			question: 'Which framework do you prefer?',
			options: ['SvelteKit', 'Next.js', 'Remix'],
			isMultiSelect: false
		}
	];

	const sampleContext = {
		userId: 'user-1',
		conversationId: 'conv-123',
		turnToken: 'turn-abc'
	};

	it('emits question.ask event and resolves when answered', async () => {
		const emit = vi.fn();
		const promise = requestQuestionAnswer(sampleContext, 'req-1', sampleQuestions, emit);

		expect(isQuestionPending('req-1')).toBe(true);
		expect(emit).toHaveBeenCalledWith({
			type: 'question.ask',
			requestId: 'req-1',
			conversationId: 'conv-123',
			turnToken: 'turn-abc',
			questions: sampleQuestions
		});

		const resolved = resolveQuestionAnswer('req-1', 'user-1', {
			answers: [
				{
					questionIndex: 0,
					question: 'Which framework do you prefer?',
					selected: ['SvelteKit']
				}
			],
			skipped: false
		});

		expect(resolved).toBe(true);
		expect(isQuestionPending('req-1')).toBe(false);

		const result = await promise;
		expect(result.skipped).toBe(false);
		expect(result.answers).toEqual([
			{
				questionIndex: 0,
				question: 'Which framework do you prefer?',
				selected: ['SvelteKit']
			}
		]);
	});

	it('rejects resolution if userId does not match', async () => {
		const emit = vi.fn();
		const promise = requestQuestionAnswer(sampleContext, 'req-2', sampleQuestions, emit);

		const resolved = resolveQuestionAnswer('req-2', 'user-other', {
			answers: [],
			skipped: false
		});

		expect(resolved).toBe(false);
		expect(isQuestionPending('req-2')).toBe(true);

		// Resolve properly to clean up
		resolveQuestionAnswer('req-2', 'user-1', { answers: [], skipped: true });
		await promise;
	});

	it('cancels pending requests when conversation turn is canceled', async () => {
		const emit = vi.fn();
		const promise = requestQuestionAnswer(sampleContext, 'req-3', sampleQuestions, emit);

		const canceledCount = cancelQuestionRequests('conv-123', 'turn-abc');
		expect(canceledCount).toBe(1);
		expect(isQuestionPending('req-3')).toBe(false);

		await expect(promise).rejects.toThrow('QUESTION_REQUEST_CANCELED');
	});

	it('aborts when signal is canceled', async () => {
		const emit = vi.fn();
		const controller = new AbortController();

		const promise = requestQuestionAnswer(
			sampleContext,
			'req-4',
			sampleQuestions,
			emit,
			controller.signal
		);

		controller.abort();
		await expect(promise).rejects.toThrow('QUESTION_REQUEST_CANCELED');
		expect(isQuestionPending('req-4')).toBe(false);
	});

	it('resolves gracefully as skipped on timeout without crashing', async () => {
		const emit = vi.fn();
		const promise = requestQuestionAnswer(
			sampleContext,
			'req-5',
			sampleQuestions,
			emit,
			undefined,
			10 // 10ms timeout for testing
		);

		const result = await promise;
		expect(result.skipped).toBe(true);
		expect(result.answers).toEqual([]);
		expect(isQuestionPending('req-5')).toBe(false);
	});
});
