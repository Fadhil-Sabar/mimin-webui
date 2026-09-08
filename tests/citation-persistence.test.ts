import { beforeEach, describe, expect, it, vi } from 'vitest';

const state = vi.hoisted(() => ({
	listeners: [] as Array<(event: unknown) => void>,
	messages: [] as Array<Record<string, unknown>>,
	inserts: [] as Array<{ table: unknown; values: Record<string, unknown> }>,
	liveFiles: [{ id: 'file-1' }] as Array<{ id: string }>,
	emitSources: true,
	conversation: {
		id: 'conversation-1',
		userId: 'user-1',
		projectId: 'project-1',
		title: 'Project chat',
		model: 'openai/test',
		enabledTools: ['project_knowledge_search'],
		createdAt: new Date('2026-01-01T00:00:00Z'),
		updatedAt: new Date('2026-01-01T00:00:00Z'),
		projectName: 'Private project'
	},
	insertId: 0,
	sourceId: 0
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
	if (table === schema.projectFiles) result = state.liveFiles;
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
	const row = {
		...values,
		id,
		createdAt: new Date('2026-01-01T00:00:01Z')
	};
	if (table === schema.messages) state.messages.push(row);
	if (table === schema.sources) row.id = `source-${++state.sourceId}`;
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
		state = {
			errorMessage: null,
			messages: [{ role: 'assistant', stopReason: 'stop' }]
		};
		constructor() {}
		subscribe(listener: (event: unknown) => void) {
			state.listeners.push(listener);
		}
		async prompt() {
			const source = {
				type: 'project_file',
				title: 'requirements.pdf',
				filename: 'requirements.pdf',
				projectId: 'project-1',
				fileId: 'file-1',
				chunkId: 'chunk-1',
				page: 3,
				passage: 'The retention period is seven years.'
			};
			const secondSource = {
				...source,
				chunkId: 'chunk-2',
				page: 4,
				passage: 'The policy is reviewed annually.'
			};
			const foreignSource = { ...source, projectId: 'project-2', fileId: 'private-file' };
			const events = [
				{ type: 'agent_start' },
				{ type: 'message_start', message: { role: 'assistant' } },
				{
					type: 'tool_execution_start',
					toolCallId: 'tool-1',
					toolName: 'project_knowledge_search',
					args: { query: 'retention' }
				},
				{
					type: 'tool_execution_end',
					toolCallId: 'tool-1',
					toolName: 'project_knowledge_search',
					result: {
						details: { sources: state.emitSources ? [source, secondSource, foreignSource] : [] }
					},
					isError: false
				},
				{
					type: 'message_update',
					assistantMessageEvent: { type: 'text_delta', delta: 'The answer is seven years [1].' }
				},
				{ type: 'message_end', message: { role: 'assistant' } },
				{ type: 'agent_end' }
			];
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
vi.mock('../src/lib/server/browser/bridge', () => ({ cancelBrowserRequests: vi.fn() }));
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
		exposeBrowserSearch: false,
		exposeBrowserOpen: false,
		blockedReason: null
	}))
}));

const { runConversationTurn } = await import('../src/lib/server/ai/agent.service');

beforeEach(() => {
	state.conversation.userId = 'user-1';
	state.listeners.length = 0;
	state.inserts.length = 0;
	state.messages = [
		{
			id: 'user-message-1',
			role: 'user',
			content: 'What is the retention period?',
			skillSnapshot: null,
			createdAt: new Date('2026-01-01T00:00:00Z')
		}
	];
	state.insertId = 0;
	state.sourceId = 0;
	state.liveFiles = [{ id: 'file-1' }];
	state.emitSources = true;
});

describe('project knowledge citation persistence', () => {
	it('persists only active project citations on the final assistant message and emits them', async () => {
		const events: Array<Record<string, unknown>> = [];
		await runConversationTurn(
			'conversation-1',
			'openai/test',
			'What is the retention period?',
			(event) => events.push(event),
			'user-1',
			'user-message-1',
			'turn-1',
			false,
			['project_knowledge_search']
		);

		const sourceInsert = state.inserts.find((entry) => entry.table === schema.sources);
		const citationInsert = state.inserts.find((entry) => entry.table === schema.messageCitations);
		expect(sourceInsert?.values).toMatchObject({
			type: 'project_file',
			title: 'requirements.pdf',
			fileId: 'file-1',
			metadata: {
				projectId: 'project-1',
				filename: 'requirements.pdf',
				page: 3,
				passage: 'The retention period is seven years.',
				chunkId: 'chunk-1'
			}
		});
		expect(citationInsert?.values).toMatchObject({
			messageId: expect.any(String),
			sourceId: 'source-1'
		});
		expect(events).toContainEqual(
			expect.objectContaining({
				type: 'message.citations',
				citations: expect.arrayContaining([
					expect.objectContaining({
						filename: 'requirements.pdf',
						page: 3,
						passage: 'The retention period is seven years.',
						url: '/api/projects/project-1/files/file-1'
					}),
					expect.objectContaining({
						filename: 'requirements.pdf',
						page: 4,
						passage: 'The policy is reviewed annually.'
					})
				])
			})
		);
		const persistedSources = state.inserts.filter((entry) => entry.table === schema.sources);
		expect(persistedSources).toHaveLength(2);
	});

	it('does not carry citations from a previous turn into a retry turn', async () => {
		const run = () =>
			runConversationTurn(
				'conversation-1',
				'openai/test',
				'What is the retention period?',
				() => {},
				'user-1',
				'user-message-1',
				'turn-1',
				false,
				['project_knowledge_search']
			);
		await run();
		const firstSourceCount = state.inserts.filter((entry) => entry.table === schema.sources).length;
		state.listeners.length = 0;
		state.messages = [
			{
				id: 'user-message-2',
				role: 'user',
				content: 'Retry the answer',
				skillSnapshot: null,
				createdAt: new Date('2026-01-01T00:00:02Z')
			}
		];
		state.inserts.length = 0;
		state.insertId = 0;
		state.sourceId = 0;
		state.emitSources = false;
		await runConversationTurn(
			'conversation-1',
			'openai/test',
			'Retry the answer',
			() => {},
			'user-1',
			'user-message-2',
			'turn-2',
			false,
			['project_knowledge_search']
		);
		expect(firstSourceCount).toBe(2);
		expect(state.inserts.filter((entry) => entry.table === schema.sources)).toHaveLength(0);
	});

	it('rejects a conversation owned by another user before running the provider', async () => {
		state.conversation.userId = 'user-2';
		await expect(
			runConversationTurn(
				'conversation-1',
				'openai/test',
				'What is the retention period?',
				() => {},
				'user-1',
				'user-message-1',
				'turn-unauthorized',
				false,
				['project_knowledge_search']
			)
		).rejects.toThrow('CONVERSATION_NOT_FOUND');
	});

	it('keeps a citation snapshot when the file was deleted before persistence', async () => {
		state.liveFiles = [];
		await runConversationTurn(
			'conversation-1',
			'openai/test',
			'What is the retention period?',
			() => {},
			'user-1',
			'user-message-1',
			'turn-deleted-file',
			false,
			['project_knowledge_search']
		);
		const persistedSources = state.inserts.filter((entry) => entry.table === schema.sources);
		expect(persistedSources).toHaveLength(2);
		expect(persistedSources.every(({ values }) => values.fileId === null)).toBe(true);
	});
});
