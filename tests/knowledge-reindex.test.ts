import { beforeEach, describe, expect, it, vi } from 'vitest';

const state = vi.hoisted(() => ({
	user: { id: 'owner' } as { id: string } | null,
	owned: true,
	file: true,
	extraction: {
		extractedText: 'new text',
		extractionStatus: 'extracted',
		extractionError: null as string | null,
		pageCount: 2
	},
	events: [] as string[],
	read: vi.fn(),
	index: vi.fn()
}));
vi.mock('../src/lib/server/api', () => ({
	requireUser: async () => state.user,
	getOwnedProject: async () => (state.owned ? { id: 'project' } : undefined),
	apiError: (code: string, message: string, status = 400) =>
		Response.json({ error: { code, message } }, { status }),
	handleApiError: () => Response.json({ error: 'internal' }, { status: 500 })
}));
vi.mock('../src/lib/server/files/storage', () => ({
	readStoredFile: state.read,
	extractUploadedFile: async () => state.extraction,
	chunkUploadedExtraction: () => [{ content: 'new text', page: 2 }]
}));
vi.mock('../src/lib/server/ai/knowledge-indexing', () => ({
	indexKnowledgeEmbeddings: state.index
}));
vi.mock('../src/lib/server/db/client', async () => {
	const schema = await import('../src/lib/server/db/schema');
	const tx = {
		execute: async () => {
			state.events.push('lock');
			return [{ id: 'file' }];
		},
		delete: () => ({
			where: async () => {
				state.events.push('delete chunks');
			}
		}),
		insert: () => ({
			values: async (values: unknown) => {
				state.events.push('insert chunks');
				expect(values).toEqual([
					{ projectId: 'project', fileId: 'file', content: 'new text', page: 2 }
				]);
			}
		}),
		update: () => ({
			set: () => ({ where: () => ({ returning: async () => [{ id: 'file', chunkCount: 1 }] }) })
		})
	};
	return {
		schema,
		getDb: () => ({
			select: () => ({
				from: () => ({
					where: async () =>
						state.file
							? [
									{
										id: 'file',
										storageKey: 'safe/file.pdf',
										filename: 'file.pdf',
										mimeType: 'application/pdf'
									}
								]
							: []
				})
			}),
			transaction: async (fn: (value: typeof tx) => Promise<unknown>) => {
				state.events.push('begin');
				const value = await fn(tx);
				state.events.push('commit');
				return value;
			}
		})
	};
});
const { POST } = await import('../src/routes/api/projects/[id]/files/[fileId]/reindex/+server');
const event = () => ({ params: { id: 'project', fileId: 'file' } }) as Parameters<typeof POST>[0];
beforeEach(() => {
	state.user = { id: 'owner' };
	state.owned = true;
	state.file = true;
	state.extraction.extractionError = null;
	state.extraction.extractionStatus = 'extracted';
	state.events = [];
	state.read.mockReset().mockResolvedValue(new TextEncoder().encode('%PDF-'));
	state.index.mockReset().mockImplementation(async () => {
		state.events.push('embed');
		return { status: 'unavailable', indexed: 0 };
	});
});
describe('knowledge reindex route', () => {
	it('requires authentication before reading any stored file', async () => {
		state.user = null;
		expect((await POST(event())).status).toBe(401);
		expect(state.read).not.toHaveBeenCalled();
	});
	it('denies foreign projects and files before extraction or embedding', async () => {
		state.owned = false;
		expect((await POST(event())).status).toBe(404);
		state.owned = true;
		state.file = false;
		expect((await POST(event())).status).toBe(404);
		expect(state.read).not.toHaveBeenCalled();
		expect(state.index).not.toHaveBeenCalled();
	});
	it('retains legacy chunks when extraction fails', async () => {
		state.extraction.extractionError = 'PDF_OCR_UNAVAILABLE';
		expect((await POST(event())).status).toBe(422);
		expect(state.events).toEqual([]);
		expect(state.index).not.toHaveBeenCalled();
	});
	it.each(['partial', 'truncated'])('retains legacy chunks for %s extraction', async (status) => {
		state.extraction.extractionStatus = status;
		expect((await POST(event())).status).toBe(422);
		expect(state.events).toEqual([]);
	});

	it('atomically replaces page-aware text then falls back when embeddings fail', async () => {
		const response = await POST(event());
		expect(response.status).toBe(200);
		expect(await response.json()).toMatchObject({ indexing: { status: 'unavailable' } });
		expect(state.events).toEqual([
			'begin',
			'lock',
			'delete chunks',
			'insert chunks',
			'commit',
			'embed'
		]);
	});
});
