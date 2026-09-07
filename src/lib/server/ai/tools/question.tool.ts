import { Type, type Static } from 'typebox';
import type { AgentTool } from '@earendil-works/pi-agent-core';
import {
	requestQuestionAnswer,
	type QuestionContext,
	type QuestionEvent,
	type QuestionItem,
	type QuestionResult
} from '../question-broker';

const optionSchema = Type.Union([
	Type.String({ minLength: 1, maxLength: 500 }),
	Type.Object({
		label: Type.String({ minLength: 1, maxLength: 500 }),
		description: Type.Optional(Type.String({ maxLength: 500 }))
	})
]);

const questionItemSchema = Type.Object({
	id: Type.Optional(Type.String()),
	question: Type.String({ minLength: 1, maxLength: 1000 }),
	options: Type.Optional(Type.Array(optionSchema, { minItems: 1, maxItems: 10 })),
	isMultiSelect: Type.Optional(Type.Boolean())
});

export const askQuestionParameters = Type.Object({
	questions: Type.Array(questionItemSchema, { minItems: 1, maxItems: 5 })
});

export function formatQuestionOutputForLlm(
	questions: QuestionItem[],
	result: QuestionResult
): string {
	if (result.skipped) {
		return 'The user skipped answering the question(s). Proceed using reasonable defaults, and explicitly state any assumptions made.';
	}

	const lines = ['User responses:'];
	for (let i = 0; i < questions.length; i++) {
		const q = questions[i];
		const a =
			result.answers?.find(
				(ans) => ans.questionIndex === i || (ans.question && ans.question === q.question)
			) ?? result.answers?.[i];

		const parts: string[] = [];
		if (a?.selected && a.selected.length > 0) {
			parts.push(`Selected: ${a.selected.join(', ')}`);
		}
		if (a?.custom && a.custom.trim()) {
			parts.push(`Custom note: "${a.custom.trim()}"`);
		}

		const ansStr = parts.length > 0 ? parts.join(' | ') : 'No answer provided';
		lines.push(`- Question "${q.question}": ${ansStr}`);
	}

	return lines.join('\n');
}

export function createAskQuestionTool(
	context: QuestionContext,
	emit: (event: QuestionEvent) => void
): AgentTool<typeof askQuestionParameters> {
	return {
		name: 'ask_question',
		label: 'Ask Question',
		description:
			'Use this tool to ask the user clarifying questions or present options to choose from when the user prompt is ambiguous, requirements are underspecified, or key decisions need to be made before proceeding. Provide clear options for the user or allow them to specify custom input.',
		parameters: askQuestionParameters,
		prepareArguments: (args: unknown): Static<typeof askQuestionParameters> => {
			if (args && typeof args === 'object') {
				const obj = args as Record<string, unknown>;
				// Allow single question shape: { question: "...", options?: [...], isMultiSelect?: boolean }
				if (typeof obj.question === 'string' && !Array.isArray(obj.questions)) {
					const options = Array.isArray(obj.options)
						? (obj.options as Array<string | { label: string; description?: string }>)
						: undefined;
					return {
						questions: [
							{
								id: typeof obj.id === 'string' ? obj.id : undefined,
								question: obj.question,
								options,
								isMultiSelect: Boolean(obj.isMultiSelect ?? obj.is_multi_select)
							}
						]
					};
				}
				// Allow questions array with snake_case is_multi_select
				if (Array.isArray(obj.questions)) {
					return {
						questions: obj.questions.map((q: unknown, idx: number) => {
							if (typeof q === 'string') {
								return { id: `q-${idx + 1}`, question: q };
							}
							if (q && typeof q === 'object') {
								const item = q as Record<string, unknown>;
								const options = Array.isArray(item.options)
									? (item.options as Array<string | { label: string; description?: string }>)
									: undefined;
								return {
									id: typeof item.id === 'string' ? item.id : `q-${idx + 1}`,
									question:
										typeof item.question === 'string' ? item.question : String(item.question ?? ''),
									options,
									isMultiSelect: Boolean(item.isMultiSelect ?? item.is_multi_select)
								};
							}
							return {
								id: `q-${idx + 1}`,
								question: String(q ?? '')
							};
						})
					};
				}
			}
			return args as Static<typeof askQuestionParameters>;
		},
		execute: async (toolCallId, params, signal) => {
			const normalizedQuestions: QuestionItem[] = params.questions.map((q, idx) => ({
				id: q.id || `q-${idx + 1}`,
				question: q.question.trim(),
				options: q.options,
				isMultiSelect: Boolean(q.isMultiSelect)
			}));

			const result = await requestQuestionAnswer(
				context,
				toolCallId,
				normalizedQuestions,
				emit,
				signal
			);

			const textOutput = formatQuestionOutputForLlm(normalizedQuestions, result);

			return {
				content: [{ type: 'text', text: textOutput }],
				details: {
					questions: normalizedQuestions,
					answers: result.answers,
					skipped: Boolean(result.skipped)
				}
			};
		}
	};
}
