export type QuestionOption = {
	label: string;
	description?: string;
};

export type QuestionItem = {
	id?: string;
	question: string;
	options?: Array<string | QuestionOption>;
	isMultiSelect?: boolean;
};

export type QuestionAnswer = {
	questionIndex?: number;
	question?: string;
	selected?: string[];
	custom?: string;
};

export type QuestionResult = {
	answers: QuestionAnswer[];
	skipped?: boolean;
};

export type QuestionContext = {
	userId: string;
	conversationId: string;
	turnToken: string;
};

export type QuestionEvent = {
	type: 'question.ask';
	requestId: string;
	conversationId: string;
	turnToken: string;
	questions: QuestionItem[];
};

export const QUESTION_TIMEOUT_MS = 5 * 60 * 1000; // 5 minutes

export type PendingQuestionRequest = QuestionContext & {
	requestId: string;
	questions: QuestionItem[];
	resolve: (result: QuestionResult) => void;
	reject: (error: Error) => void;
	timer: ReturnType<typeof setTimeout>;
};

const pendingQuestions = new Map<string, PendingQuestionRequest>();

export function isQuestionPending(requestId: string): boolean {
	return pendingQuestions.has(requestId);
}

export function requestQuestionAnswer(
	context: QuestionContext,
	requestId: string,
	questions: QuestionItem[],
	emit: (event: QuestionEvent) => void,
	signal?: AbortSignal,
	timeoutMs = QUESTION_TIMEOUT_MS
): Promise<QuestionResult> {
	if (signal?.aborted) {
		return Promise.reject(new Error('QUESTION_REQUEST_CANCELED'));
	}

	return new Promise<QuestionResult>((resolve, reject) => {
		const timer = setTimeout(() => {
			pendingQuestions.delete(requestId);
			// If timed out, resolve gracefully as skipped so the turn does not crash
			resolve({
				answers: [],
				skipped: true
			});
		}, timeoutMs);

		const pending: PendingQuestionRequest = {
			...context,
			requestId,
			questions,
			resolve: (result) => {
				clearTimeout(timer);
				pendingQuestions.delete(requestId);
				resolve(result);
			},
			reject: (err) => {
				clearTimeout(timer);
				pendingQuestions.delete(requestId);
				reject(err);
			},
			timer
		};

		pendingQuestions.set(requestId, pending);

		if (signal) {
			signal.addEventListener(
				'abort',
				() => {
					pending.reject(new Error('QUESTION_REQUEST_CANCELED'));
				},
				{ once: true }
			);
		}

		emit({
			type: 'question.ask',
			requestId,
			conversationId: context.conversationId,
			turnToken: context.turnToken,
			questions
		});
	});
}

export function resolveQuestionAnswer(
	requestId: string,
	userId: string,
	result: QuestionResult
): boolean {
	const pending = pendingQuestions.get(requestId);
	if (!pending) return false;
	if (pending.userId && pending.userId !== userId) return false;

	pending.resolve(result);
	return true;
}

export function cancelQuestionRequests(conversationId: string, turnToken?: string): number {
	let canceled = 0;
	for (const [id, pending] of pendingQuestions.entries()) {
		if (
			pending.conversationId === conversationId &&
			(!turnToken || pending.turnToken === turnToken)
		) {
			clearTimeout(pending.timer);
			pending.reject(new Error('QUESTION_REQUEST_CANCELED'));
			pendingQuestions.delete(id);
			canceled++;
		}
	}
	return canceled;
}

export function clearAllQuestionRequests(): void {
	for (const pending of pendingQuestions.values()) {
		clearTimeout(pending.timer);
		pending.reject(new Error('QUESTION_REQUEST_CANCELED'));
	}
	pendingQuestions.clear();
}
