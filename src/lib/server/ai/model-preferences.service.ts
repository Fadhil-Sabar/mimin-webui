import { and, eq } from 'drizzle-orm';
import { getDb, schema } from '$lib/server/db/client';

export const THINKING_LEVELS = ['off', 'minimal', 'low', 'medium', 'high', 'xhigh', 'max'] as const;
export type ThinkingLevel = (typeof THINKING_LEVELS)[number];

export async function listModelThinkingPreferences(userId: string) {
	const rows = await getDb()
		.select({
			model: schema.modelPreferences.model,
			thinkingLevel: schema.modelPreferences.thinkingLevel
		})
		.from(schema.modelPreferences)
		.where(eq(schema.modelPreferences.userId, userId));
	return Object.fromEntries(rows.map((row) => [row.model, row.thinkingLevel]));
}

export async function getModelThinkingPreference(
	userId: string,
	model: string
): Promise<ThinkingLevel> {
	const [row] = await getDb()
		.select({ thinkingLevel: schema.modelPreferences.thinkingLevel })
		.from(schema.modelPreferences)
		.where(
			and(eq(schema.modelPreferences.userId, userId), eq(schema.modelPreferences.model, model))
		);
	return isThinkingLevel(row?.thinkingLevel) ? row.thinkingLevel : 'off';
}

export async function saveModelThinkingPreference(
	userId: string,
	model: string,
	thinkingLevel: ThinkingLevel
) {
	const [row] = await getDb()
		.insert(schema.modelPreferences)
		.values({ userId, model, thinkingLevel, updatedAt: new Date() })
		.onConflictDoUpdate({
			target: [schema.modelPreferences.userId, schema.modelPreferences.model],
			set: { thinkingLevel, updatedAt: new Date() }
		})
		.returning({
			model: schema.modelPreferences.model,
			thinkingLevel: schema.modelPreferences.thinkingLevel
		});
	return row;
}

export function isThinkingLevel(value: unknown): value is ThinkingLevel {
	return typeof value === 'string' && (THINKING_LEVELS as readonly string[]).includes(value);
}
