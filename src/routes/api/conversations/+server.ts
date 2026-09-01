import { json } from '@sveltejs/kit';
import type { RequestHandler } from '@sveltejs/kit';
import { and, desc, eq } from 'drizzle-orm';
import { getDb, schema } from '$lib/server/db/client';
import { apiError, getOwnedProject, handleApiError, requireUser } from '$lib/server/api';
import { isModelAvailable } from '$lib/server/ai/model.service';
import { conversationInput } from '$lib/server/validation';

export const GET: RequestHandler = async (event) => {
	try {
		const user = await requireUser(event);
		if (!user) return apiError('UNAUTHORIZED', 'Authentication required.', 401);
		const db = getDb();
		const projectId = event.url.searchParams.get('projectId');
		const rows = projectId
			? await db
					.select()
					.from(schema.conversations)
					.where(
						and(
							eq(schema.conversations.userId, user.id),
							eq(schema.conversations.projectId, projectId)
						)
					)
					.orderBy(desc(schema.conversations.updatedAt))
			: await db
					.select()
					.from(schema.conversations)
					.where(eq(schema.conversations.userId, user.id))
					.orderBy(desc(schema.conversations.updatedAt));
		return json({ conversations: rows });
	} catch (error) {
		return handleApiError(error);
	}
};
export const POST: RequestHandler = async (event) => {
	try {
		const user = await requireUser(event);
		if (!user) return apiError('UNAUTHORIZED', 'Authentication required.', 401);
		const body = await event.request.json();
		const parsed = conversationInput.safeParse(body);
		if (!parsed.success) return apiError('INVALID_INPUT', 'Invalid conversation payload.');
		const hasExplicitModel =
			typeof body === 'object' &&
			body !== null &&
			Object.prototype.hasOwnProperty.call(body, 'model');
		if (hasExplicitModel && !(await isModelAvailable(user.id, parsed.data.model)))
			return apiError('MODEL_NOT_AVAILABLE', 'Selected model is not available.');
		const db = getDb();
		if (parsed.data.projectId && !(await getOwnedProject(parsed.data.projectId, user.id)))
			return apiError('PROJECT_NOT_FOUND', 'Project not found.', 404);
		const [conversation] = await db
			.insert(schema.conversations)
			.values({ ...parsed.data, userId: user.id })
			.returning();
		return json({ conversation }, { status: 201 });
	} catch (error) {
		return handleApiError(error);
	}
};
