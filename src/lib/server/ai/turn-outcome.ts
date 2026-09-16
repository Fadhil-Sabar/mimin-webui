/**
 * Describe a finished agent turn so the UI can say what happened.
 *
 * pi normalises the provider's `finish_reason` into a stop reason, and a
 * reasoning phase shares the output budget with the answer. Because of that a
 * turn can end cleanly with a thinking block and no answer at all: the provider
 * reports `length` (or a plain `stop` with nothing after the reasoning), the
 * agent loop has nothing left to do, and the transcript used to show a reply
 * that looked like it was still thinking.
 */
export type TurnOutcomeKind = 'truncated' | 'no-answer';

export type TurnOutcome = {
	incomplete: boolean;
	kind: TurnOutcomeKind | null;
	notice: string;
};

export type TurnSignals = {
	stopReason?: string | null;
	rawStopReason?: string | null;
	text?: string | null;
	toolCallCount?: number;
};

export const TRUNCATED_NOTICE =
	'The model ran out of output tokens before writing an answer (reasoning and the answer share the output budget). Send "continue" to keep the turn going, or pick a model with a larger output budget.';

export const TRUNCATED_ANSWER_NOTICE =
	'This reply was cut off: the model reached its output limit mid-answer. Send "continue" to get the rest.';

export const NO_ANSWER_NOTICE =
	'The model finished without writing an answer (it only produced reasoning). Send "continue" to try again.';

const COMPLETE: TurnOutcome = { incomplete: false, kind: null, notice: '' };

export function describeTurnOutcome({
	stopReason,
	rawStopReason,
	text,
	toolCallCount = 0
}: TurnSignals): TurnOutcome {
	// A tool call means the loop still has work to do, so the turn is not over.
	if (toolCallCount > 0) return COMPLETE;
	// Errors surface through the route's error path and the user stop button is
	// an intentional ending; neither should look like a stalled reply.
	if (stopReason === 'error' || stopReason === 'aborted') return COMPLETE;
	if (stopReason === 'length' || rawStopReason === 'length')
		return {
			incomplete: true,
			kind: 'truncated',
			notice: (text ?? '').trim() ? TRUNCATED_ANSWER_NOTICE : TRUNCATED_NOTICE
		};
	if (!(text ?? '').trim())
		return { incomplete: true, kind: 'no-answer', notice: NO_ANSWER_NOTICE };
	return COMPLETE;
}

/**
 * Stop reason persisted with the message. `length` is pi's own value; a turn
 * that stopped with nothing but reasoning is recorded as `no-answer` so the
 * transcript can mark it after a reload.
 */
export function persistedStopReason(outcome: TurnOutcome, stopReason?: string | null) {
	if (outcome.kind === 'no-answer') return 'no-answer';
	return stopReason ?? null;
}
