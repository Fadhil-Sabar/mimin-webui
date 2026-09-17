import { describe, expect, it } from 'vitest';
import {
	attachmentBudgetChars,
	CHARS_PER_TOKEN,
	estimateTokens,
	historyBudgetTokens,
	MIN_CONTEXT_BUDGET_TOKENS,
	selectContextWithinBudget,
	usableContextTokens
} from '../src/lib/server/ai/context-window';

/** One row worth exactly `tokens * CHARS_PER_TOKEN` characters. */
function row(id: string, role: string, tokens: number, createdAt = 0) {
	return {
		id,
		role,
		content: 'x'.repeat(tokens * CHARS_PER_TOKEN),
		createdAt: new Date(createdAt)
	};
}

describe('token estimation', () => {
	it('approximates tokens from character length', () => {
		expect(estimateTokens('')).toBe(0);
		expect(estimateTokens(null)).toBe(0);
		expect(estimateTokens('abc')).toBe(1);
		expect(estimateTokens('x'.repeat(4_000))).toBe(1_000);
	});

	it('counts structured content rather than ignoring it', () => {
		expect(estimateTokens([{ type: 'text', text: 'x'.repeat(400) }])).toBeGreaterThan(0);
	});
});

describe('budgeted context selection', () => {
	it('always keeps the newest message even when it exceeds the budget alone', () => {
		const rows = [row('newest', 'user', 5_000)];

		expect(selectContextWithinBudget(rows, { budgetTokens: 10 }).map((item) => item.id)).toEqual([
			'newest'
		]);
	});

	it('drops the oldest messages once the budget is spent', () => {
		const rows = [row('r1', 'user', 1_000), row('r2', 'user', 1_000), row('r3', 'user', 1_000)];

		// Two messages fit (2 000 of 2 500); the third would push it past the budget.
		expect(selectContextWithinBudget(rows, { budgetTokens: 2_500 }).map((item) => item.id)).toEqual(
			['r2', 'r3']
		);
	});

	it('keeps the request that caused a tool message even when the budget is spent', () => {
		const rows = [
			row('u1', 'user', 1_000),
			row('u2', 'user', 1_000),
			row('toolA', 'assistant', 1_000)
		];

		// Only the tool message fits, so its request is pulled back in with it.
		expect(
			selectContextWithinBudget(rows, {
				budgetTokens: 1_000,
				toolMessageIds: new Set(['toolA'])
			}).map((item) => item.id)
		).toEqual(['u2', 'toolA']);
	});

	it('still honours the message-count ceiling', () => {
		const rows = Array.from({ length: 5 }, (_, index) =>
			row(String(index), index % 2 ? 'assistant' : 'user', 1, index)
		);

		expect(
			selectContextWithinBudget(rows, {
				budgetTokens: Number.POSITIVE_INFINITY,
				maxMessages: 2
			}).map((item) => item.id)
		).toEqual(['2', '3', '4']);
	});
});

describe('context budgets', () => {
	it('reserves the output cap and headroom from the model window', () => {
		const usable = usableContextTokens(128_000, 8_192);

		expect(usable).toBe(128_000 - 8_192 - 4_000);
		expect(historyBudgetTokens(128_000, 8_192)).toBeLessThan(usable);
		expect(historyBudgetTokens(128_000, 8_192)).toBeGreaterThan(0);
	});

	it('never falls below a usable floor for a tiny or missing window', () => {
		expect(usableContextTokens(1_000, 500)).toBe(MIN_CONTEXT_BUDGET_TOKENS);
		expect(usableContextTokens(undefined, undefined)).toBeGreaterThan(0);
	});

	it('gives attachments a smaller share than history', () => {
		const attachmentTokens = attachmentBudgetChars(128_000, 8_192) / CHARS_PER_TOKEN;

		expect(attachmentTokens).toBeLessThan(historyBudgetTokens(128_000, 8_192));
		expect(attachmentTokens).toBeGreaterThan(0);
	});
});
