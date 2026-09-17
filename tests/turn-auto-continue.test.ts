import { beforeEach, describe, expect, it, vi } from 'vitest';

type ScriptedEvent = Record<string, unknown>;

const state = vi.hoisted(() => ({
	listeners: [] as Array<(event: unknown) => void>,
	messages: [] as Array<Record<string, unknown>>,
	inserts: [] as Array<{ table: unknown; values: Record<string, unknown> }>,
	/** One batch of agent events per `agent.prompt` call. */
	script: [] as ScriptedEvent[][],
	promptCalls: [] as unknown[],
	conversation: {
		id: 'conversation-1',
		userId: 'user-1',
		projectId: null as string | null,
		title: 'Chat',
		model: 'openai/test',
		enabledTools: [] as string[],
		createdAt: new Date('2026-01-01T00:00:00Z'),
		updatedAt: new Date('2026-01-01T00:00:00Z'),
		projectName: null
	},
	insertId: 0
}));

const schema = vi.hoisted(() => {
	const table = (name: string) => ({ name });
	return {
		conversations: table('conversations'),
		messages: table('messages'),
		projects: table('projects'),
		messageAttachments: table('messageAttachments'),
		toolCalls: table('toolCalls'),
		sources: { ...table('sources'), id: 'sources.id' },
		messageCitations: table('messageCitations'),
		projectFiles: {
			...table('projectFiles'),
			id: 'projectFiles.id',
			projectId: 'projectFiles.projectId'
		}
	};
});

function queryFor(table: unknown) {
	let result: unknown[] = [];
	if (table === schema.conversations) result = [state.conversation];
	if (table === schema.messages) result = state.messages;
	if (table === schema.projects) result = [{ instructions: null }];
	const query = {
		from() {
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
		limit() {
			return query;
		},
		for() {
			return query;
		},
		then(resolve: (value: unknown[]) => unknown, reject?: (error: unknown) => unknown) {
			return Promise.resolve(result).then(resolve, reject);
		}
	};
	return query;
}

function insertFor(table: unknown, values: Record<string, unknown>) {
	state.inserts.push({ table, values });
	const id = `${String((table as { name?: string }).name ?? 'row')}-${++state.insertId}`;
	const row = { ...values, id, createdAt: new Date('2026-01-01T00:00:01Z') };
	if (table === schema.messages) state.messages.push(row);
	const operation = {
		returning: async () => [row],
		then(resolve: (value: unknown) => unknown, reject?: (error: unknown) => unknown) {
			return Promise.resolve(row).then(resolve, reject);
		}
	};
	return operation;
}

type MockDb = {
	select: () => Omit<ReturnType<typeof queryFor>, 'from'> & {
		from: (table: unknown) => ReturnType<typeof queryFor>;
	};
	insert: (table: unknown) => {
		values: (values: Record<string, unknown>) => ReturnType<typeof insertFor>;
	};
	update: () => { set: () => { where: () => Promise<void> } };
	delete: () => { where: () => Promise<void> };
	transaction: <T>(callback: (tx: MockDb) => Promise<T>) => Promise<T>;
};

vi.mock('@earendil-works/pi-agent-core', () => {
	class MockAgent {
		state = { errorMessage: null, messages: [{ role: 'assistant', stopReason: 'stop' }] };
		constructor() {}
		subscribe(listener: (event: unknown) => void) {
			state.listeners.push(listener);
		}
		async prompt(message: unknown) {
			state.promptCalls.push(message);
			const events = state.script.shift() ?? [];
			// Emit without awaiting listeners to model the SDK's event emitter.
			for (const event of events) for (const listener of state.listeners) listener(event);
		}
		abort() {}
	}
	return { Agent: MockAgent };
});

vi.mock('@earendil-works/pi-ai', () => ({ clampThinkingLevel: () => 'off' }));
vi.mock('$lib/server/db/client', () => {
	const db: MockDb = {
		select: () => ({
			...queryFor(undefined),
			from: (table: unknown) => queryFor(table)
		}),
		insert: (table: unknown) => ({
			values: (values: Record<string, unknown>) => insertFor(table, values)
		}),
		update: () => ({ set: () => ({ where: async () => undefined }) }),
		delete: () => ({ where: async () => undefined }),
		transaction: async <T>(callback: (tx: MockDb) => Promise<T>) => callback(db)
	};
	return { getDb: () => db, schema };
});
vi.mock('$lib/server/ai/model.service', () => ({
	splitModelRef: () => ({ provider: 'openai', id: 'test' }),
	resolveModel: () => ({ input: ['text'] }),
	listAvailableModels: vi.fn(async () => []),
	configuredModelMaxTokens: () => undefined,
	modelRegistry: () => ({ streamSimple: vi.fn() })
}));
vi.mock('$lib/server/ai/provider-settings.service', () => ({
	getProviderCredential: vi.fn(async () => ({ apiKey: 'test-key' }))
}));
vi.mock('$lib/server/ai/web-search-settings.service', () => ({
	getWebSearchSettings: vi.fn(async () => undefined)
}));
vi.mock('$lib/server/ai/tools/project-knowledge.tool', () => ({
	createProjectKnowledgeTool: vi.fn(() => ({ name: 'project_knowledge_search' }))
}));
vi.mock('$lib/server/ai/tools/web-search.tool', () => ({ createWebSearchTool: vi.fn() }));
vi.mock('$lib/server/ai/model-preferences.service', () => ({
	getModelThinkingPreference: vi.fn(async () => 'off')
}));
vi.mock('$lib/server/ai/user-instructions.service', () => ({
	buildUserSystemPrompt: (base: string) => base,
	getUserInstructions: vi.fn(async () => null)
}));
vi.mock('../src/lib/server/skill-runtime', () => ({ getTurnSkillSnapshot: () => null }));
vi.mock('$lib/server/files/storage', () => ({ readStoredFile: vi.fn() }));
vi.mock('$lib/server/files/attachment-context', () => ({
	buildAttachmentContext: vi.fn(async () => '')
}));
vi.mock('$lib/server/files/pdf-vision', () => ({
	buildPdfVisionFallback: vi.fn(async () => ({ notice: '', images: [] }))
}));
vi.mock('$lib/server/ai/project-context', () => ({
	buildProjectSystemPrompt: (base: string) => base,
	getProjectConversationTools: (_projectId: string, tools: string[]) => tools
}));
vi.mock('../src/lib/server/outbound', () => ({ assertAllowedOutboundUrl: vi.fn() }));
vi.mock('../src/lib/server/browser/bridge', () => ({
	cancelBrowserRequests: vi.fn()
}));
vi.mock('../src/lib/server/browser/consent', () => ({ cancelBrowserConsents: vi.fn() }));
vi.mock('../src/lib/server/ai/question-broker', () => ({ cancelQuestionRequests: vi.fn() }));
vi.mock('../src/lib/server/ai/tools/browser.tool', () => ({
	createBrowserOpenTool: vi.fn(),
	createBrowserSearchTool: vi.fn()
}));
vi.mock('../src/lib/server/ai/tools/question.tool', () => ({ createAskQuestionTool: vi.fn() }));
vi.mock('../src/lib/server/ai/tools/skill.tool', () => ({ createCreateSkillTool: vi.fn() }));
vi.mock('../src/lib/server/ai/tool-routing', () => ({
	getPendingBrowserAction: vi.fn(() => null),
	getPendingBrowserActionInstruction: vi.fn(),
	getTurnRoutingInstruction: vi.fn(() => ''),
	resolveTurnToolGating: vi.fn(() => ({
		browserIntent: { type: 'none' },
		exposeWebSearch: false,
		exposeWebFetch: false,
		exposeBrowserSearch: false,
		exposeBrowserOpen: false,
		blockedReason: null
	}))
}));

const { MAX_AUTO_CONTINUES, runConversationTurn } =
	await import('../src/lib/server/ai/agent.service');

/** A segment the provider cut off because the output budget ran out. */
function truncatedSegment(text: string): ScriptedEvent[] {
	return [
		{ type: 'agent_start' },
		{ type: 'message_start', message: { role: 'assistant' } },
		...(text
			? [{ type: 'message_update', assistantMessageEvent: { type: 'text_delta', delta: text } }]
			: []),
		{
			type: 'message_end',
			message: { role: 'assistant', stopReason: 'length', rawStopReason: 'length' }
		},
		{ type: 'agent_end' }
	];
}

/** A segment the provider finished normally. */
function completeSegment(text: string): ScriptedEvent[] {
	return [
		{ type: 'agent_start' },
		{ type: 'message_start', message: { role: 'assistant' } },
		{ type: 'message_update', assistantMessageEvent: { type: 'text_delta', delta: text } },
		{ type: 'message_end', message: { role: 'assistant', stopReason: 'stop' } },
		{ type: 'agent_end' }
	];
}

function runTurn(events: Array<Record<string, unknown>>) {
	return runConversationTurn(
		'conversation-1',
		'openai/test',
		'Write me a long answer',
		(event) => events.push(event),
		'user-1',
		'user-message-1',
		'turn-1',
		false,
		[]
	);
}

beforeEach(() => {
	state.conversation.userId = 'user-1';
	state.listeners.length = 0;
	state.messages = [
		{
			id: 'user-message-1',
			role: 'user',
			content: 'Write me a long answer',
			skillSnapshot: null,
			createdAt: new Date('2026-01-01T00:00:00Z')
		}
	];
	state.inserts.length = 0;
	state.script.length = 0;
	state.promptCalls.length = 0;
	state.insertId = 0;
});

describe('auto-continue on output limit', () => {
	it('keeps the turn going instead of asking the user to press Continue', async () => {
		state.script = [truncatedSegment('Once upon a '), completeSegment('time, the end.')];
		const events: Array<Record<string, unknown>> = [];

		await runTurn(events);

		expect(state.promptCalls).toHaveLength(2);
		expect(state.promptCalls[1]).toBe('continue');
		expect(events.some((event) => event.type === 'turn.incomplete')).toBe(false);
		expect(state.inserts.filter((entry) => entry.table === schema.messages)).toHaveLength(2);
	});

	it('does not re-prompt a turn that already finished', async () => {
		state.script = [completeSegment('Here you go.')];
		const events: Array<Record<string, unknown>> = [];

		await runTurn(events);

		expect(state.promptCalls).toHaveLength(1);
		expect(events.some((event) => event.type === 'turn.incomplete')).toBe(false);
	});

	it('gives up after the retry budget and leaves the notice for the user', async () => {
		state.script = Array.from({ length: MAX_AUTO_CONTINUES + 1 }, () =>
			truncatedSegment('Still writing ')
		);
		const events: Array<Record<string, unknown>> = [];

		await runTurn(events);

		expect(state.promptCalls).toHaveLength(MAX_AUTO_CONTINUES + 1);
		expect(state.promptCalls.slice(1).every((call) => call === 'continue')).toBe(true);
		expect(events).toContainEqual(
			expect.objectContaining({ type: 'turn.incomplete', kind: 'truncated' })
		);
	});

	it('leaves a reasoning-only turn alone', async () => {
		state.script = [
			[
				{ type: 'agent_start' },
				{ type: 'message_start', message: { role: 'assistant' } },
				{ type: 'message_end', message: { role: 'assistant', stopReason: 'stop' } },
				{ type: 'agent_end' }
			]
		];
		const events: Array<Record<string, unknown>> = [];

		await runTurn(events);

		expect(state.promptCalls).toHaveLength(1);
		expect(events).toContainEqual(
			expect.objectContaining({ type: 'turn.incomplete', kind: 'no-answer' })
		);
	});
});
