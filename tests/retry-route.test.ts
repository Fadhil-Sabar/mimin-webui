import { beforeEach, describe, expect, it, vi } from 'vitest';

const state = vi.hoisted(() => ({
	available: [{ provider: 'openai', id: 'fallback' }],
	modelAvailable: true,
	deleteCount: 0,
	deletedIds: [] as string[],
	updateCount: 0,
	updatedConversation: null as Record<string, unknown> | null,
	turn: null as null | { resolve: () => void },
	runModels: [] as string[],
	runPrompts: [] as string[],
	runMessageIds: [] as string[],
	conversationMessages: [] as Array<{ id: string; role: string; content: unknown; createdAt: Date }>
}));

vi.mock('$lib/server/api', () => ({
	requireUser: vi.fn(async () => ({ id: 'user-1' })),
	getOwnedConversation: vi.fn(async () => ({
		id: 'conv-1',
		userId: 'user-1',
		projectId: null,
		title: 'Test conversation',
		model: 'openai/gpt-4o-mini',
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

vi.mock('$lib/server/db/client', () => {
	const db = {
		select: vi.fn(() => ({
			from: vi.fn(() => ({
				where: vi.fn(() => ({
					orderBy: vi.fn(async () => state.conversationMessages)
				}))
			}))
		})),
		update: vi.fn(() => ({
			set: vi.fn((values: Record<string, unknown>) => ({
				where: vi.fn(async () => {
					state.updateCount++;
					state.updatedConversation = values;
				})
			}))
		})),
		delete: vi.fn(() => ({
			where: vi.fn(async () => {
				state.deleteCount++;
			})
		}))
	};
	return {
		getDb: () => db,
		schema: {
			messages: { id: 'id', conversationId: 'conversationId', createdAt: 'createdAt' },
			messageAttachments: { id: 'id', messageId: 'messageId' },
			conversations: { id: 'id', model: 'model', updatedAt: 'updatedAt' }
		}
	};
});

vi.mock('$lib/server/ai/agent.service', async (importOriginal) => ({
	...(await importOriginal<typeof import('$lib/server/ai/agent.service')>()),
	runConversationTurn: vi.fn(
		async (
			_id: string,
			model: string,
			prompt: string,
			_emit: unknown,
			_userId: unknown,
			currentMessageId: string
		) => {
			state.runModels.push(model);
			state.runPrompts.push(prompt);
			state.runMessageIds.push(currentMessageId);
			if (state.turn) {
				await new Promise<void>((resolve) => {
					state.turn = { resolve };
				});
			}
		}
	)
}));

import { POST } from '../src/routes/api/conversations/[id]/retry/+server';

function event(body: object = {}) {
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
	state.deleteCount = 0;
	state.deletedIds = [];
	state.updateCount = 0;
	state.updatedConversation = null;
	state.turn = null;
	state.runModels.length = 0;
	state.runPrompts.length = 0;
	state.runMessageIds.length = 0;
	state.conversationMessages = [
		{
			id: 'msg-user-1',
			role: 'user',
			content: 'Hello agent',
			createdAt: new Date(1000)
		}
	];
});

describe('conversation retry route', () => {
	it('retries turn for the last user message and executes agent', async () => {
		const res = await POST(event());
		expect(res.status).toBe(200);
		await res.text();
		expect(state.runPrompts).toEqual(['Hello agent']);
		expect(state.runMessageIds).toEqual(['msg-user-1']);
		expect(state.runModels).toEqual(['openai/gpt-4o-mini']);
	});

	it('cleans up trailing assistant messages following the last user message', async () => {
		state.conversationMessages = [
			{
				id: 'msg-user-1',
				role: 'user',
				content: 'Why did it fail?',
				createdAt: new Date(1000)
			},
			{
				id: 'msg-asst-failed',
				role: 'assistant',
				content: '',
				createdAt: new Date(2000)
			}
		];
		const res = await POST(event());
		expect(res.status).toBe(200);
		await res.text();
		expect(state.deleteCount).toBe(1);
		expect(state.runPrompts).toEqual(['Why did it fail?']);
		expect(state.runMessageIds).toEqual(['msg-user-1']);
	});

	it('returns 400 when there are no user messages to retry', async () => {
		state.conversationMessages = [];
		const res = await POST(event());
		expect(res.status).toBe(400);
		const json = await res.json();
		expect(json.error?.code).toBe('NO_MESSAGE_TO_RETRY');
	});

	it('returns 409 when conversation is already generating', async () => {
		state.turn = { resolve: () => {} };
		const first = await POST(event());
		expect(first.status).toBe(200);

		const second = await POST(event());
		expect(second.status).toBe(409);
		const json = await second.json();
		expect(json.error?.code).toBe('CONVERSATION_BUSY');

		state.turn.resolve();
		await first.text();
	});

	it('uses fallback model when current model is not available', async () => {
		state.modelAvailable = false;
		const res = await POST(event());
		expect(res.status).toBe(200);
		await res.text();
		expect(state.runModels).toEqual(['openai/fallback']);
	});

	it('updates conversation model when a new valid model is provided', async () => {
		const res = await POST(event({ model: 'openai/gpt-4o' }));
		expect(res.status).toBe(200);
		await res.text();
		expect(state.runModels).toEqual(['openai/gpt-4o']);
		expect(state.updatedConversation?.model).toBe('openai/gpt-4o');
	});
});
