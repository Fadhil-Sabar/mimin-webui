import { json } from '@sveltejs/kit';
import type { RequestEvent } from '@sveltejs/kit';
import { and, eq } from 'drizzle-orm';
import { getDb, schema } from '$lib/server/db/client';
import type { AuthUser } from './auth';
import { getSessionUser } from './auth';

export function apiError(code: string, message: string, status = 400) {
	return json({ error: { code, message } }, { status });
}

export function handleApiError(error: unknown) {
	console.error(error);
	return apiError('INTERNAL_ERROR', 'The request could not be completed.', 500);
}

export const SESSION_COOKIE = 'mimin_session';

export function getSessionToken(event: { cookies: RequestEvent['cookies'] }): string | undefined {
	return event.cookies.get(SESSION_COOKIE);
}

export async function requireUser(event: RequestEvent): Promise<AuthUser | null> {
	const token = getSessionToken(event);
	if (!token) return null;
	return getSessionUser(token);
}

/** Returns the project row only when it exists and belongs to the user. */
export async function getOwnedProject(projectId: string, userId: string) {
	const [project] = await getDb()
		.select({ id: schema.projects.id, userId: schema.projects.userId })
		.from(schema.projects)
		.where(and(eq(schema.projects.id, projectId), eq(schema.projects.userId, userId)));
	return project;
}

/** Returns the conversation row only when it exists and belongs to the user. */
export async function getOwnedConversation(conversationId: string, userId: string) {
	const [conversation] = await getDb()
		.select()
		.from(schema.conversations)
		.where(
			and(eq(schema.conversations.id, conversationId), eq(schema.conversations.userId, userId))
		);
	return conversation;
}
