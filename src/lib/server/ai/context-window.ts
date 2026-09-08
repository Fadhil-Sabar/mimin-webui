export type ContextRow = { id: string; role: string; content: unknown; createdAt: Date };

export const DEFAULT_CONTEXT_WINDOW_MESSAGES = 100;
export const MAX_CONTEXT_WINDOW_MESSAGES = 10_000;

export function contextWindowLimit(value = process.env.MIMIN_CONTEXT_WINDOW_MESSAGES) {
	const parsed = Number(value ?? DEFAULT_CONTEXT_WINDOW_MESSAGES);
	return Number.isSafeInteger(parsed) && parsed > 0
		? Math.min(parsed, MAX_CONTEXT_WINDOW_MESSAGES)
		: DEFAULT_CONTEXT_WINDOW_MESSAGES;
}

/**
 * Select recent history while keeping the turn at the boundary intact. A tool
 * message is retained with its preceding user message so tool-call history is
 * never presented without the request that caused it.
 */
export function selectContextWindow<T extends ContextRow>(
	rows: T[],
	limit = contextWindowLimit(),
	toolMessageIds = new Set<string>()
) {
	if (rows.length <= limit) return rows;
	let start = Math.max(0, rows.length - limit);
	if (start > 0 && rows[start].role === 'assistant') start--;
	if (start > 0 && toolMessageIds.has(rows[start].id)) start--;
	return rows.slice(start);
}
