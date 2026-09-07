import { json } from '@sveltejs/kit';
import type { RequestHandler } from '@sveltejs/kit';
import { and, desc, eq, isNull, or } from 'drizzle-orm';
import { getDb, schema } from '$lib/server/db/client';
import { apiError, getOwnedProject, handleApiError, requireUser } from '$lib/server/api';
import { skillInput } from '$lib/server/validation';
import { validateSkillTools } from '$lib/server/skills';
import { z } from 'zod';

function invalidSkill(message = 'Invalid skill payload.') {
	return apiError('INVALID_SKILL', message, 400);
}

export const GET: RequestHandler = async (event) => {
	try {
		const user = await requireUser(event);
		if (!user) return apiError('UNAUTHORIZED', 'Authentication required.', 401);
		const projectId = event.url.searchParams.get('projectId');
		const db = getDb();

		if (projectId !== null) {
			if (!z.string().uuid().safeParse(projectId).success)
				return invalidSkill('Invalid project scope.');
			if (!(await getOwnedProject(projectId, user.id)))
				return invalidSkill('Invalid project scope.');
		}

		const skills = await db
			.select()
			.from(schema.skills)
			.where(
				and(
					eq(schema.skills.userId, user.id),
					projectId !== null
						? or(isNull(schema.skills.projectId), eq(schema.skills.projectId, projectId))
						: undefined
				)
			)
			.orderBy(desc(schema.skills.updatedAt), desc(schema.skills.id));
		return json({ skills });
	} catch (error) {
		return handleApiError(error);
	}
};

export const POST: RequestHandler = async (event) => {
	try {
		const user = await requireUser(event);
		if (!user) return apiError('UNAUTHORIZED', 'Authentication required.', 401);
		let body: unknown;
		try {
			body = await event.request.json();
		} catch {
			return invalidSkill();
		}
		const parsed = skillInput.safeParse(body);
		if (!parsed.success) return invalidSkill();
		const { projectId } = parsed.data;
		if (projectId && !(await getOwnedProject(projectId, user.id)))
			return invalidSkill('Invalid project scope.');
		const enabledTools = validateSkillTools(parsed.data.enabledTools, projectId);
		if (!enabledTools) return invalidSkill('One or more selected tools are unavailable.');

		const [skill] = await getDb()
			.insert(schema.skills)
			.values({ ...parsed.data, enabledTools, userId: user.id })
			.returning();
		return json({ skill }, { status: 201 });
	} catch (error) {
		return handleApiError(error);
	}
};
