import { beforeEach, describe, expect, it, vi } from 'vitest';

const state = vi.hoisted(() => ({
	/** Messages as the database would return them for a newest-first query. */
	messages: [] as Array<Record<string, unknown>>,
	/** The row count the handler asked for, so the fake honours `limit(limit + 1)`. */
	limit: null as number | null,
	/** The `where` argument the handler built for the messages query. */
	where: null as unknown,
	linkedCanvas: null as string | null
}));

const schema = vi.hoisted(() => ({
	messages: {
		id: 'messages.id',
		conversationId: 'messages.conversationId',
		createdAt: 'messages.createdAt',
		turnState: 'messages.turnState'
	},
	toolCalls: {
		id: 'toolCalls.id',
		messageId: 'toolCalls.messageId',
		startedAt: 'toolCalls.startedAt'
	},
	messageAttachments: { messageId: 'messageAttachments.messageId' },
	messageCitations: {
		messageId: 'messageCitations.messageId',
		sourceId: 'messageCitations.sourceId'
	},
	sources: { id: 'sources.id' },
	canvases: {
		id: 'canvases.id',
		conversationId: 'canvases.conversationId',
		userId: 'canvases.userId'
	}
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
		activeSkillId: null,
		activeSkillSnapshot: null,
		createdAt: new Date(1000),
		updatedAt: new Date(2000),
		projectName: null
	})),
	apiError: (code: string, message: string, status = 400) =>
		new Response(JSON.stringify({ error: { code, message } }), { status }),
	handleApiError: () =>
		new Response(JSON.stringify({ error: { code: 'INTERNAL_ERROR' } }), { status: 500 })
}));

vi.mock('$lib/server/db/client', () => {
	function rowsFor(table: unknown) {
		if (table === schema.messages)
			return state.limit === null ? state.messages : state.messages.slice(0, state.limit);
		if (table === schema.canvases) return state.linkedCanvas ? [{ id: state.linkedCanvas }] : [];
		return [];
	}

	const db = {
		select: vi.fn(() => {
			let table: unknown;
			const chain: Record<string, unknown> = {};
			for (const method of ['from', 'where', 'orderBy', 'innerJoin', 'limit']) {
				chain[method] = vi.fn((argument?: unknown) => {
					if (method === 'from') {
						table = argument;
						state.limit = null;
						if (argument === schema.messages) state.where = null;
					}
					if (method === 'where' && table === schema.messages) state.where = argument;
					if (method === 'limit' && table === schema.messages) state.limit = argument as number;
					return chain;
				});
			}
			chain.then = (resolve: (value: unknown) => unknown, reject?: (error: unknown) => unknown) =>
				Promise.resolve(rowsFor(table)).then(resolve, reject);
			return chain;
		})
	};

	return { getDb: () => db, schema };
});

const { GET } = await import('../src/routes/api/conversations/[id]/+server');
const { encodeMessageCursor } = await import('../src/lib/server/conversations');
const { beginConversationTurn, releaseConversationTurn } =
	await import('../src/lib/server/ai/agent.service');

function message(id: string, createdAt: number, extra: Record<string, unknown> = {}) {
	return {
		id,
		conversationId: 'conv-1',
		role: id.startsWith('u') ? 'user' : 'assistant',
		content: `content ${id}`,
		skillSnapshot: null,
		stopReason: null,
		turnState: 'complete',
		completedAt: null,
		usage: null,
		createdAt: new Date(createdAt),
		...extra
	};
}

function event(query = '') {
	return {
		locals: { user: { id: 'user-1' } },
		params: { id: 'conv-1' },
		url: new URL(`http://localhost/api/conversations/conv-1${query}`),
		request: new Request('http://localhost/api/conversations/conv-1')
	} as never;
}

/** Walks a nested SQL structure looking for a value, without assuming its shape. */
function containsValue(
	node: unknown,
	needle: string,
	depth = 0,
	seen = new Set<unknown>()
): boolean {
	if (depth > 8 || node == null) return false;
	if (typeof node === 'string') return node === needle;
	if (typeof node !== 'object') return false;
	if (seen.has(node)) return false;
	seen.add(node);
	if (Array.isArray(node)) return node.some((item) => containsValue(item, needle, depth + 1, seen));
	return Object.values(node as Record<string, unknown>).some((value) =>
		containsValue(value, needle, depth + 1, seen)
	);
}

beforeEach(() => {
	state.messages = [];
	state.limit = null;
	state.where = null;
	state.linkedCanvas = null;
});

describe('conversation message pagination', () => {
	it('returns the newest page in chronological order', async () => {
		// Newest first, as the ordered query produces them.
		state.messages = [
			message('a5', 5000),
			message('a4', 4000),
			message('a3', 3000),
			message('a2', 2000)
		];

		const response = await GET(event('?limit=2'));
		const body = await response.json();

		// The bug this replaces returned the two oldest messages instead.
		expect(body.messages.map((item: { id: string }) => item.id)).toEqual(['a4', 'a5']);
		expect(body.hasMore).toBe(true);
		expect(body.olderCursor).toBeTruthy();
		expect(body.nextCursor).toBeUndefined();
	});

	it('walks backwards through older messages with the cursor', async () => {
		state.messages = [message('a2', 2000), message('a1', 1000)];
		const cursor = encodeMessageCursor({ createdAt: new Date(2500), id: 'a3' });

		const response = await GET(event(`?limit=2&cursor=${encodeURIComponent(cursor)}`));
		const body = await response.json();

		expect(body.messages.map((item: { id: string }) => item.id)).toEqual(['a1', 'a2']);
		expect(body.hasMore).toBe(false);
		expect(body.olderCursor).toBeNull();
	});

	it('excludes superseded replies from the query', async () => {
		await GET(event());

		expect(containsValue(state.where, 'messages.turnState')).toBe(true);
		expect(containsValue(state.where, 'messages.conversationId')).toBe(true);
	});

	it('passes provider usage through to the client', async () => {
		state.messages = [
			message('a1', 1000, {
				usage: { input: 12, output: 34, totalTokens: 46 },
				completedAt: new Date(2000)
			})
		];

		const response = await GET(event());
		const body = await response.json();

		expect(body.messages[0].usage).toEqual({ input: 12, output: 34, totalTokens: 46 });
		expect(body.messages[0].completedAt).toBeTruthy();
	});

	it('reports a turn left mid-flight as interrupted when nothing is running', async () => {
		state.messages = [message('a1', 1000, { turnState: 'streaming' })];

		const response = await GET(event());
		const body = await response.json();

		expect(body.messages[0].turnState).toBe('interrupted');
	});

	it('keeps a streaming turn streaming while it is still active', async () => {
		state.messages = [message('a1', 1000, { turnState: 'streaming' })];
		beginConversationTurn('conv-1', 'turn-token');
		try {
			const response = await GET(event());
			const body = await response.json();
			expect(body.messages[0].turnState).toBe('streaming');
		} finally {
			releaseConversationTurn('conv-1', 'turn-token');
		}
	});

	it('rejects a malformed cursor', async () => {
		const response = await GET(event('?cursor=not-a-cursor'));
		expect(response.status).toBe(400);
	});
});
