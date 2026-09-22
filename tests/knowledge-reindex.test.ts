import { beforeEach, describe, expect, it, vi } from 'vitest';

const state = vi.hoisted(() => ({
	user: { id: 'owner' } as { id: string } | null,
	owned: true,
	file: true,
	jobs: [] as Array<{ id: string }>,
	enqueued: [] as Array<{ projectId: string; fileId: string; mode: string }>,
	updated: [] as Array<Record<string, unknown>>
}));
vi.mock('../src/lib/server/api', () => ({
	requireUser: async () => state.user,
	getOwnedProject: async () => (state.owned ? { id: 'project' } : undefined),
	apiError: (code: string, message: string, status = 400) =>
		Response.json({ error: { code, message } }, { status }),
	handleApiError: () => Response.json({ error: 'internal' }, { status: 500 })
}));
vi.mock('../src/lib/server/files/document-processing', () => ({
	enqueueDocumentProcessing: async (
		projectId: string,
		fileId: string,
		_database: unknown,
		mode: string
	) => {
		state.enqueued.push({ projectId, fileId, mode });
		return { id: 'job' };
	}
}));
vi.mock('../src/lib/server/db/client', async () => {
	const schema = await import('../src/lib/server/db/schema');
	return {
		schema,
		getDb: () => {
			// First select reads the file row; the second probes for an in-flight job.
			let selects = 0;
			return {
				select: () => ({
					from: () => ({
						where: () => {
							selects += 1;
							const values =
								selects === 1
									? state.file
										? [
												{
													id: 'file',
													projectId: 'project',
													processingStatus: 'succeeded'
												}
											]
										: []
									: state.jobs;
							return Object.assign(Promise.resolve(values), {
								limit: async () => values
							});
						}
					})
				}),
				transaction: async (fn: (tx: unknown) => Promise<unknown>) =>
					fn({
						update: () => ({
							set: (values: Record<string, unknown>) => ({
								where: () => ({
									returning: async () => {
										state.updated.push(values);
										return [{ id: 'file', ...values }];
									}
								})
							})
						})
					})
			};
		}
	};
});
const { POST } = await import('../src/routes/api/projects/[id]/files/[fileId]/reindex/+server');
const event = () => ({ params: { id: 'project', fileId: 'file' } }) as Parameters<typeof POST>[0];
beforeEach(() => {
	state.user = { id: 'owner' };
	state.owned = true;
	state.file = true;
	state.jobs = [];
	state.enqueued = [];
	state.updated = [];
});
describe('knowledge reindex route', () => {
	it('requires authentication before queueing any work', async () => {
		state.user = null;
		expect((await POST(event())).status).toBe(401);
		expect(state.enqueued).toEqual([]);
	});
	it('denies foreign projects and missing files before queueing', async () => {
		state.owned = false;
		expect((await POST(event())).status).toBe(404);
		state.owned = true;
		state.file = false;
		expect((await POST(event())).status).toBe(404);
		expect(state.enqueued).toEqual([]);
	});
	it('queues a reindex job and marks the file queued instead of extracting inline', async () => {
		const response = await POST(event());
		expect(response.status).toBe(202);
		expect(await response.json()).toMatchObject({ processing: { status: 'queued' } });
		expect(state.enqueued).toEqual([{ projectId: 'project', fileId: 'file', mode: 'reindex' }]);
		expect(state.updated).toEqual([{ processingStatus: 'queued' }]);
	});
	it('reuses an in-flight job instead of queueing duplicates', async () => {
		state.jobs = [{ id: 'existing' }];
		const response = await POST(event());
		expect(response.status).toBe(202);
		expect(state.enqueued).toEqual([]);
		expect(state.updated).toEqual([{ processingStatus: 'queued' }]);
	});
});
