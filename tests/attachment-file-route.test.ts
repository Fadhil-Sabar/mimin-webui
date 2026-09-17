import { beforeEach, describe, expect, it, vi } from 'vitest';

const state = vi.hoisted(() => ({
	user: { id: 'user-1' } as { id: string } | null,
	owned: true,
	attachments: [] as Array<Record<string, unknown>>,
	readCount: 0
}));

const schema = vi.hoisted(() => ({
	messageAttachments: { id: 'attachment-id', messageId: 'message-id' },
	messages: { id: 'message-id', conversationId: 'conversation-id' }
}));

vi.mock('$lib/server/api', () => ({
	requireUser: vi.fn(async () => state.user),
	getOwnedConversation: vi.fn(async () => (state.owned ? { id: 'conversation-1' } : undefined)),
	apiError: (code: string, message: string, status = 400) =>
		new Response(JSON.stringify({ error: { code, message } }), {
			status,
			headers: { 'content-type': 'application/json' }
		}),
	handleApiError: (error: unknown) => {
		throw error;
	}
}));

vi.mock('$lib/server/db/client', () => ({
	getDb: () => ({
		select: () => {
			let result: Array<Record<string, unknown>> = [];
			const query = {
				from(table: unknown) {
					result = table === schema.messageAttachments ? state.attachments : [];
					return query;
				},
				innerJoin() {
					return query;
				},
				where() {
					return query;
				},
				then(
					resolve: (value: Array<Record<string, unknown>>) => unknown,
					reject?: (e: unknown) => unknown
				) {
					return Promise.resolve(result).then(resolve, reject);
				}
			};
			return query;
		}
	}),
	schema
}));

vi.mock('$lib/server/files/storage', () => ({
	resolveStoragePath: vi.fn(() => '/tmp/attachment'),
	readStoredFile: vi.fn(async () => {
		state.readCount += 1;
		return Buffer.from([0x89, 0x50, 0x4e, 0x47]);
	})
}));

const { GET } =
	await import('../src/routes/api/conversations/[id]/attachments/[attachmentId]/+server');

function event(
	user = state.user,
	url = 'http://localhost/api/conversations/conversation-1/attachments/attachment-1'
) {
	return {
		locals: { user },
		params: { id: 'conversation-1', attachmentId: 'attachment-1' },
		url: new URL(url),
		request: new Request(
			'http://localhost/api/conversations/conversation-1/attachments/attachment-1'
		)
	} as never;
}

beforeEach(() => {
	state.user = { id: 'user-1' };
	state.owned = true;
	state.attachments = [
		{
			filename: 'diagram.png',
			mimeType: 'image/png',
			storageKey: 'conversation-1/attachment-1.png'
		}
	];
	state.readCount = 0;
});

describe('conversation attachment file route', () => {
	it('rejects unauthenticated requests before reading storage', async () => {
		state.user = null;
		const response = await GET(event(null));

		expect(response.status).toBe(401);
		expect(state.readCount).toBe(0);
	});

	it('hides attachments of a conversation the caller does not own', async () => {
		state.owned = false;
		const response = await GET(event());

		expect(response.status).toBe(404);
		expect(state.readCount).toBe(0);
	});

	it('returns not found without reading storage when the attachment is missing', async () => {
		state.attachments = [];
		const response = await GET(event());

		expect(response.status).toBe(404);
		expect(state.readCount).toBe(0);
	});

	it('serves an owned image inline so the bubble can render it', async () => {
		const response = await GET(event());

		expect(response.status).toBe(200);
		expect(response.headers.get('content-type')).toBe('image/png');
		expect(response.headers.get('content-disposition')).toContain('inline');
		expect(response.headers.get('content-disposition')).toContain('diagram.png');
		expect(response.headers.get('x-content-type-options')).toBe('nosniff');
		expect(new Uint8Array(await response.arrayBuffer())).toEqual(
			new Uint8Array([0x89, 0x50, 0x4e, 0x47])
		);
		expect(state.readCount).toBe(1);
	});

	it('serves the same bytes as a download when asked to', async () => {
		const response = await GET(
			event(
				state.user,
				'http://localhost/api/conversations/conversation-1/attachments/attachment-1?download=1'
			)
		);

		expect(response.status).toBe(200);
		expect(response.headers.get('content-disposition')).toContain('attachment');
		expect(response.headers.get('content-disposition')).toContain('diagram.png');
	});
});
