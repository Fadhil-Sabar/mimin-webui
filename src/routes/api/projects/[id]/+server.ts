import { json } from '@sveltejs/kit';
import type { RequestHandler } from '@sveltejs/kit';
import { and, count, desc, eq } from 'drizzle-orm';
import { getDb, schema } from '$lib/server/db/client';
import { apiError, getOwnedProject, handleApiError, requireUser } from '$lib/server/api';
import { projectInput } from '$lib/server/validation';
import { cleanupStoredFiles } from '$lib/server/files/storage';
import { getProjectConversationTools } from '$lib/server/ai/project-context';

const DEFAULT_PAGE_SIZE = 25;
const MAX_PAGE_SIZE = 100;
const MAX_PAGE = 100_000;

type Pagination = { page: number; pageSize: number; offset: number };

function parsePagination(
	event: Parameters<RequestHandler>[0],
	resource: string
): Pagination | Response {
	const pageValue = event.url.searchParams.get(`${resource}Page`) ?? '1';
	const pageSizeValue =
		event.url.searchParams.get(`${resource}PageSize`) ?? String(DEFAULT_PAGE_SIZE);
	const page = Number(pageValue);
	const pageSize = Number(pageSizeValue);
	if (
		!Number.isSafeInteger(page) ||
		page < 1 ||
		page > MAX_PAGE ||
		!Number.isSafeInteger(pageSize) ||
		pageSize < 1 ||
		pageSize > MAX_PAGE_SIZE
	) {
		return apiError(
			'INVALID_INPUT',
			`${resource}Page must be 1-${MAX_PAGE} and ${resource}PageSize must be 1-${MAX_PAGE_SIZE}.`
		);
	}
	return { page, pageSize, offset: (page - 1) * pageSize };
}

export const GET: RequestHandler = async (event) => {
	try {
		const user = await requireUser(event);
		if (!user) return apiError('UNAUTHORIZED', 'Authentication required.', 401);
		const id = event.params.id;
		if (!id) return apiError('PROJECT_NOT_FOUND', 'Project not found.', 404);
		const filesPagination = parsePagination(event, 'files');
		if (filesPagination instanceof Response) return filesPagination;
		const conversationsPagination = parsePagination(event, 'conversations');
		if (conversationsPagination instanceof Response) return conversationsPagination;
		const db = getDb();
		const [project] = await db.select().from(schema.projects).where(eq(schema.projects.id, id));
		if (!project || project.userId !== user.id)
			return apiError('PROJECT_NOT_FOUND', 'Project not found.', 404);
		const [files, fileTotals, conversations, conversationTotals] = await Promise.all([
			db
				.select()
				.from(schema.projectFiles)
				.where(eq(schema.projectFiles.projectId, id))
				.orderBy(desc(schema.projectFiles.createdAt), desc(schema.projectFiles.id))
				.limit(filesPagination.pageSize)
				.offset(filesPagination.offset),
			db
				.select({ count: count() })
				.from(schema.projectFiles)
				.where(eq(schema.projectFiles.projectId, id)),
			db
				.select()
				.from(schema.conversations)
				.where(
					and(eq(schema.conversations.projectId, id), eq(schema.conversations.userId, user.id))
				)
				.orderBy(desc(schema.conversations.updatedAt), desc(schema.conversations.id))
				.limit(conversationsPagination.pageSize)
				.offset(conversationsPagination.offset),
			db
				.select({ count: count() })
				.from(schema.conversations)
				.where(
					and(eq(schema.conversations.projectId, id), eq(schema.conversations.userId, user.id))
				)
		]);
		const fileTotal = Number(fileTotals[0]?.count ?? 0);
		const conversationTotal = Number(conversationTotals[0]?.count ?? 0);
		return json({
			project,
			files,
			conversations,
			pagination: {
				files: {
					page: filesPagination.page,
					pageSize: filesPagination.pageSize,
					total: fileTotal,
					hasMore: filesPagination.offset + files.length < fileTotal
				},
				conversations: {
					page: conversationsPagination.page,
					pageSize: conversationsPagination.pageSize,
					total: conversationTotal,
					hasMore: conversationsPagination.offset + conversations.length < conversationTotal
				}
			}
		});
	} catch (error) {
		return handleApiError(error);
	}
};
export const PATCH: RequestHandler = async (event) => {
	try {
		const user = await requireUser(event);
		if (!user) return apiError('UNAUTHORIZED', 'Authentication required.', 401);
		const id = event.params.id;
		if (!id) return apiError('PROJECT_NOT_FOUND', 'Project not found.', 404);
		if (!(await getOwnedProject(id, user.id)))
			return apiError('PROJECT_NOT_FOUND', 'Project not found.', 404);
		const body = await event.request.json();
		const parsed = projectInput.partial().safeParse(body);
		if (!parsed.success) return apiError('INVALID_INPUT', 'Invalid project payload.');
		const [project] = await getDb()
			.update(schema.projects)
			.set({ ...parsed.data, updatedAt: new Date() })
			.where(eq(schema.projects.id, id))
			.returning();
		return json({ project });
	} catch (error) {
		return handleApiError(error);
	}
};
export const DELETE: RequestHandler = async (event) => {
	try {
		const user = await requireUser(event);
		if (!user) return apiError('UNAUTHORIZED', 'Authentication required.', 401);
		const id = event.params.id;
		if (!id) return apiError('PROJECT_NOT_FOUND', 'Project not found.', 404);
		if (!(await getOwnedProject(id, user.id)))
			return apiError('PROJECT_NOT_FOUND', 'Project not found.', 404);
		const db = getDb();
		const [filesForCleanup, projectConversations] = await Promise.all([
			db
				.select({ storageKey: schema.projectFiles.storageKey })
				.from(schema.projectFiles)
				.where(eq(schema.projectFiles.projectId, id)),
			db
				.select({ id: schema.conversations.id, enabledTools: schema.conversations.enabledTools })
				.from(schema.conversations)
				.where(
					and(eq(schema.conversations.projectId, id), eq(schema.conversations.userId, user.id))
				)
		]);
		await Promise.all(
			projectConversations.map((conversation) =>
				db
					.update(schema.conversations)
					.set({ enabledTools: getProjectConversationTools(null, conversation.enabledTools) })
					.where(eq(schema.conversations.id, conversation.id))
			)
		);
		const deleted = await db
			.delete(schema.projects)
			.where(eq(schema.projects.id, id))
			.returning({ id: schema.projects.id });
		if (!deleted.length) return apiError('PROJECT_NOT_FOUND', 'Project not found.', 404);
		await cleanupStoredFiles(filesForCleanup.map((file) => file.storageKey));
		return new Response(null, { status: 204 });
	} catch (error) {
		return handleApiError(error);
	}
};
