import { json } from '@sveltejs/kit';
import type { RequestHandler } from '@sveltejs/kit';
import { and, desc, eq, ilike, inArray, or, sql } from 'drizzle-orm';
import { getDb, schema } from '$lib/server/db/client';
import { apiError, getOwnedProject, handleApiError, requireUser } from '$lib/server/api';
import { isModelAvailable, listAvailableModels } from '$lib/server/ai/model.service';
import { conversationInput } from '$lib/server/validation';
import { getProjectConversationTools } from '$lib/server/ai/project-context';
import { extractMessageText, extractSnippet } from '$lib/server/conversations';
import {
	getConversationSkillSummary,
	resolveConversationSkill,
	skillActivationFields,
	toPublicConversation
} from '$lib/server/skill-runtime';

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
				activeSkillId: schema.conversations.activeSkillId,
				activeSkillSnapshot: schema.conversations.activeSkillSnapshot,
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
			return json({ conversations: rows.map(withPublicSkill) });
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
			...withPublicSkill(conv),
			snippet: messageSnippets.get(conv.id) ?? null
		}));

		return json({ conversations: conversationsWithSnippets });
	} catch (error) {
		return handleApiError(error);
	}
};

function withPublicSkill<T extends Parameters<typeof getConversationSkillSummary>[0]>(
	conversation: T
) {
	return toPublicConversation(conversation);
}

export const POST: RequestHandler = async (event) => {
	try {
		const user = await requireUser(event);
		if (!user) return apiError('UNAUTHORIZED', 'Authentication required.', 401);
		const body = await event.request.json();
		const parsed = conversationInput.safeParse(body);
		if (!parsed.success) {
			if (
				typeof body === 'object' &&
				body !== null &&
				Object.prototype.hasOwnProperty.call(body, 'skillId')
			)
				return apiError('INVALID_SKILL', 'Invalid skill.');
			return apiError('INVALID_INPUT', 'Invalid conversation payload.');
		}
		const hasExplicitModel =
			typeof body === 'object' &&
			body !== null &&
			Object.prototype.hasOwnProperty.call(body, 'model') &&
			typeof body.model === 'string' &&
			body.model.trim().length > 0;

		const db = getDb();
		let targetModel = parsed.data.model;
		if (hasExplicitModel) {
			if (!(await isModelAvailable(user.id, targetModel)))
				return apiError('MODEL_NOT_AVAILABLE', 'Selected model is not available.');
		} else {
			const available = await listAvailableModels(user.id);
			if (available.length > 0) {
				const [recent] = await db
					.select({ model: schema.conversations.model })
					.from(schema.conversations)
					.where(eq(schema.conversations.userId, user.id))
					.orderBy(desc(schema.conversations.updatedAt))
					.limit(1);
				const lastUsed = recent?.model;
				const matchedLastUsed = lastUsed
					? available.find((m) => `${m.provider}/${m.id}` === lastUsed)
					: null;
				const preferred = available.find((m) => `${m.provider}/${m.id}` === 'openai/gpt-4o-mini');
				const selected = matchedLastUsed ?? preferred ?? available[0];
				targetModel = `${selected.provider}/${selected.id}`;
			}
		}
		let projectName: string | null = null;
		if (parsed.data.projectId) {
			const ownedProject = await getOwnedProject(parsed.data.projectId, user.id);
			if (!ownedProject) return apiError('PROJECT_NOT_FOUND', 'Project not found.', 404);
			projectName = ownedProject.name;
		}
		let skillFields = skillActivationFields(null);
		if (parsed.data.skillId) {
			const resolvedSkill = await resolveConversationSkill(
				parsed.data.skillId,
				user.id,
				parsed.data.projectId ?? null
			);
			if ('error' in resolvedSkill) {
				return apiError(
					resolvedSkill.error,
					resolvedSkill.error === 'SKILL_NOT_FOUND'
						? 'Skill not found.'
						: 'Skill is not valid for this project.',
					resolvedSkill.error === 'SKILL_NOT_FOUND' ? 404 : 400
				);
			}
			skillFields = skillActivationFields(resolvedSkill.skill);
		}
		const { skillId: _skillId, ...conversationData } = parsed.data;
		const [conversation] = await db
			.insert(schema.conversations)
			.values({
				...conversationData,
				enabledTools: getProjectConversationTools(
					parsed.data.projectId,
					_skillId
						? (skillFields.activeSkillSnapshot?.enabledTools ?? parsed.data.enabledTools)
						: parsed.data.enabledTools
				),
				...skillFields,
				model: targetModel,
				userId: user.id
			})
			.returning();
		if (parsed.data.projectId)
			await db
				.update(schema.projects)
				.set({ updatedAt: new Date() })
				.where(eq(schema.projects.id, parsed.data.projectId));
		return json(
			{
				conversation: {
					...toPublicConversation(conversation),
					projectName
				}
			},
			{ status: 201 }
		);
	} catch (error) {
		return handleApiError(error);
	}
};
