/**
 * Per-turn timing.
 *
 * A turn spends its time in four places: assembling context (conversation reads,
 * attachment text, tool schemas), waiting on the model, executing tools, and
 * persisting the reply. Which one dominates is not guessable from a reply that
 * merely felt slow, so every turn records the split, logs one grep-able line
 * (`[turn-timing]`) and stores the snapshot on its final assistant message
 * (`messages.timing`).
 *
 * `promptMs` covers the whole agent loop, so `toolMs` is a subset of it and
 * `providerMs` (the time actually spent waiting on the model) is derived as
 * `promptMs - toolMs`.
 */
export type TurnTimingSnapshot = {
	/** Start of the turn to the moment the snapshot was taken. */
	totalMs: number;
	/** Reading conversation state, attachments and building the prompt. */
	contextMs: number;
	/** Whole agent loop: every model round trip plus the tool calls they asked for. */
	promptMs: number;
	/** Subset of `promptMs` spent inside tool executions. */
	toolMs: number;
	/** `promptMs - toolMs`: time waiting on the provider. */
	providerMs: number;
	/** Turn start to the first streamed delta, or null when nothing streamed. */
	firstTokenMs: number | null;
	/** Persisting the reply and its citations after the loop. */
	persistMs: number;
	toolCalls: number;
	/** Automatic "continue" retries after a truncated reply. */
	autoContinues: number;
	promptChars: number;
	historyMessages: number;
	attachmentChars: number;
};

export type TurnTimingClock = () => number;

const defaultClock: TurnTimingClock = () =>
	typeof performance !== 'undefined' ? performance.now() : Date.now();

const round = (value: number) => Math.round(value);

export function createTurnTiming(clock: TurnTimingClock = defaultClock) {
	const startedAt = clock();
	const state = {
		contextMs: 0,
		promptMs: 0,
		toolMs: 0,
		firstTokenMs: null as number | null,
		persistMs: 0,
		toolCalls: 0,
		autoContinues: 0,
		promptChars: 0,
		historyMessages: 0,
		attachmentChars: 0
	};
	let promptStartedAt: number | null = null;
	let toolStartedAt: number | null = null;
	let persistStartedAt: number | null = null;

	return {
		/** Called once the prompt, tool set and system prompt are ready to send. */
		markContextAssembled(input: {
			promptChars: number;
			historyMessages: number;
			attachmentChars?: number;
		}) {
			state.contextMs = clock() - startedAt;
			state.promptChars = input.promptChars;
			state.historyMessages = input.historyMessages;
			state.attachmentChars = input.attachmentChars ?? 0;
		},
		beginPrompt() {
			promptStartedAt ??= clock();
		},
		endPrompt() {
			if (promptStartedAt === null) return;
			state.promptMs += clock() - promptStartedAt;
			promptStartedAt = null;
		},
		beginTool() {
			toolStartedAt ??= clock();
		},
		endTool() {
			if (toolStartedAt === null) return;
			state.toolMs += clock() - toolStartedAt;
			toolStartedAt = null;
			state.toolCalls += 1;
		},
		/** First streamed delta of the turn; later deltas do not move it. */
		markFirstToken() {
			state.firstTokenMs ??= clock() - startedAt;
		},
		beginPersist() {
			persistStartedAt ??= clock();
		},
		endPersist() {
			if (persistStartedAt === null) return;
			state.persistMs += clock() - persistStartedAt;
			persistStartedAt = null;
		},
		markAutoContinue() {
			state.autoContinues += 1;
		},
		snapshot(): TurnTimingSnapshot {
			return {
				totalMs: round(clock() - startedAt),
				contextMs: round(state.contextMs),
				promptMs: round(state.promptMs),
				toolMs: round(state.toolMs),
				providerMs: round(state.promptMs - state.toolMs),
				firstTokenMs: state.firstTokenMs === null ? null : round(state.firstTokenMs),
				persistMs: round(state.persistMs),
				toolCalls: state.toolCalls,
				autoContinues: state.autoContinues,
				promptChars: state.promptChars,
				historyMessages: state.historyMessages,
				attachmentChars: state.attachmentChars
			};
		}
	};
}

/** One line per turn so `docker logs` can be grepped and aggregated. */
export function formatTurnTiming(snapshot: TurnTimingSnapshot): string {
	const first = snapshot.firstTokenMs === null ? 'none' : `${snapshot.firstTokenMs}ms`;
	return (
		`[turn-timing] total=${snapshot.totalMs}ms context=${snapshot.contextMs}ms ` +
		`provider=${snapshot.providerMs}ms tools=${snapshot.toolMs}ms/${snapshot.toolCalls} ` +
		`firstToken=${first} persist=${snapshot.persistMs}ms promptChars=${snapshot.promptChars} ` +
		`history=${snapshot.historyMessages} attachments=${snapshot.attachmentChars} ` +
		`continues=${snapshot.autoContinues}`
	);
}

export function logTurnTiming(
	snapshot: TurnTimingSnapshot,
	write: (line: string) => void = (line) => console.log(line)
) {
	write(formatTurnTiming(snapshot));
}
