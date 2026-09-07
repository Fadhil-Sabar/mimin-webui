import { eq } from 'drizzle-orm';
import { getDb, schema } from '$lib/server/db/client';

export async function getUserInstructions(userId: string): Promise<string | null> {
	const [row] = await getDb()
		.select({ instructions: schema.userInstructions.instructions })
		.from(schema.userInstructions)
		.where(eq(schema.userInstructions.userId, userId));
	return row?.instructions ?? null;
}

export async function saveUserInstructions(
	userId: string,
	instructions: string
): Promise<string | null> {
	const value = instructions.trim();
	if (!value) {
		await deleteUserInstructions(userId);
		return null;
	}

	const [row] = await getDb()
		.insert(schema.userInstructions)
		.values({ userId, instructions: value, updatedAt: new Date() })
		.onConflictDoUpdate({
			target: schema.userInstructions.userId,
			set: { instructions: value, updatedAt: new Date() }
		})
		.returning({ instructions: schema.userInstructions.instructions });
	return row?.instructions ?? value;
}

export async function deleteUserInstructions(userId: string): Promise<void> {
	await getDb().delete(schema.userInstructions).where(eq(schema.userInstructions.userId, userId));
}

export function buildUserSystemPrompt(basePrompt: string, instructions?: string | null): string {
	const value = instructions?.trim();
	if (!value) return basePrompt;
	return `${basePrompt}\n\nUser preferences (follow these user-authored instructions when they do not conflict with higher-priority instructions):\n<user-instructions>\n${value}\n</user-instructions>`;
}
