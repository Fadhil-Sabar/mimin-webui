import { beforeEach, describe, expect, it, vi } from 'vitest';

type ProjectRow = {
	id: string;
	userId: string;
	name: string;
	description: string;
	instructions: string | null;
};

const testState = vi.hoisted(() => ({
	user: { id: 'user-1' } as { id: string } | null,
	ownedProject: true,
	selectResults: new Map<unknown, unknown[]>(),
	inserted: [] as Array<{ table: unknown; values: Record<string, unknown> }>,
	updated: [] as Array<{ table: unknown; values: Record<string, unknown> }>,
	deleted: [] as unknown[],
	cleanupKeys: [] as string[],
	savedFile: {
		filename: 'notes.md',
		mimeType: 'text/markdown',
		sizeBytes: 12,
		storageKey: 'project-1/file-1.md'
	},
	extraction: {
		extractedText: 'alpha beta',
		extractionStatus: 'extracted' as const,
		pageCount: null,
		extractionError: null
	},
	fileRecord: {
		id: 'file-1',
		projectId: 'project-1',
		filename: 'notes.md',
		mimeType: 'text/markdown',
		sizeBytes: 12,
		storageKey: 'project-1/file-1.md',
		extractionStatus: 'extracted',
		pageCount: null,
		extractionError: null,
		chunkCount: 1
	}
}));

function queryFor(state: unknown[], selection?: Record<string, unknown>) {
	let result = state;
	let offset = 0;
	let limit: number | undefined;
	const query = {
		from(table: unknown) {
			const rows = testState.selectResults.get(table) ?? [];
			result =
				selection && Object.keys(selection).length === 1 && 'count' in selection
					? [{ count: String(rows.length) }]
					: rows;
			return query;
		},
		innerJoin() {
			return query;
		},
		where() {
			return query;
		},
		orderBy() {
			return query;
		},
		limit(value: number) {
			limit = value;
			return query;
		},
		offset(value: number) {
			offset = value;
			return query;
		},
		groupBy() {
			return query;
		},
		then(resolve: (value: unknown[]) => unknown, reject?: (error: unknown) => unknown) {
			const rows = limit === undefined ? result : result.slice(offset, offset + limit);
			return Promise.resolve(rows).then(resolve, reject);
		}
	};
	return query;
}

const schema = vi.hoisted(() => {
	const column = (name: string) => `${name}_column`;
	return {
		projects: {
			id: column('project_id'),
			userId: column('project_user_id'),
			name: column('project_name')
		},
		projectFiles: {
			id: column('file_id'),
			projectId: column('file_project_id'),
			storageKey: column('file_storage_key'),
			createdAt: column('file_created_at')
		},
		projectFileChunks: { id: column('chunk_id') },
		conversations: {
			id: column('conversation_id'),
			userId: column('conversation_user_id'),
			projectId: column('conversation_project_id'),
			enabledTools: column('conversation_enabled_tools'),
			updatedAt: column('conversation_updated_at')
		}
	};
});

vi.mock('../src/lib/server/db/client', () => {
	const db = {
		select: (selection?: Record<string, unknown>) => queryFor([], selection),
		insert: (table: unknown) => ({
			values: (values: Record<string, unknown>) => {
				testState.inserted.push({ table, values });
				return {
					returning: async () =>
						table === schema.projectFiles
							? [testState.fileRecord]
							: [{ ...values, id: 'conversation-1' }]
				};
			}
		}),
		update: (table: unknown) => ({
			set: (values: Record<string, unknown>) => {
				testState.updated.push({ table, values });
				return { where: async () => undefined };
			}
		}),
		delete: (table: unknown) => ({
			where: () => ({
				returning: async () => {
					testState.deleted.push(table);
					return [{ id: 'project-1' }];
				}
			})
		})
	};
	return { getDb: vi.fn(() => db), schema };
});

vi.mock('../src/lib/server/api', () => ({
	apiError: (code: string, message: string, status = 400) =>
		new Response(JSON.stringify({ error: { code, message } }), {
			status,
			headers: { 'content-type': 'application/json' }
		}),
	requireUser: vi.fn(async () => testState.user),
	getOwnedProject: vi.fn(async () => (testState.ownedProject ? { id: 'project-1' } : undefined)),
	handleApiError: (error: unknown) => {
		throw error;
	}
}));

vi.mock('../src/lib/server/ai/model.service', () => ({
	isModelAvailable: vi.fn(async () => true),
	listAvailableModels: vi.fn(async () => [])
}));

vi.mock('../src/lib/server/files/storage', () => ({
	chunkText: (text: string) => (text.trim() ? [text.trim()] : []),
	cleanupStoredFiles: vi.fn(async (keys: string[]) => {
		testState.cleanupKeys.push(...keys);
	}),
	extractUploadedFile: vi.fn(async () => testState.extraction),
	saveProjectFile: vi.fn(async () => testState.savedFile)
}));

const { POST: createConversation } = await import('../src/routes/api/conversations/+server');
const projectListRoute = await import('../src/routes/api/projects/+server');
const projectRoute = await import('../src/routes/api/projects/[id]/+server');
const projectFilesRoute = await import('../src/routes/api/projects/[id]/files/+server');

function event(request?: Request, params: Record<string, string> = {}) {
	return {
		locals: { user: testState.user },
		params,
		request,
		url: new URL(request?.url ?? 'http://localhost/api/projects')
	} as never;
}

beforeEach(() => {
	testState.user = { id: 'user-1' };
	testState.ownedProject = true;
	testState.selectResults.clear();
	testState.inserted.length = 0;
	testState.updated.length = 0;
	testState.deleted.length = 0;
	testState.cleanupKeys.length = 0;
});

describe('Projects API routes', () => {
	it('automatically persists project knowledge search on a project conversation', async () => {
		const request = new Request('http://localhost/api/conversations', {
			method: 'POST',
			headers: { 'content-type': 'application/json' },
			body: JSON.stringify({
				projectId: '00000000-0000-4000-8000-000000000001',
				enabledTools: ['web_search']
			})
		});
		const response = await createConversation(event(request));
		const body = await response.json();

		expect(response.status).toBe(201);
		expect(body.conversation.enabledTools).toEqual(['web_search', 'project_knowledge_search']);
		expect(testState.inserted[0]?.values).toMatchObject({
			projectId: '00000000-0000-4000-8000-000000000001',
			userId: 'user-1'
		});
	});

	it('returns aggregate file and chat counts in the project list', async () => {
		const projects: ProjectRow[] = [
			{ id: 'project-1', userId: 'user-1', name: 'Owned', description: '', instructions: null },
			{ id: 'project-2', userId: 'user-1', name: 'Empty', description: '', instructions: null }
		];
		testState.selectResults.set(schema.projects, projects);
		testState.selectResults.set(schema.projectFiles, [{ projectId: 'project-1', count: 3 }]);
		testState.selectResults.set(schema.conversations, [{ projectId: 'project-1', count: 2 }]);

		const response = await projectListRoute.GET(event());
		const body = await response.json();

		expect(response.status).toBe(200);
		expect(body.projects).toEqual([
			expect.objectContaining({ id: 'project-1', fileCount: 3, chatCount: 2 }),
			expect.objectContaining({ id: 'project-2', fileCount: 0, chatCount: 0 })
		]);
	});

	it('does not disclose a project to a different user', async () => {
		testState.selectResults.set(schema.projects, [
			{ id: 'project-1', userId: 'user-2', name: 'Private', description: '', instructions: null }
		]);
		const response = await projectRoute.GET(event(undefined, { id: 'project-1' }));
		const body = await response.json();

		expect(response.status).toBe(404);
		expect(body.error.code).toBe('PROJECT_NOT_FOUND');
	});

	it('paginates project files and conversations with totals', async () => {
		testState.selectResults.set(schema.projects, [
			{ id: 'project-1', userId: 'user-1', name: 'Owned', description: '', instructions: null }
		]);
		testState.selectResults.set(schema.projectFiles, [
			{ id: 'file-1', projectId: 'project-1' },
			{ id: 'file-2', projectId: 'project-1' }
		]);
		testState.selectResults.set(schema.conversations, [
			{ id: 'conversation-1', projectId: 'project-1', userId: 'user-1' },
			{ id: 'conversation-2', projectId: 'project-1', userId: 'user-1' }
		]);
		const request = new Request(
			'http://localhost/api/projects/project-1?filesPage=2&filesPageSize=1&conversationsPage=1&conversationsPageSize=1'
		);
		const response = await projectRoute.GET(event(request, { id: 'project-1' }));
		const body = await response.json();

		expect(response.status).toBe(200);
		expect(body.files).toEqual([{ id: 'file-2', projectId: 'project-1' }]);
		expect(body.conversations).toEqual([
			{ id: 'conversation-1', projectId: 'project-1', userId: 'user-1' }
		]);
		expect(body.pagination).toEqual({
			files: { page: 2, pageSize: 1, total: 2, hasMore: false },
			conversations: { page: 1, pageSize: 1, total: 2, hasMore: true }
		});
	});

	it('rejects invalid project collection pagination values', async () => {
		const response = await projectRoute.GET(
			event(new Request('http://localhost/api/projects/project-1?filesPage=0'), { id: 'project-1' })
		);
		const body = await response.json();

		expect(response.status).toBe(400);
		expect(body.error.code).toBe('INVALID_INPUT');
	});

	it('returns persisted extraction metadata and chunk count after upload', async () => {
		const file = new File(['alpha beta'], 'notes.md', { type: 'text/markdown' });
		const request = new Request('http://localhost/api/projects/project-1/files', {
			method: 'POST',
			body: (() => {
				const form = new FormData();
				form.set('file', file);
				return form;
			})()
		});
		const response = await projectFilesRoute.POST(event(request, { id: 'project-1' }));
		const body = await response.json();

		expect(response.status).toBe(201);
		expect(body.file).toMatchObject({ extractionStatus: 'extracted', chunkCount: 1 });
		expect(body.extraction).toEqual({ status: 'extracted', pageCount: null, error: null });
	});

	it('cleans up every project storage key when deleting an owned project', async () => {
		testState.selectResults.set(schema.projectFiles, [
			{ storageKey: 'project-1/one.md' },
			{ storageKey: 'project-1/two.pdf' }
		]);
		testState.selectResults.set(schema.conversations, [
			{
				id: 'conversation-1',
				enabledTools: ['web_search', 'project_knowledge_search']
			}
		]);
		const response = await projectRoute.DELETE(event(undefined, { id: 'project-1' }));

		expect(response.status).toBe(204);
		expect(testState.cleanupKeys).toEqual(['project-1/one.md', 'project-1/two.pdf']);
		expect(testState.deleted).toContain(schema.projects);
		expect(testState.updated).toContainEqual({
			table: schema.conversations,
			values: { enabledTools: ['web_search'] }
		});
	});
});
