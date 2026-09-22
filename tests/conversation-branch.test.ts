import { beforeEach, describe, expect, it, vi } from 'vitest';

const state = vi.hoisted(() => ({
	user: { id: 'user-1' } as { id: string } | null,
	conversation: {
		id: 'conv-1',
		userId: 'user-1',
		projectId: null,
		activeSkillId: null,
		activeSkillSnapshot: null,
		title: 'Source',
		model: 'openai/gpt-4o-mini',
		enabledTools: ['web_search'],
		historyRevision: 2,
		createdAt: new Date(),
		updatedAt: new Date(),
		projectName: null
	},
	messages: [
		{
			id: 'msg-1',
			conversationId: 'conv-1',
			role: 'user',
			content: 'first',
			skillSnapshot: null,
			turnState: 'complete',
			createdAt: new Date(1)
		},
		{
			id: 'msg-2',
			conversationId: 'conv-1',
			role: 'assistant',
			content: 'answer',
			skillSnapshot: null,
			turnState: 'complete',
			createdAt: new Date(2)
		}
	],
	attachments: [
		{
			messageId: 'msg-1',
			filename: 'file.txt',
			mimeType: 'text/plain',
			sizeBytes: 4,
			storageKey: 'conv-1/file.txt',
			extractedText: 'text',
			extractionStatus: 'complete',
			pageCount: null,
			extractionError: null
		}
	],
	createdConversation: null as Record<string, unknown> | null,
	createdMessages: [] as Array<Record<string, unknown>>
}));

vi.mock('$lib/server/api', () => ({
	requireUser: vi.fn(async () => state.user),
	getOwnedConversation: vi.fn(async () => state.conversation),
	apiError: (code: string, message: string, status = 400) =>
		new Response(JSON.stringify({ error: { code, message } }), { status }),
	handleApiError: vi.fn(
		() => new Response(JSON.stringify({ error: { code: 'INTERNAL_ERROR' } }), { status: 500 })
	)
}));
vi.mock('$lib/server/ai/agent.service', () => ({
	hasActiveConversationTurn: vi.fn(async () => false)
}));

vi.mock('$lib/server/db/client', () => {
	const schema = {
		conversations: { id: 'conversations.id' },
		messages: {
			id: 'messages.id',
			conversationId: 'messages.conversationId',
			turnState: 'messages.turnState',
			createdAt: 'messages.createdAt'
		},
		messageAttachments: { messageId: 'messageAttachments.messageId' },
		toolCalls: { messageId: 'toolCalls.messageId' },
		messageCitations: { messageId: 'messageCitations.messageId' }
	};
	const db = {
		select: vi.fn(() => {
			let table: unknown;
			const chain: Record<string, unknown> = {};
			for (const method of ['from', 'where', 'orderBy'])
				chain[method] = vi.fn((value?: unknown) => {
					if (method === 'from') table = value;
					return chain;
				});
			chain.then = (
				resolve: (value: unknown) => unknown,
				reject?: (reason: unknown) => unknown
			) => {
				const rows =
					table === schema.messages
						? state.messages
						: table === schema.messageAttachments
							? state.attachments
							: [];
				return Promise.resolve(rows).then(resolve, reject);
			};
			return chain;
		}),
		insert: vi.fn((table: unknown) => ({
			values: vi.fn((values: Record<string, unknown> | Array<Record<string, unknown>>) => ({
				returning: vi.fn(async () => {
					if (table === schema.conversations) {
						state.createdConversation = { id: 'branch-1', ...values };
						return [state.createdConversation];
					}
					if (table === schema.messages) {
						const row = {
							id: `copy-${state.createdMessages.length + 1}`,
							...(values as Record<string, unknown>)
						};
						state.createdMessages.push(row);
						return [row];
					}
					return [];
				})
			}))
		}))
	};
	return { getDb: () => db, schema };
});

const { POST } = await import('../src/routes/api/conversations/[id]/branch/+server');

function event(body: Record<string, unknown>) {
	return {
		params: { id: 'conv-1' },
		request: new Request('http://localhost/api/conversations/conv-1/branch', {
			method: 'POST',
			headers: { 'content-type': 'application/json' },
			body: JSON.stringify(body)
		})
	} as never;
}

beforeEach(() => {
	state.user = { id: 'user-1' };
	state.createdConversation = null;
	state.createdMessages = [];
});

describe('conversation branching', () => {
	it('rejects a stale history revision', async () => {
		const response = await POST(event({ historyRevision: 1 }));
		expect(response.status).toBe(409);
		expect((await response.json()).error.code).toBe('HISTORY_STALE');
	});

	it('copies the selected history prefix and its attachments', async () => {
		const response = await POST(event({ historyRevision: 2, throughMessageId: 'msg-1' }));
		expect(response.status).toBe(201);
		expect(state.createdConversation).toMatchObject({
			id: 'branch-1',
			title: 'Source (branch)',
			historyRevision: 1
		});
		expect(state.createdMessages).toHaveLength(1);
	});
});
