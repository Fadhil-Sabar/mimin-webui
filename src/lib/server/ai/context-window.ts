export type ContextRow = { id: string; role: string; content: unknown; createdAt: Date };

export const DEFAULT_CONTEXT_WINDOW_MESSAGES = 100;
export const MAX_CONTEXT_WINDOW_MESSAGES = 10_000;

/**
 * Rough characters-per-token ratio. Deliberately a heuristic: a real tokenizer
 * would add a dependency and a per-model vocabulary for a bound that only needs
 * to be conservative.
 */
export const CHARS_PER_TOKEN = 4;

export const DEFAULT_CONTEXT_WINDOW_TOKENS = 128_000;
/** Headroom for the system prompt, tool schemas, project instructions and the answer. */
export const CONTEXT_RESERVE_TOKENS = 4_000;
/** Never hand the model an empty history, even for a tiny configured window. */
export const MIN_CONTEXT_BUDGET_TOKENS = 1_000;
/** Conversation history takes the larger share of what the window leaves free. */
export const HISTORY_BUDGET_SHARE = 0.6;
/** Attached-file text is reference material, so it gets a smaller, separate share. */
export const ATTACHMENT_BUDGET_SHARE = 0.25;

export function contextWindowLimit(value = process.env.MIMIN_CONTEXT_WINDOW_MESSAGES) {
	const parsed = Number(value ?? DEFAULT_CONTEXT_WINDOW_MESSAGES);
	return Number.isSafeInteger(parsed) && parsed > 0
		? Math.min(parsed, MAX_CONTEXT_WINDOW_MESSAGES)
		: DEFAULT_CONTEXT_WINDOW_MESSAGES;
}

export function estimateTokens(content: unknown): number {
	if (content == null) return 0;
	const text = typeof content === 'string' ? content : safeStringify(content);
	return Math.ceil(text.length / CHARS_PER_TOKEN);
}

function safeStringify(value: unknown) {
	try {
		return JSON.stringify(value) ?? '';
	} catch {
		return '';
	}
}

/**
 * What a model's advertised window leaves for context once its own output cap and
 * the fixed reserves are set aside.
 */
export function usableContextTokens(contextWindow?: number, maxOutputTokens?: number) {
	const window =
		typeof contextWindow === 'number' && Number.isFinite(contextWindow) && contextWindow > 0
			? contextWindow
			: DEFAULT_CONTEXT_WINDOW_TOKENS;
	const output =
		typeof maxOutputTokens === 'number' && Number.isFinite(maxOutputTokens) && maxOutputTokens > 0
			? maxOutputTokens
			: 0;
	return Math.max(MIN_CONTEXT_BUDGET_TOKENS, Math.floor(window - output - CONTEXT_RESERVE_TOKENS));
}

export function historyBudgetTokens(contextWindow?: number, maxOutputTokens?: number) {
	return Math.max(
		MIN_CONTEXT_BUDGET_TOKENS,
		Math.floor(usableContextTokens(contextWindow, maxOutputTokens) * HISTORY_BUDGET_SHARE)
	);
}

export function attachmentBudgetChars(contextWindow?: number, maxOutputTokens?: number) {
	return Math.max(
		MIN_CONTEXT_BUDGET_TOKENS,
		Math.floor(
			usableContextTokens(contextWindow, maxOutputTokens) *
				ATTACHMENT_BUDGET_SHARE *
				CHARS_PER_TOKEN
		)
	);
}

export type ContextBudget = {
	/** Tokens the retained history may occupy. */
	budgetTokens: number;
	/** Secondary bound, so a window full of one-word messages cannot grow without limit. */
	maxMessages?: number;
	toolMessageIds?: Set<string>;
	/** Replayed tool results and arguments attached to each assistant message. */
	extraTokensByMessage?: Map<string, number>;
};

/**
 * Select the newest history that fits the budget. Walks backwards from the latest
 * message, always keeping at least one, then pulls the boundary back one row when
 * that would orphan a tool message from the request that caused it.
 */
export function selectContextWithinBudget<T extends ContextRow>(rows: T[], budget: ContextBudget) {
	const maxMessages = Math.min(
		budget.maxMessages && budget.maxMessages > 0 ? budget.maxMessages : MAX_CONTEXT_WINDOW_MESSAGES,
		MAX_CONTEXT_WINDOW_MESSAGES
	);
	let start = rows.length;
	let used = 0;
	while (start > 0) {
		const included = rows.length - start;
		if (included >= maxMessages) break;
		const next =
			used +
			estimateTokens(rows[start - 1].content) +
			(budget.extraTokensByMessage?.get(rows[start - 1].id) ?? 0);
		// The newest message is always kept, even if it alone exceeds the budget.
		if (included > 0 && next > budget.budgetTokens) break;
		used = next;
		start -= 1;
	}
	if (start > 0 && rows[start].role === 'assistant') start--;
	if (start > 0 && budget.toolMessageIds?.has(rows[start].id)) start--;
	return rows.slice(start);
}

/**
 * Select recent history while keeping the turn at the boundary intact. A tool
 * message is retained with its preceding user message so tool-call history is
 * never presented without the request that caused it.
 *
 * Kept as the message-count entry point; `selectContextWithinBudget` is the
 * token-aware one.
 */
export function selectContextWindow<T extends ContextRow>(
	rows: T[],
	limit = contextWindowLimit(),
	toolMessageIds = new Set<string>()
) {
	return selectContextWithinBudget(rows, {
		budgetTokens: Number.POSITIVE_INFINITY,
		maxMessages: limit,
		toolMessageIds
	});
}
