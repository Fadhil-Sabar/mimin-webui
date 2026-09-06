import { json } from '@sveltejs/kit';
import type { RequestHandler } from '@sveltejs/kit';
import { and, desc, eq, ilike, inArray, or, sql } from 'drizzle-orm';
import { getDb, schema } from '$lib/server/db/client';
import { apiError, getOwnedProject, handleApiError, requireUser } from '$lib/server/api';
import { isModelAvailable, listAvailableModels } from '$lib/server/ai/model.service';
import { conversationInput } from '$lib/server/validation';
import { getProjectConversationTools } from '$lib/server/ai/project-context';
import { extractMessageText, extractSnippet } from '$lib/server/conversations';

export const GET: RequestHandler = async (event) => {
	try {
		const user = await requireUser(event);
		if (!user) return apiError('UNAUTHORIZED', 'Authentication required.', 401);
		const db = getDb();
		const projectId = event.url.searchParams.get('projectId');
		const q = event.url.searchParams.get('q')?.trim();
		const baseQuery = db
			.select({
				id: schema.conversations.id,
				userId: schema.conversations.userId,
				projectId: schema.conversations.projectId,
				title: schema.conversations.title,
				model: schema.conversations.model,
				enabledTools: schema.conversations.enabledTools,
				createdAt: schema.conversations.createdAt,
				updatedAt: schema.conversations.updatedAt,
				projectName: schema.projects.name
			})
			.from(schema.conversations)
			.leftJoin(schema.projects, eq(schema.conversations.projectId, schema.projects.id));

		if (!q) {
			const rows = projectId
				? await baseQuery
						.where(
							and(
								eq(schema.conversations.userId, user.id),
								eq(schema.conversations.projectId, projectId)
							)
						)
						.orderBy(desc(schema.conversations.updatedAt))
				: await baseQuery
						.where(eq(schema.conversations.userId, user.id))
						.orderBy(desc(schema.conversations.updatedAt));
			return json({ conversations: rows });
		}

		const escapedQ = q.replace(/[%_\\]/g, '\\$&');
		const matchingMessages = await db
			.select({
				conversationId: schema.messages.conversationId,
				content: schema.messages.content,
				createdAt: schema.messages.createdAt
			})
			.from(schema.messages)
			.innerJoin(schema.conversations, eq(schema.messages.conversationId, schema.conversations.id))
			.where(
				and(
					eq(schema.conversations.userId, user.id),
					projectId ? eq(schema.conversations.projectId, projectId) : undefined,
					sql`${schema.messages.content}::text ILIKE ${`%${escapedQ}%`}`
				)
			)
			.orderBy(desc(schema.messages.createdAt))
			.limit(100);

		const messageSnippets = new Map<string, string>();
		const messageConversationIds: string[] = [];
		for (const msg of matchingMessages) {
			if (!messageSnippets.has(msg.conversationId)) {
				const plainText = extractMessageText(msg.content);
				const snippet = extractSnippet(plainText, q);
				messageSnippets.set(msg.conversationId, snippet);
				messageConversationIds.push(msg.conversationId);
			}
		}

		const titleFilter = ilike(schema.conversations.title, `%${escapedQ}%`);
		const projectFilter = ilike(schema.projects.name, `%${escapedQ}%`);
		const matchFilter =
			messageConversationIds.length > 0
				? or(titleFilter, projectFilter, inArray(schema.conversations.id, messageConversationIds))
				: or(titleFilter, projectFilter);

		const rows = await baseQuery
			.where(
				and(
					eq(schema.conversations.userId, user.id),
					projectId ? eq(schema.conversations.projectId, projectId) : undefined,
					matchFilter
				)
			)
			.orderBy(desc(schema.conversations.updatedAt));

		const conversationsWithSnippets = rows.map((conv) => ({
			...conv,
			snippet: messageSnippets.get(conv.id) ?? null
		}));

		return json({ conversations: conversationsWithSnippets });
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

		let targetModel = parsed.data.model;
		if (hasExplicitModel) {
			if (!(await isModelAvailable(user.id, targetModel)))
				return apiError('MODEL_NOT_AVAILABLE', 'Selected model is not available.');
		} else {
			const available = await listAvailableModels(user.id);
			if (available.length > 0) {
				const preferred = available.find((m) => `${m.provider}/${m.id}` === 'openai/gpt-4o-mini');
				const selected = preferred ?? available[0];
				targetModel = `${selected.provider}/${selected.id}`;
			}
		}

		const db = getDb();
		let projectName: string | null = null;
		if (parsed.data.projectId) {
			const ownedProject = await getOwnedProject(parsed.data.projectId, user.id);
			if (!ownedProject) return apiError('PROJECT_NOT_FOUND', 'Project not found.', 404);
			projectName = ownedProject.name;
		}
		const [conversation] = await db
			.insert(schema.conversations)
			.values({
				...parsed.data,
				enabledTools: getProjectConversationTools(parsed.data.projectId, parsed.data.enabledTools),
				model: targetModel,
				userId: user.id
			})
			.returning();
		if (parsed.data.projectId)
			await db
				.update(schema.projects)
				.set({ updatedAt: new Date() })
				.where(eq(schema.projects.id, parsed.data.projectId));
		return json({ conversation: { ...conversation, projectName } }, { status: 201 });
	} catch (error) {
		return handleApiError(error);
	}
};
