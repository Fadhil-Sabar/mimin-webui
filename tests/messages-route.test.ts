import { beforeEach, describe, expect, it, vi } from 'vitest';

const state = vi.hoisted(() => ({
	available: [{ provider: 'openai', id: 'fallback' }],
	modelAvailable: true,
	insertCount: 0,
	updateCount: 0,
	failInsert: false,
	turn: null as null | { resolve: () => void },
	runModels: [] as string[]
}));

vi.mock('$lib/server/api', () => ({
	requireUser: vi.fn(async () => ({ id: 'user-1' })),
	getOwnedConversation: vi.fn(async () => ({
		id: 'conv-1',
		userId: 'user-1',
		projectId: null,
		title: 'New conversation',
		model: 'openai/stale',
		enabledTools: ['web_search'],
		createdAt: new Date(),
		updatedAt: new Date(),
		projectName: null
	})),
	apiError: (code: string, message: string, status = 400) =>
		new Response(JSON.stringify({ error: { code, message } }), { status }),
	handleApiError: () =>
		new Response(JSON.stringify({ error: { code: 'INTERNAL_ERROR' } }), { status: 500 })
}));
vi.mock('$lib/server/ai/model.service', () => ({
	isModelAvailable: vi.fn(async () => state.modelAvailable),
	listAvailableModels: vi.fn(async () => state.available)
}));
vi.mock('$lib/server/ai/project-context', () => ({
	getProjectConversationTools: vi.fn((_id, tools) => tools ?? ['web_search'])
}));
vi.mock('$lib/server/files/storage', () => ({
	MAX_FILE_SIZE: 25 * 1024 * 1024,
	extractUploadedFile: vi.fn(async () => ({
		extractedText: null,
		extractionStatus: 'empty',
		pageCount: null,
		extractionError: null
	})),
	saveUploadedFile: vi.fn(async () => ({
		filename: 'x.txt',
		mimeType: 'text/plain',
		sizeBytes: 1,
		storageKey: 'conv-1/x.txt'
	})),
	cleanupStoredFiles: vi.fn(async () => {})
}));
vi.mock('$lib/server/db/client', () => {
	const db = {
		insert: vi.fn(() => ({
			values: vi.fn((values) => ({
				returning: vi.fn(async () => {
					if (state.failInsert) throw new Error('insert failed');
					state.insertCount++;
					return [{ id: `message-${state.insertCount}`, createdAt: new Date(), ...values }];
				})
			}))
		})),
		update: vi.fn(() => ({
			set: vi.fn(() => ({
				where: vi.fn(async () => {
					state.updateCount++;
				})
			}))
		})),
		delete: vi.fn(() => ({ where: vi.fn(async () => {}) }))
	};
	return {
		getDb: () => db,
		schema: {
			messages: { id: 'id' },
			conversations: { id: 'id', model: 'model' },
			projects: { id: 'id' }
		}
	};
});
vi.mock('$lib/server/ai/agent.service', async (importOriginal) => ({
	...(await importOriginal<typeof import('$lib/server/ai/agent.service')>()),
	runConversationTurn: vi.fn(async (_id: string, model: string) => {
		state.runModels.push(model);
		if (state.turn)
			await new Promise<void>((resolve) => {
				state.turn = { resolve };
			});
	})
}));

import { POST } from '../src/routes/api/conversations/[id]/messages/+server';

function event(body: object) {
	return {
		params: { id: 'conv-1' },
		request: new Request('http://localhost', {
			method: 'POST',
			headers: { 'content-type': 'application/json' },
			body: JSON.stringify(body)
		})
	} as never;
}

beforeEach(() => {
	state.modelAvailable = true;
	state.available = [{ provider: 'openai', id: 'fallback' }];
	state.insertCount = 0;
	state.updateCount = 0;
	state.failInsert = false;
	state.turn = null;
	state.runModels.length = 0;
});

describe('conversation messages route turn lifecycle', () => {
	it('forwards the validated fallback model to the agent', async () => {
		state.modelAvailable = false;
		const response = await POST(event({ content: 'hello', model: 'openai/missing' }));
		await response.text();
		expect(state.runModels).toEqual(['openai/fallback']);
	});

	it('rejects an overlapping turn before writing another message', async () => {
		state.turn = { resolve: () => {} };
		const first = await POST(event({ content: 'first' }));
		const updatesBeforeSecond = state.updateCount;
		state.modelAvailable = false;
		const second = await POST(event({ content: 'second' }));
		expect(second.status).toBe(409);
		expect(state.insertCount).toBe(1);
		expect(state.updateCount).toBe(updatesBeforeSecond);
		state.turn.resolve();
		await first.text();
	});

	it('releases reservation when message setup fails', async () => {
		state.failInsert = true;
		const failed = await POST(event({ content: 'fail' }));
		expect(failed.status).toBe(500);
		state.failInsert = false;
		const retry = await POST(event({ content: 'retry' }));
		expect(retry.status).toBe(200);
		await retry.text();
	});

	it('releases reservation when no model is available', async () => {
		state.modelAvailable = false;
		state.available = [];
		const failed = await POST(event({ content: 'fail', model: 'openai/missing' }));
		expect(failed.status).toBe(400);
		state.modelAvailable = true;
		const retry = await POST(event({ content: 'retry' }));
		expect(retry.status).toBe(200);
		await retry.text();
	});
});
