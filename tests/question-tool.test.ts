import { describe, expect, it, vi } from 'vitest';
import {
	createAskQuestionTool,
	formatQuestionOutputForLlm
} from '../src/lib/server/ai/tools/question.tool';
import { resolveQuestionAnswer } from '../src/lib/server/ai/question-broker';

describe('ask_question tool', () => {
	const sampleContext = {
		userId: 'user-1',
		conversationId: 'conv-1',
		turnToken: 'turn-1'
	};

	it('normalizes single question input using prepareArguments', () => {
		const tool = createAskQuestionTool(sampleContext, vi.fn());
		const normalized = tool.prepareArguments!({
			question: 'What database do you want to use?',
			options: ['PostgreSQL', 'SQLite'],
			is_multi_select: true
		});

		expect(normalized).toEqual({
			questions: [
				{
					id: undefined,
					question: 'What database do you want to use?',
					options: ['PostgreSQL', 'SQLite'],
					isMultiSelect: true
				}
			]
		});
	});

	it('normalizes questions array with snake_case is_multi_select', () => {
		const tool = createAskQuestionTool(sampleContext, vi.fn());
		const normalized = tool.prepareArguments!({
			questions: [
				{
					question: 'Which styling solution?',
					options: ['Tailwind', 'CSS Modules'],
					is_multi_select: false
				}
			]
		});

		expect(normalized).toEqual({
			questions: [
				{
					id: 'q-1',
					question: 'Which styling solution?',
					options: ['Tailwind', 'CSS Modules'],
					isMultiSelect: false
				}
			]
		});
	});

	it('formats LLM output for answered and skipped responses', () => {
		const questions = [
			{
				question: 'Which database?',
				options: ['PostgreSQL', 'MySQL']
			}
		];

		const answeredText = formatQuestionOutputForLlm(questions, {
			answers: [
				{
					question: 'Which database?',
					selected: ['PostgreSQL'],
					custom: 'Use Supabase pooling'
				}
			]
		});
		expect(answeredText).toContain('Which database?');
		expect(answeredText).toContain('Selected: PostgreSQL');
		expect(answeredText).toContain('Custom note: "Use Supabase pooling"');

		const skippedText = formatQuestionOutputForLlm(questions, {
			answers: [],
			skipped: true
		});
		expect(skippedText).toContain('user skipped');
	});

	it('executes tool, emits event, and returns structured result', async () => {
		const emit = vi.fn();
		const tool = createAskQuestionTool(sampleContext, emit);

		const executionPromise = tool.execute('call-123', {
			questions: [
				{
					question: 'Choose an environment',
					options: ['Development', 'Production']
				}
			]
		});

		expect(emit).toHaveBeenCalledWith(
			expect.objectContaining({
				type: 'question.ask',
				requestId: 'call-123',
				conversationId: 'conv-1'
			})
		);

		resolveQuestionAnswer('call-123', 'user-1', {
			answers: [
				{
					questionIndex: 0,
					question: 'Choose an environment',
					selected: ['Development']
				}
			]
		});

		const result = await executionPromise;
		expect(result.content[0].type).toBe('text');
		const firstContent = result.content[0];
		if (firstContent.type === 'text') {
			expect(firstContent.text).toContain('Selected: Development');
		}
		expect(result.details).toMatchObject({
			questions: [
				{
					id: 'q-1',
					question: 'Choose an environment',
					options: ['Development', 'Production'],
					isMultiSelect: false
				}
			],
			skipped: false
		});
	});
});
