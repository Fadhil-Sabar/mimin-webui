import { json } from '@sveltejs/kit';
import type { RequestHandler } from '@sveltejs/kit';
import { and, desc, eq } from 'drizzle-orm';
import { getDb, schema } from '$lib/server/db/client';
import { apiError, handleApiError } from '$lib/server/api';
import { conversationInput } from '$lib/server/validation';

export const GET: RequestHandler = async ({ url }) => { try { const db = getDb(); const projectId = url.searchParams.get('projectId'); const rows = projectId ? await db.select().from(schema.conversations).where(eq(schema.conversations.projectId, projectId)).orderBy(desc(schema.conversations.updatedAt)) : await db.select().from(schema.conversations).orderBy(desc(schema.conversations.updatedAt)); return json({ conversations: rows }); } catch (error) { return handleApiError(error); } }
export const POST: RequestHandler = async ({ request }) => { try { const parsed = conversationInput.safeParse(await request.json()); if (!parsed.success) return apiError('INVALID_INPUT', 'Invalid conversation payload.'); const db = getDb(); if (parsed.data.projectId) { const [project] = await db.select({ id: schema.projects.id }).from(schema.projects).where(eq(schema.projects.id, parsed.data.projectId)); if (!project) return apiError('PROJECT_NOT_FOUND', 'Project not found.', 404); } const [conversation] = await db.insert(schema.conversations).values(parsed.data).returning(); return json({ conversation }, { status: 201 }); } catch (error) { return handleApiError(error); } }
