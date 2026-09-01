import { json } from '@sveltejs/kit';
import type { RequestHandler } from '@sveltejs/kit';
import { desc } from 'drizzle-orm';
import { getDb, schema } from '$lib/server/db/client';
import { handleApiError } from '$lib/server/api';
import { projectInput } from '$lib/server/validation';

export const GET: RequestHandler = async () => { try { const db = getDb(); return json({ projects: await db.select().from(schema.projects).orderBy(desc(schema.projects.updatedAt)) }); } catch (error) { return handleApiError(error); } }
export const POST: RequestHandler = async ({ request }) => { try { const parsed = projectInput.safeParse(await request.json()); if (!parsed.success) return json({ error: { code: 'INVALID_INPUT', message: 'Invalid project payload.' } }, { status: 400 }); const db = getDb(); const [project] = await db.insert(schema.projects).values(parsed.data).returning(); return json({ project }, { status: 201 }); } catch (error) { return handleApiError(error); } }
