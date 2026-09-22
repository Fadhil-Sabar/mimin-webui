import { beforeEach, describe, expect, it, vi } from 'vitest';

const state = vi.hoisted(() => ({
	available: [{ provider: 'openai', id: 'fallback' }],
	modelAvailable: true,
	deleteCount: 0,
	deletedIds: [] as string[],
	updateCount: 0,
	updatedConversation: null as Record<string, unknown> | null,
	/** Values written by the message-level updates (superseding the previous answer). */
	messageUpdates: [] as Array<Record<string, unknown>>,
	turn: null as null | { resolve: () => void },
	runModels: [] as string[],
	runPrompts: [] as string[],
	runMessageIds: [] as string[],
	runExcludedIds: [] as string[][],
	replacementId: 'replacement-1' as string | null,
	runError: false,
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
	const schema = {
		messages: { id: 'id', conversationId: 'conversationId', createdAt: 'createdAt' },
		messageAttachments: { id: 'id', messageId: 'messageId' },
		conversations: { id: 'id', model: 'model', updatedAt: 'updatedAt' },
		activeTurns: {
			conversationId: 'conversation_id',
			token: 'token',
			canceled: 'canceled',
			leaseUntil: 'lease_until',
			updatedAt: 'updated_at'
		}
	};
	const db = {
		insert: vi.fn((table: unknown) => ({
			values: vi.fn((values: Record<string, unknown>) => {
				void table;
				const chain = {
					returning: vi.fn(async () => [values]),
					onConflictDoNothing: vi.fn(() => chain)
				};
				return chain;
			})
		})),
		select: vi.fn(() => ({
			from: vi.fn((table: unknown) => {
				const rows = table === schema.messageAttachments ? [] : state.conversationMessages;
				const query = {
					where: vi.fn(() => query),
					orderBy: vi.fn(async () => rows),
					then: (resolve: (value: unknown) => unknown, reject?: (error: unknown) => unknown) =>
						Promise.resolve(rows).then(resolve, reject)
				};
				return query;
			})
		})),
		update: vi.fn(() => ({
			set: vi.fn((values: Record<string, unknown>) => ({
				where: vi.fn(async () => {
					state.updateCount++;
					if ('turnState' in values) state.messageUpdates.push(values);
					else state.updatedConversation = values;
				})
			}))
		})),
		delete: vi.fn((table: unknown) => ({
			where: vi.fn(async () => {
				if (table !== schema.activeTurns) state.deleteCount++;
			})
		}))
	};
	return { getDb: () => db, schema };
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
			currentMessageId: string,
			_turnToken: string,
			_browserBridgeEnabled: boolean,
			_turnEnabledTools: string[],
			excludeMessageIds: string[]
		) => {
			state.runModels.push(model);
			state.runPrompts.push(prompt);
			state.runMessageIds.push(currentMessageId);
			state.runExcludedIds.push(excludeMessageIds);
			if (state.turn) {
				await new Promise<void>((resolve) => {
					state.turn = { resolve };
				});
			}
			if (state.runError) throw new Error('Provider failed');
			return state.replacementId;
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
	state.messageUpdates = [];
	state.turn = null;
	state.runModels.length = 0;
	state.runPrompts.length = 0;
	state.runMessageIds.length = 0;
	state.runExcludedIds.length = 0;
	state.replacementId = 'replacement-1';
	state.runError = false;
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

	it('supersedes the prior answer only after a replacement succeeds', async () => {
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
		expect(state.messageUpdates).toEqual([{ turnState: 'superseded' }]);
		expect(state.runExcludedIds).toEqual([['msg-asst-failed']]);
		expect(state.deleteCount).toBe(0);
		expect(state.runPrompts).toEqual(['Why did it fail?']);
		expect(state.runMessageIds).toEqual(['msg-user-1']);
	});

	it('keeps the previous answer after a failed replacement', async () => {
		state.conversationMessages.push({
			id: 'msg-asst-previous',
			role: 'assistant',
			content: 'Existing answer',
			createdAt: new Date(2000)
		});
		state.runError = true;
		const res = await POST(event());
		await res.text();
		expect(state.messageUpdates).toEqual([]);
		expect(state.runExcludedIds).toEqual([['msg-asst-previous']]);
	});

	it('keeps the previous answer when regeneration is canceled or has no answer', async () => {
		state.conversationMessages.push({
			id: 'msg-asst-previous',
			role: 'assistant',
			content: 'Existing answer',
			createdAt: new Date(2000)
		});
		state.replacementId = null;
		const res = await POST(event());
		await res.text();
		expect(state.messageUpdates).toEqual([]);
	});

	it('leaves history untouched when no model is available', async () => {
		state.conversationMessages = [
			{
				id: 'msg-user-1',
				role: 'user',
				content: 'Why did it fail?',
				createdAt: new Date(1000)
			},
			{
				id: 'msg-asst-previous',
				role: 'assistant',
				content: 'The previous answer',
				createdAt: new Date(2000)
			}
		];
		state.modelAvailable = false;
		state.available = [];

		const res = await POST(event());

		expect(res.status).toBe(400);
		const json = await res.json();
		expect(json.error?.code).toBe('MODEL_NOT_AVAILABLE');
		// The model is resolved before anything is written: a regenerate that cannot
		// run must not cost the user the answer they were trying to replace.
		expect(state.updateCount).toBe(0);
		expect(state.messageUpdates).toEqual([]);
		expect(state.deleteCount).toBe(0);
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
