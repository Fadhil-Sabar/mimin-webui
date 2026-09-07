import { beforeEach, describe, expect, it, vi } from 'vitest';

const projectId = '00000000-0000-4000-8000-000000000001';
const skillId = '00000000-0000-4000-8000-000000000002';

const state = vi.hoisted(() => ({
	user: { id: 'user-1' } as { id: string } | null,
	ownedProject: true,
	skill: {
		id: '00000000-0000-4000-8000-000000000002',
		userId: 'user-1',
		projectId: null as string | null,
		name: 'Summarizer',
		description: 'Short summaries',
		instructions: 'Use short paragraphs.',
		enabledTools: ['web_search'],
		triggerPhrases: ['summarize this']
	},
	skills: [] as Array<{
		id: string;
		userId: string;
		projectId: string | null;
		name: string;
		description: string;
		instructions: string;
		enabledTools: string[];
		triggerPhrases: string[];
	}>,
	inserted: [] as Record<string, unknown>[],
	updated: [] as Record<string, unknown>[],
	whereClauses: [] as Array<{ table: unknown; text: string }>,
	insertCount: 0
}));

const schema = vi.hoisted(() => ({
	skills: {
		id: 'skills.id',
		userId: 'skills.userId',
		projectId: 'skills.projectId',
		updatedAt: 'skills.updatedAt'
	}
}));

vi.mock('../src/lib/server/db/client', () => {
	function flattenSql(value: unknown): string[] {
		if (typeof value === 'string' || typeof value === 'number') return [String(value)];
		if (Array.isArray(value)) return value.flatMap(flattenSql);
		if (!value || typeof value !== 'object') return [];
		const record = value as { queryChunks?: unknown[]; value?: unknown };
		if (record.queryChunks) return record.queryChunks.flatMap(flattenSql);
		if (record.value !== undefined) return flattenSql(record.value);
		return [];
	}

	function textForWhere(condition: unknown) {
		return flattenSql(condition).join(' ');
	}

	function hasOwnerPredicate(text: string) {
		return text.includes('skills.userId') && text.includes(state.user?.id ?? '');
	}

	function matchingRows(text: string) {
		if (!hasOwnerPredicate(text)) return [];
		if (text.includes('skills.id')) {
			return state.skills.filter(
				(skill) => skill.userId === state.user?.id && text.includes(skill.id)
			);
		}
		const projectMatch = text.match(/skills\.projectId\s*=\s*([^ ]+)/);
		return state.skills.filter(
			(skill) =>
				skill.userId === state.user?.id &&
				(!projectMatch || skill.projectId === null || text.includes(skill.projectId ?? ''))
		);
	}

	const db = {
		select: () => {
			let source: unknown;
			const query = {
				from(table: unknown) {
					source = table;
					return query;
				},
				where(condition: unknown) {
					const text = textForWhere(condition);
					state.whereClauses.push({ table: source, text });
					return query;
				},
				orderBy() {
					return query;
				},
				then(resolve: (value: unknown[]) => unknown, reject?: (error: unknown) => unknown) {
					const whereText = state.whereClauses.at(-1)?.text ?? '';
					return Promise.resolve(matchingRows(whereText)).then(resolve, reject);
				}
			};
			return query;
		},
		insert: () => ({
			values(values: Record<string, unknown>) {
				state.inserted.push(values);
				const id = state.insertCount++ === 0 ? skillId : '00000000-0000-4000-8000-000000000005';
				return { returning: async () => [{ ...values, id }] };
			}
		}),
		update: () => ({
			set(values: Record<string, unknown>) {
				state.updated.push(values);
				return {
					where: (condition: unknown) => {
						const text = textForWhere(condition);
						state.whereClauses.push({ table: schema.skills, text });
						return {
							returning: async () => matchingRows(text).map((skill) => ({ ...skill, ...values }))
						};
					}
				};
			}
		}),
		delete: () => ({
			where: (condition: unknown) => {
				const text = textForWhere(condition);
				state.whereClauses.push({ table: schema.skills, text });
				return { returning: async () => matchingRows(text).map((skill) => ({ id: skill.id })) };
			}
		})
	};
	return { getDb: vi.fn(() => db), schema };
});

vi.mock('../src/lib/server/api', () => ({
	apiError: (code: string, message: string, status = 400) =>
		new Response(JSON.stringify({ error: { code, message } }), {
			status,
			headers: { 'content-type': 'application/json' }
		}),
	requireUser: vi.fn(async () => state.user),
	getOwnedProject: vi.fn(async () => (state.ownedProject ? { id: projectId } : undefined)),
	handleApiError: (error: unknown) => {
		throw error;
	}
}));

const listRoute = await import('../src/routes/api/skills/+server');
const detailRoute = await import('../src/routes/api/skills/[id]/+server');

function event(request?: Request, params: Record<string, string> = {}) {
	return {
		locals: { user: state.user },
		params,
		request,
		url: new URL(request?.url ?? 'http://localhost/api/skills')
	} as never;
}

function request(body: unknown, method = 'POST') {
	return new Request('http://localhost/api/skills', {
		method,
		headers: { 'content-type': 'application/json' },
		body: JSON.stringify(body)
	});
}

function lastWhereText() {
	return state.whereClauses.at(-1)?.text ?? '';
}

beforeEach(() => {
	state.user = { id: 'user-1' };
	state.ownedProject = true;
	state.skills = [
		state.skill,
		{ ...state.skill, id: projectId, projectId, name: 'Project helper' },
		{
			...state.skill,
			id: '00000000-0000-4000-8000-000000000003',
			projectId: '00000000-0000-4000-8000-000000000004',
			name: 'Other project helper'
		}
	];
	state.inserted.length = 0;
	state.updated.length = 0;
	state.whereClauses.length = 0;
	state.insertCount = 0;
});

describe('Skills API routes', () => {
	it('requires authentication on every endpoint', async () => {
		state.user = null;
		expect((await listRoute.GET(event())).status).toBe(401);
		expect((await listRoute.POST(event(request({ name: 'x', instructions: 'x' })))).status).toBe(
			401
		);
		expect((await detailRoute.GET(event(undefined, { id: skillId }))).status).toBe(401);
		expect(
			(await detailRoute.PATCH(event(request({ name: 'x' }, 'PATCH'), { id: skillId }))).status
		).toBe(401);
		expect((await detailRoute.DELETE(event(undefined, { id: skillId }))).status).toBe(401);

		state.user = { id: 'user-1' };
		const response = await listRoute.POST(
			event(
				request({
					name: '  Summarize  ',
					description: '  Short summaries ',
					instructions: '  Use short paragraphs. ',
					enabledTools: ['web_search', 'web_search'],
					triggerPhrases: ['summarize this']
				})
			)
		);
		expect(response.status).toBe(201);
		expect(state.inserted[0]).toMatchObject({
			userId: 'user-1',
			projectId: null,
			name: 'Summarize',
			description: 'Short summaries',
			instructions: 'Use short paragraphs.',
			enabledTools: ['web_search']
		});
	});

	it('rejects invalid tools and unavailable project scopes', async () => {
		const invalidTool = await listRoute.POST(
			event(request({ name: 'x', instructions: 'x', enabledTools: ['missing_tool'] }))
		);
		expect(invalidTool.status).toBe(400);
		expect((await invalidTool.json()).error.code).toBe('INVALID_SKILL');

		state.ownedProject = false;
		const foreignProject = await listRoute.POST(
			event(request({ name: 'x', instructions: 'x', projectId }))
		);
		expect(foreignProject.status).toBe(400);
		expect((await foreignProject.json()).error.code).toBe('INVALID_SKILL');
	});

	it('lists personal skills with only the requested project skills', async () => {
		const response = await listRoute.GET(
			event(new Request(`http://localhost/api/skills?projectId=${projectId}`))
		);
		expect(response.status).toBe(200);
		expect((await response.json()).skills.map((skill: { id: string }) => skill.id)).toEqual([
			skillId,
			projectId
		]);
		expect(lastWhereText()).toContain('skills.userId');
		expect(lastWhereText()).toContain('user-1');
		expect(lastWhereText()).toContain('skills.projectId');
		expect(lastWhereText()).toContain(projectId);
	});

	it('creates independent rows when a skill is duplicated via POST', async () => {
		const payload = {
			name: 'Copy',
			description: 'Copied skill',
			instructions: 'Keep the same format.',
			enabledTools: ['web_search'],
			triggerPhrases: ['copy this']
		};
		const first = await listRoute.POST(event(request(payload)));
		const second = await listRoute.POST(event(request(payload)));
		expect(first.status).toBe(201);
		expect(second.status).toBe(201);
		expect((await first.json()).skill.id).not.toBe((await second.json()).skill.id);
		expect(state.inserted).toHaveLength(2);
	});

	it('updates without clearing omitted fields and deletes through the owned route', async () => {
		const update = await detailRoute.PATCH(
			event(request({ name: 'Renamed' }, 'PATCH'), { id: skillId })
		);
		expect(update.status).toBe(200);
		expect(lastWhereText()).toContain('skills.id');
		expect(lastWhereText()).toContain(skillId);
		expect(lastWhereText()).toContain('skills.userId');
		expect(lastWhereText()).toContain('user-1');
		expect(state.updated[0]).toMatchObject({
			name: 'Renamed',
			enabledTools: ['web_search'],
			projectId: null
		});
		expect(state.updated[0]).not.toHaveProperty('description');
		expect(state.updated[0]).not.toHaveProperty('instructions');
		expect(state.updated[0]).not.toHaveProperty('triggerPhrases');

		const deletion = await detailRoute.DELETE(event(undefined, { id: skillId }));
		expect(deletion.status).toBe(200);
		expect(await deletion.json()).toMatchObject({ deleted: true, skillId });
		expect(lastWhereText()).toContain('skills.id');
		expect(lastWhereText()).toContain(skillId);
		expect(lastWhereText()).toContain('skills.userId');
		expect(lastWhereText()).toContain('user-1');
	});

	it('does not allow updates into an inaccessible project scope', async () => {
		state.ownedProject = false;
		const response = await detailRoute.PATCH(
			event(request({ projectId }, 'PATCH'), { id: skillId })
		);
		expect(response.status).toBe(400);
		expect((await response.json()).error.code).toBe('INVALID_SKILL');
	});

	it('hides missing or foreign skills behind SKILL_NOT_FOUND', async () => {
		state.user = { id: 'other-user' };
		const response = await detailRoute.GET(event(undefined, { id: skillId }));
		expect(response.status).toBe(404);
		expect((await response.json()).error.code).toBe('SKILL_NOT_FOUND');
		expect(lastWhereText()).toContain('skills.id');
		expect(lastWhereText()).toContain(skillId);
		expect(lastWhereText()).toContain('skills.userId');
		expect(lastWhereText()).toContain('other-user');
		expect(
			(await detailRoute.PATCH(event(request({ name: 'nope' }, 'PATCH'), { id: skillId }))).status
		).toBe(404);
		expect((await detailRoute.DELETE(event(undefined, { id: skillId }))).status).toBe(404);
	});

	it('rejects malformed ids before they reach the database', async () => {
		const response = await detailRoute.GET(event(undefined, { id: 'not-a-uuid' }));
		expect(response.status).toBe(400);
		expect((await response.json()).error.code).toBe('INVALID_SKILL');
	});
});
