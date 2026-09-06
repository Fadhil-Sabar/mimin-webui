import { describe, expect, it, vi, beforeEach } from 'vitest';

const testState = vi.hoisted(() => ({
	user: { id: 'user-1' } as { id: string } | null,
	ownedProject: {
		id: '11111111-1111-4111-8111-111111111111',
		name: 'project a',
		userId: 'user-1'
	} as { id: string; name: string; userId: string } | null,
	conversations: [
		{
			id: 'conv-1',
			userId: 'user-1',
			projectId: '11111111-1111-4111-8111-111111111111',
			title: 'chat in project',
			model: 'openai/gpt-4o-mini',
			enabledTools: ['web_search'],
			createdAt: new Date(),
			updatedAt: new Date(),
			projectName: 'project a'
		},
		{
			id: 'conv-2',
			userId: 'user-1',
			projectId: null,
			title: 'standalone chat',
			model: 'openai/gpt-4o-mini',
			enabledTools: ['web_search'],
			createdAt: new Date(),
			updatedAt: new Date(),
			projectName: null
		}
	]
}));

vi.mock('$lib/server/api', () => ({
	requireUser: vi.fn(async () => testState.user),
	getOwnedProject: vi.fn(async () => testState.ownedProject),
	getOwnedConversation: vi.fn(async (id: string) => {
		const found = testState.conversations.find((c) => c.id === id);
		return found ?? null;
	}),
	apiError: (code: string, message: string, status = 400) =>
		new Response(JSON.stringify({ error: { code, message } }), {
			status,
			headers: { 'content-type': 'application/json' }
		}),
	handleApiError: (error: unknown) =>
		new Response(JSON.stringify({ error: { code: 'INTERNAL_ERROR', message: String(error) } }), {
			status: 500,
			headers: { 'content-type': 'application/json' }
		})
}));

vi.mock('$lib/server/ai/model.service', () => ({
	isModelAvailable: vi.fn(async () => true),
	listAvailableModels: vi.fn(async () => [{ provider: 'openai', id: 'gpt-4o-mini' }])
}));

vi.mock('$lib/server/ai/project-context', () => ({
	getProjectConversationTools: vi.fn((_p, tools) => tools ?? ['web_search'])
}));

vi.mock('$lib/server/db/client', () => {
	const mockDb = {
		select: vi.fn(() => ({
			from: vi.fn(() => ({
				leftJoin: vi.fn(() => ({
					where: vi.fn(() => ({
						orderBy: vi.fn(async () => testState.conversations)
					}))
				}))
			}))
		})),
		insert: vi.fn(() => ({
			values: vi.fn((vals) => ({
				returning: vi.fn(async () => [{ id: 'new-conv', ...vals }])
			}))
		})),
		update: vi.fn(() => ({
			set: vi.fn(() => ({
				where: vi.fn(() => ({
					returning: vi.fn(async () => [{ id: 'conv-1', title: 'new title' }])
				}))
			}))
		}))
	};
	return {
		getDb: () => mockDb,
		schema: {
			conversations: {
				id: 'id',
				userId: 'user_id',
				projectId: 'project_id',
				title: 'title',
				model: 'model',
				enabledTools: 'enabled_tools',
				createdAt: 'created_at',
				updatedAt: 'updated_at'
			},
			projects: {
				id: 'id',
				name: 'name',
				userId: 'user_id'
			}
		}
	};
});

import type { RequestEvent } from '@sveltejs/kit';
import { GET, POST } from '../src/routes/api/conversations/+server';

describe('conversations API endpoints', () => {
	beforeEach(() => {
		testState.user = { id: 'user-1' };
	});

	it('GET /api/conversations includes projectName for project conversations', async () => {
		const event = {
			url: new URL('http://localhost/api/conversations')
		} as unknown as RequestEvent;

		const response = await GET(event);
		expect(response.status).toBe(200);
		const body = await response.json();
		expect(body.conversations).toHaveLength(2);
		expect(body.conversations[0]).toMatchObject({
			id: 'conv-1',
			projectName: 'project a'
		});
		expect(body.conversations[1]).toMatchObject({
			id: 'conv-2',
			projectName: null
		});
	});

	it('POST /api/conversations attaches projectName when creating a project conversation', async () => {
		const event = {
			request: new Request('http://localhost/api/conversations', {
				method: 'POST',
				headers: { 'content-type': 'application/json' },
				body: JSON.stringify({
					title: 'New chat in project',
					projectId: '11111111-1111-4111-8111-111111111111'
				})
			})
		} as unknown as RequestEvent;

		const response = await POST(event);
		expect(response.status).toBe(201);
		const body = await response.json();
		expect(body.conversation).toMatchObject({
			title: 'New chat in project',
			projectId: '11111111-1111-4111-8111-111111111111',
			projectName: 'project a'
		});
	});
});
