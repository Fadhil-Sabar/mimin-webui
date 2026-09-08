import { beforeEach, describe, expect, it, vi } from 'vitest';

const state = vi.hoisted(() => ({
	user: { id: 'user-1' } as { id: string } | null,
	owned: true,
	files: [] as Array<Record<string, unknown>>,
	readCount: 0
}));

const schema = vi.hoisted(() => ({ projectFiles: { id: 'file-id', projectId: 'project-id' } }));

vi.mock('$lib/server/api', () => ({
	requireUser: vi.fn(async () => state.user),
	getOwnedProject: vi.fn(async () => (state.owned ? { id: 'project-1' } : undefined)),
	apiError: (code: string, message: string, status = 400) =>
		new Response(JSON.stringify({ error: { code, message } }), {
			status,
			headers: { 'content-type': 'application/json' }
		}),
	handleApiError: (error: unknown) => {
		throw error;
	}
}));

vi.mock('$lib/server/db/client', () => ({
	getDb: () => ({
		select: () => {
			let result: Array<Record<string, unknown>> = [];
			const query = {
				from(table: unknown) {
					result = table === schema.projectFiles ? state.files : [];
					return query;
				},
				where() {
					return query;
				},
				then(
					resolve: (value: Array<Record<string, unknown>>) => unknown,
					reject?: (e: unknown) => unknown
				) {
					return Promise.resolve(result).then(resolve, reject);
				}
			};
			return query;
		}
	}),
	schema
}));

vi.mock('$lib/server/files/storage', () => ({
	cleanupStoredFiles: vi.fn(),
	resolveStoragePath: vi.fn(() => '/tmp/project-file'),
	readStoredFile: vi.fn(async () => {
		state.readCount += 1;
		return new Uint8Array([80, 68, 70]);
	})
}));

const { GET } = await import('../src/routes/api/projects/[id]/files/[fileId]/+server');

function event(user = state.user) {
	return {
		locals: { user },
		params: { id: 'project-1', fileId: 'file-1' },
		request: new Request('http://localhost/api/projects/project-1/files/file-1')
	} as never;
}

beforeEach(() => {
	state.user = { id: 'user-1' };
	state.owned = true;
	state.files = [
		{
			id: 'file-1',
			projectId: 'project-1',
			filename: 'requirements.pdf',
			mimeType: 'application/pdf',
			storageKey: 'project-1/file-1.pdf'
		}
	];
	state.readCount = 0;
});

describe('project citation file route', () => {
	it('rejects unauthenticated requests before reading storage', async () => {
		state.user = null;
		const response = await GET(event(null));

		expect(response.status).toBe(401);
		expect(state.readCount).toBe(0);
	});

	it('hides files belonging to another project owner', async () => {
		state.owned = false;
		const response = await GET(event());

		expect(response.status).toBe(404);
		expect(state.readCount).toBe(0);
	});

	it('returns not found without reading storage for a missing file', async () => {
		state.files = [];
		const response = await GET(event());

		expect(response.status).toBe(404);
		expect(state.readCount).toBe(0);
	});

	it('serves an owned file for clickable citations', async () => {
		const response = await GET(event());

		expect(response.status).toBe(200);
		expect(response.headers.get('content-type')).toBe('application/pdf');
		expect(response.headers.get('content-disposition')).toContain('requirements.pdf');
		expect(new Uint8Array(await response.arrayBuffer())).toEqual(new Uint8Array([80, 68, 70]));
		expect(state.readCount).toBe(1);
	});
});
