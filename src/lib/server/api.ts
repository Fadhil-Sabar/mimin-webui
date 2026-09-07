import { json } from '@sveltejs/kit';
import type { RequestEvent } from '@sveltejs/kit';
import { and, eq } from 'drizzle-orm';
import { getDb, schema } from '$lib/server/db/client';
import type { AuthUser } from './auth';
import { OutboundUrlError } from './outbound';

export function apiError(code: string, message: string, status = 400) {
	return json({ error: { code, message } }, { status });
}

export function handleApiError(error: unknown) {
	if (error instanceof OutboundUrlError)
		return apiError('OUTBOUND_URL_NOT_ALLOWED', error.message, 400);
	console.error(error);
	return apiError('INTERNAL_ERROR', 'The request could not be completed.', 500);
}

export async function requireUser(event: RequestEvent): Promise<AuthUser | null> {
	return event.locals.user;
}

/** Returns the project row only when it exists and belongs to the user. */
export async function getOwnedProject(projectId: string, userId: string) {
	const [project] = await getDb()
		.select({
			id: schema.projects.id,
			name: schema.projects.name,
			userId: schema.projects.userId
		})
		.from(schema.projects)
		.where(and(eq(schema.projects.id, projectId), eq(schema.projects.userId, userId)));
	return project;
}

/** Returns the conversation row only when it exists and belongs to the user. */
export async function getOwnedConversation(conversationId: string, userId: string) {
	const [conversation] = await getDb()
		.select({
			id: schema.conversations.id,
			userId: schema.conversations.userId,
			projectId: schema.conversations.projectId,
			activeSkillId: schema.conversations.activeSkillId,
			activeSkillSnapshot: schema.conversations.activeSkillSnapshot,
			title: schema.conversations.title,
			model: schema.conversations.model,
			enabledTools: schema.conversations.enabledTools,
			createdAt: schema.conversations.createdAt,
			updatedAt: schema.conversations.updatedAt,
			projectName: schema.projects.name
		})
		.from(schema.conversations)
		.leftJoin(schema.projects, eq(schema.conversations.projectId, schema.projects.id))
		.where(
			and(eq(schema.conversations.id, conversationId), eq(schema.conversations.userId, userId))
		);
	return conversation;
}
