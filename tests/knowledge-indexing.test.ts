import { beforeEach, describe, expect, it, vi } from 'vitest';
const state = vi.hoisted(() => ({
	embed: vi.fn(),
	rows: [] as Array<{ id: string; content: string }>,
	writes: [] as unknown[],
	fail: false
}));
vi.mock('../src/lib/server/ai/knowledge-embeddings', () => ({
	embedKnowledge: state.embed,
	EMBEDDING_BATCH_SIZE: 32
}));
vi.mock('../src/lib/server/db/client', async () => ({
	schema: await import('../src/lib/server/db/schema'),
	getDb: () => ({
		select: () => ({ from: () => ({ where: async () => state.rows }) }),
		transaction: async (fn: (tx: unknown) => Promise<unknown>) =>
			fn({
				update: () => ({
					set: (value: unknown) => ({
						where: async () => {
							if (state.fail) throw new Error('write failed');
							state.writes.push(value);
						}
					})
				})
			})
	})
}));
const { indexKnowledgeEmbeddings } = await import('../src/lib/server/ai/knowledge-indexing');
beforeEach(() => {
	state.rows = [{ id: 'chunk', content: 'Text remains searchable' }];
	state.writes = [];
	state.fail = false;
	state.embed.mockReset();
	vi.spyOn(console, 'warn').mockImplementation(() => {});
});
describe('knowledge embedding indexing', () => {
	it('leaves legacy text untouched when disabled', async () => {
		state.embed.mockResolvedValue(null);
		expect(await indexKnowledgeEmbeddings('project', 'file')).toEqual({
			status: 'disabled',
			indexed: 0
		});
		expect(state.writes).toEqual([]);
	});
	it('writes embedding and model identity in bounded batches', async () => {
		state.rows = Array.from({ length: 33 }, (_, i) => ({ id: String(i), content: `passage ${i}` }));
		state.embed.mockImplementation(async (texts: string[]) => ({
			vectors: texts.map(() => [1]),
			identity: 'model'
		}));
		expect(await indexKnowledgeEmbeddings('project', 'file')).toEqual({
			status: 'indexed',
			indexed: 33
		});
		expect(state.embed.mock.calls.map((call) => call[0].length)).toEqual([32, 1]);
		expect(state.writes).toHaveLength(33);
		expect(state.writes[0]).toEqual({ embedding: [1], embeddingModel: 'model' });
	});
	it('retains lexical chunks and reports provider failure', async () => {
		state.embed.mockRejectedValue(new Error('outage'));
		expect(await indexKnowledgeEmbeddings('project', 'file')).toEqual({
			status: 'unavailable',
			indexed: 0
		});
		expect(state.writes).toEqual([]);
		expect(state.rows[0].content).toBe('Text remains searchable');
	});
	it('reports database vector-write failure without deleting lexical chunks', async () => {
		state.fail = true;
		state.embed.mockResolvedValue({ vectors: [[1]], identity: 'model' });
		expect(await indexKnowledgeEmbeddings('project', 'file')).toEqual({
			status: 'unavailable',
			indexed: 0
		});
		expect(state.rows).toHaveLength(1);
	});
});
