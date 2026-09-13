import { beforeEach, describe, expect, it, vi } from 'vitest';

const state = vi.hoisted(() => ({
	user: { id: 'user-1' } as { id: string } | null,
	ownedProjectIds: new Set(['project-1'])
}));

vi.mock('../src/lib/server/api', async () => {
	const { json } = await import('@sveltejs/kit');
	return {
		apiError: (code: string, message: string, status = 400) =>
			json({ error: { code, message } }, { status }),
		requireUser: vi.fn(async () => state.user),
		getOwnedProject: vi.fn(async (projectId: string, userId: string) =>
			state.ownedProjectIds.has(projectId) && userId === 'user-1'
				? { id: projectId, name: 'Project', userId }
				: undefined
		),
		handleApiError: (error: unknown) => {
			throw error;
		}
	};
});

const route = await import('../src/routes/api/tools/+server');

function event(search = '') {
	return {
		locals: { user: state.user },
		url: new URL(`http://localhost/api/tools${search}`)
	} as never;
}

async function toolNames(search = '') {
	const response = await route.GET(event(search));
	expect(response.status).toBe(200);
	const payload = await response.json();
	return (payload.tools as { name: string }[]).map((tool) => tool.name);
}

beforeEach(() => {
	state.user = { id: 'user-1' };
	state.ownedProjectIds = new Set(['project-1']);
	vi.clearAllMocks();
});

describe('tools API', () => {
	it('rejects an anonymous request', async () => {
		state.user = null;
		const response = await route.GET(event());
		expect(response.status).toBe(401);
		expect(await response.json()).toEqual({
			error: { code: 'UNAUTHORIZED', message: 'Authentication required.' }
		});
	});

	it('lists non-project tools by default', async () => {
		expect(await toolNames()).toContain('web_fetch');
		expect(await toolNames()).not.toContain('project_knowledge_search');
	});

	it('includes project tools only when asked for them', async () => {
		expect(await toolNames('?includeProjectTools=true')).toContain('project_knowledge_search');
		expect(await toolNames('?includeProjectTools=false')).not.toContain('project_knowledge_search');
	});

	it('returns project tools for a project the user owns', async () => {
		expect(await toolNames('?projectId=project-1')).toContain('project_knowledge_search');
	});

	it('refuses a project the user does not own', async () => {
		const response = await route.GET(event('?projectId=project-2'));
		expect(response.status).toBe(404);
		expect(await response.json()).toEqual({
			error: { code: 'PROJECT_NOT_FOUND', message: 'Project not found.' }
		});
	});
});
