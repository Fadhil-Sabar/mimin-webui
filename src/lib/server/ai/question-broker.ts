import { and, eq, lt } from 'drizzle-orm';
import { getDb, schema } from '$lib/server/db/client';
import { PENDING_TURN_POLL_MS } from '../browser/consent';

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
	poll?: ReturnType<typeof setInterval>;
};

const pendingQuestions = new Map<string, PendingQuestionRequest>();

export function isQuestionPending(requestId: string): boolean {
	return pendingQuestions.has(requestId);
}

async function insertPendingQuestionRow(
	context: QuestionContext,
	requestId: string,
	timeoutMs: number
) {
	try {
		const db = getDb();
		// Opportunistic sweep so prompts whose waiter died do not accumulate.
		await db
			.delete(schema.pendingTurnRequests)
			.where(lt(schema.pendingTurnRequests.expiresAt, new Date()));
		await db.insert(schema.pendingTurnRequests).values({
			requestId,
			kind: 'question',
			conversationId: context.conversationId,
			userId: context.userId,
			turnToken: context.turnToken,
			expiresAt: new Date(Date.now() + timeoutMs)
		});
	} catch {
		// Without the shared row, answers are limited to this instance.
	}
}

async function markPendingQuestionRow(requestId: string, status: string, answer?: unknown) {
	try {
		const db = getDb();
		await db
			.update(schema.pendingTurnRequests)
			.set({ status, answer: answer ?? null, updatedAt: new Date() })
			.where(eq(schema.pendingTurnRequests.requestId, requestId));
	} catch {
		// Best effort; the waiter also settles from the local promise.
	}
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
			const current = pendingQuestions.get(requestId);
			if (!current) return;
			if (current.poll) clearInterval(current.poll);
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
				if (pending.poll) clearInterval(pending.poll);
				pendingQuestions.delete(requestId);
				resolve(result);
			},
			reject: (err) => {
				clearTimeout(timer);
				if (pending.poll) clearInterval(pending.poll);
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

		// Shared-row handoff: an answer or cancel recorded on another instance
		// settles this waiter through the poll below.
		void insertPendingQuestionRow(context, requestId, timeoutMs);
		// The emit above may have already rejected the prompt; do not leak a poller.
		if (pendingQuestions.get(requestId) !== pending) return;
		pending.poll = setInterval(() => {
			void (async () => {
				try {
					const db = getDb();
					const [row] = await db
						.select({
							status: schema.pendingTurnRequests.status,
							answer: schema.pendingTurnRequests.answer
						})
						.from(schema.pendingTurnRequests)
						.where(eq(schema.pendingTurnRequests.requestId, requestId));
					const current = pendingQuestions.get(requestId);
					if (!current || !row) return;
					if (row.status === 'canceled') {
						current.reject(new Error('QUESTION_REQUEST_CANCELED'));
						return;
					}
					if (row.status === 'answered') {
						current.resolve((row.answer as QuestionResult | null) ?? { answers: [] });
					}
				} catch {
					// Shared row unavailable; the local promise and timeout still apply.
				}
			})();
		}, PENDING_TURN_POLL_MS);
	});
}

/**
 * Settle a pending question from the authenticated answer endpoint. When the
 * waiter lives on another instance, the answer is recorded on the shared row
 * instead and picked up by that instance's poll.
 */
export async function resolveQuestionAnswer(
	requestId: string,
	userId: string,
	result: QuestionResult
): Promise<boolean> {
	const pending = pendingQuestions.get(requestId);
	if (pending && (!pending.userId || pending.userId === userId)) {
		void markPendingQuestionRow(requestId, 'answered', result);
		pending.resolve(result);
		return true;
	}
	try {
		const db = getDb();
		const updated = await db
			.update(schema.pendingTurnRequests)
			.set({ status: 'answered', answer: result, updatedAt: new Date() })
			.where(
				and(
					eq(schema.pendingTurnRequests.requestId, requestId),
					eq(schema.pendingTurnRequests.userId, userId),
					eq(schema.pendingTurnRequests.kind, 'question'),
					eq(schema.pendingTurnRequests.status, 'pending')
				)
			)
			.returning({ requestId: schema.pendingTurnRequests.requestId });
		return updated.length > 0;
	} catch {
		return false;
	}
}

export async function cancelQuestionRequests(
	conversationId: string,
	turnToken?: string
): Promise<number> {
	let canceled = 0;
	for (const pending of pendingQuestions.values()) {
		if (
			pending.conversationId === conversationId &&
			(!turnToken || pending.turnToken === turnToken)
		) {
			pending.reject(new Error('QUESTION_REQUEST_CANCELED'));
			canceled++;
		}
	}
	try {
		const db = getDb();
		await db
			.update(schema.pendingTurnRequests)
			.set({ status: 'canceled', updatedAt: new Date() })
			.where(
				and(
					eq(schema.pendingTurnRequests.conversationId, conversationId),
					eq(schema.pendingTurnRequests.kind, 'question'),
					eq(schema.pendingTurnRequests.status, 'pending'),
					turnToken ? eq(schema.pendingTurnRequests.turnToken, turnToken) : undefined
				)
			);
	} catch {
		// Local waiters were rejected above; shared rows expire on their own.
	}
	return canceled;
}

export function clearAllQuestionRequests(): void {
	for (const pending of pendingQuestions.values()) {
		clearTimeout(pending.timer);
		if (pending.poll) clearInterval(pending.poll);
		pending.reject(new Error('QUESTION_REQUEST_CANCELED'));
	}
	pendingQuestions.clear();
}
