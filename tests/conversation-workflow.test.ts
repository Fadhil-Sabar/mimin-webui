import { beforeEach, describe, expect, it, vi } from 'vitest';

const state = vi.hoisted(() => ({
	format: 'markdown',
	user: { id: 'user-1' } as { id: string } | null,
	conversation: {
		id: 'conv-1',
		userId: 'user-1',
		projectId: null,
		activeSkillId: null,
		activeSkillSnapshot: null,
		title: 'Workflow test',
		model: 'openai/gpt-4o-mini',
		enabledTools: ['web_search'],
		historyRevision: 3,
		createdAt: new Date('2026-01-01T00:00:00Z'),
		updatedAt: new Date('2026-01-01T00:00:00Z'),
		projectName: null
	},
	messages: [
		{
			id: 'msg-1',
			conversationId: 'conv-1',
			role: 'user',
			content: 'Keep this visible',
			turnState: 'complete',
			skillSnapshot: null,
			createdAt: new Date('2026-01-01T00:00:01Z')
		},
		{
			id: 'msg-old',
			conversationId: 'conv-1',
			role: 'assistant',
			content: 'Old answer',
			turnState: 'superseded',
			skillSnapshot: null,
			createdAt: new Date('2026-01-01T00:00:02Z')
		}
	],
	attachments: [
		{
			id: 'attachment-1',
			messageId: 'msg-1',
			filename: 'notes.txt',
			mimeType: 'text/plain',
			sizeBytes: 5,
			extractionStatus: 'complete',
			pageCount: null,
			extractionError: null
		}
	]
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

vi.mock('$lib/server/db/client', () => {
	const schema = {
		messages: {
			id: 'messages.id',
			conversationId: 'messages.conversationId',
			turnState: 'messages.turnState',
			createdAt: 'messages.createdAt'
		},
		messageAttachments: {
			id: 'messageAttachments.id',
			messageId: 'messageAttachments.messageId',
			filename: 'messageAttachments.filename',
			mimeType: 'messageAttachments.mimeType',
			sizeBytes: 'messageAttachments.sizeBytes',
			extractionStatus: 'messageAttachments.extractionStatus',
			pageCount: 'messageAttachments.pageCount',
			extractionError: 'messageAttachments.extractionError'
		}
	};
	const db = {
		select: vi.fn(() => {
			let table: unknown;
			const chain: Record<string, unknown> = {};
			for (const method of ['from', 'where', 'orderBy']) {
				chain[method] = vi.fn((value?: unknown) => {
					if (method === 'from') table = value;
					return chain;
				});
			}
			chain.then = (resolve: (value: unknown) => unknown, reject?: (reason: unknown) => unknown) =>
				Promise.resolve(
					table === schema.messages
						? state.messages.filter((message) => message.turnState !== 'superseded')
						: state.attachments
				).then(resolve, reject);
			return chain;
		})
	};
	return { getDb: () => db, schema };
});

const { GET } = await import('../src/routes/api/conversations/[id]/export/+server');

function event(format: string) {
	return {
		params: { id: 'conv-1' },
		url: new URL(`http://localhost/api/conversations/conv-1/export?format=${format}`),
		request: new Request('http://localhost/api/conversations/conv-1/export')
	} as never;
}

beforeEach(() => {
	state.user = { id: 'user-1' };
});

describe('conversation exports', () => {
	it('exports only visible messages and attachment metadata as JSON', async () => {
		const response = await GET(event('json'));
		expect(response.status).toBe(200);
		const body = await response.json();
		expect(body.messages).toHaveLength(1);
		expect(body.messages[0].content).toBe('Keep this visible');
		expect(body.messages[0].attachments[0].filename).toBe('notes.txt');
		expect(response.headers.get('content-disposition')).toContain('Workflow-test.json');
	});

	it('renders a markdown export with role headings and attachment names', async () => {
		const response = await GET(event('markdown'));
		const body = await response.text();
		expect(body).toContain('## User');
		expect(body).toContain('notes.txt');
	});

	it('requires authentication', async () => {
		state.user = null;
		const response = await GET(event('json'));
		expect(response.status).toBe(401);
	});
});
