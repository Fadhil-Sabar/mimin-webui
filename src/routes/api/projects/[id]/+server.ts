import { json } from '@sveltejs/kit';
import type { RequestHandler } from '@sveltejs/kit';
import { eq, desc } from 'drizzle-orm';
import { getDb, schema } from '$lib/server/db/client';
import { apiError, handleApiError } from '$lib/server/api';
import { projectInput } from '$lib/server/validation';

export const GET: RequestHandler = async ({ params }) => { try { const db = getDb(); const [project] = await db.select().from(schema.projects).where(eq(schema.projects.id, params.id!)); if (!project) return apiError('PROJECT_NOT_FOUND', 'Project not found.', 404); const [files, conversations] = await Promise.all([db.select().from(schema.projectFiles).where(eq(schema.projectFiles.projectId, params.id!)), db.select().from(schema.conversations).where(eq(schema.conversations.projectId, params.id!)).orderBy(desc(schema.conversations.updatedAt))]); return json({ project, files, conversations }); } catch (error) { return handleApiError(error); } }
export const PATCH: RequestHandler = async ({ params, request }) => { try { const parsed = projectInput.partial().safeParse(await request.json()); if (!parsed.success) return apiError('INVALID_INPUT', 'Invalid project payload.'); const db = getDb(); const [project] = await db.update(schema.projects).set({ ...parsed.data, updatedAt: new Date() }).where(eq(schema.projects.id, params.id!)).returning(); if (!project) return apiError('PROJECT_NOT_FOUND', 'Project not found.', 404); return json({ project }); } catch (error) { return handleApiError(error); } }
export const DELETE: RequestHandler = async ({ params }) => { try { const db = getDb(); const deleted = await db.delete(schema.projects).where(eq(schema.projects.id, params.id!)).returning({ id: schema.projects.id }); if (!deleted.length) return apiError('PROJECT_NOT_FOUND', 'Project not found.', 404); return new Response(null, { status: 204 }); } catch (error) { return handleApiError(error); } }
