import { json } from '@sveltejs/kit';
import type { RequestHandler } from '@sveltejs/kit';
import { and, eq } from 'drizzle-orm';
import { getDb, schema } from '$lib/server/db/client';
import { apiError, getOwnedProject, handleApiError, requireUser } from '$lib/server/api';
import { skillPatchInput } from '$lib/server/validation';
import { validateSkillTools } from '$lib/server/skills';
import { z } from 'zod';

function notFound() {
	return apiError('SKILL_NOT_FOUND', 'Skill not found.', 404);
}

function invalidSkill(message = 'Invalid skill payload.') {
	return apiError('INVALID_SKILL', message, 400);
}

function validSkillId(id: string | undefined): id is string {
	return Boolean(id && z.string().uuid().safeParse(id).success);
}

export const GET: RequestHandler = async (event) => {
	try {
		const user = await requireUser(event);
		if (!user) return apiError('UNAUTHORIZED', 'Authentication required.', 401);
		const id = event.params.id;
		if (!validSkillId(id)) return invalidSkill('Invalid skill id.');
		const [skill] = await getDb()
			.select()
			.from(schema.skills)
			.where(and(eq(schema.skills.id, id), eq(schema.skills.userId, user.id)));
		if (!skill) return notFound();
		return json({ skill });
	} catch (error) {
		return handleApiError(error);
	}
};

export const PATCH: RequestHandler = async (event) => {
	try {
		const user = await requireUser(event);
		if (!user) return apiError('UNAUTHORIZED', 'Authentication required.', 401);
		const id = event.params.id;
		if (!validSkillId(id)) return invalidSkill('Invalid skill id.');
		const [existing] = await getDb()
			.select()
			.from(schema.skills)
			.where(and(eq(schema.skills.id, id), eq(schema.skills.userId, user.id)));
		if (!existing) return notFound();
		let body: unknown;
		try {
			body = await event.request.json();
		} catch {
			return invalidSkill();
		}
		const parsed = skillPatchInput.safeParse(body);
		if (!parsed.success || Object.keys(parsed.data).length === 0) return invalidSkill();

		const projectId =
			parsed.data.projectId === undefined ? existing.projectId : parsed.data.projectId;
		if (projectId && !(await getOwnedProject(projectId, user.id)))
			return invalidSkill('Invalid project scope.');
		const enabledTools = validateSkillTools(
			parsed.data.enabledTools ?? (existing.enabledTools as string[]),
			projectId
		);
		if (!enabledTools) return invalidSkill('One or more selected tools are unavailable.');

		const [skill] = await getDb()
			.update(schema.skills)
			.set({
				...parsed.data,
				projectId,
				enabledTools,
				updatedAt: new Date()
			})
			.where(and(eq(schema.skills.id, id), eq(schema.skills.userId, user.id)))
			.returning();
		if (!skill) return notFound();
		return json({ skill });
	} catch (error) {
		return handleApiError(error);
	}
};

export const DELETE: RequestHandler = async (event) => {
	try {
		const user = await requireUser(event);
		if (!user) return apiError('UNAUTHORIZED', 'Authentication required.', 401);
		const id = event.params.id;
		if (!validSkillId(id)) return invalidSkill('Invalid skill id.');
		const [deleted] = await getDb()
			.delete(schema.skills)
			.where(and(eq(schema.skills.id, id), eq(schema.skills.userId, user.id)))
			.returning({ id: schema.skills.id });
		if (!deleted) return notFound();
		return json({ deleted: true, skillId: deleted.id });
	} catch (error) {
		return handleApiError(error);
	}
};
