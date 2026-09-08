import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createCreateSkillTool } from '../src/lib/server/ai/tools/skill.tool';

type MockSkill = {
	id: string;
	userId: string;
	projectId: string | null;
	name: string;
	description: string;
	instructions: string;
	enabledTools: string[];
	triggerPhrases: string[];
	createdAt: Date;
	updatedAt: Date;
};

type MockSkillInput = Omit<MockSkill, 'id' | 'createdAt' | 'updatedAt'>;

const state = vi.hoisted(() => ({
	skills: [] as MockSkill[],
	inserted: [] as MockSkill[],
	ownedProject: true
}));

vi.mock('../src/lib/server/db/client', () => ({
	getDb: () => ({
		insert: () => ({
			values: (val: MockSkillInput) => ({
				returning: async () => {
					const item: MockSkill = {
						...val,
						id: 'skill-new-id',
						createdAt: new Date(),
						updatedAt: new Date()
					};
					state.inserted.push(item);
					state.skills.push(item);
					return [item];
				}
			})
		}),
		select: () => ({
			from: () => ({
				where: () => ({
					orderBy: async () => state.skills
				})
			})
		})
	}),
	schema: {
		skills: {
			id: 'skills.id',
			userId: 'skills.userId',
			projectId: 'skills.projectId',
			name: 'skills.name',
			description: 'skills.description',
			instructions: 'skills.instructions',
			enabledTools: 'skills.enabledTools',
			triggerPhrases: 'skills.triggerPhrases',
			updatedAt: 'skills.updatedAt'
		}
	}
}));

vi.mock('../src/lib/server/api', () => ({
	getOwnedProject: async (id: string, userId: string) =>
		state.ownedProject ? { id, userId, name: 'Test Project' } : null
}));

type SkillTool = ReturnType<typeof createCreateSkillTool>;
type SkillToolResult = Awaited<ReturnType<SkillTool['execute']>>;
type TestSkillToolResult = SkillToolResult & { isError?: boolean };

function textFrom(result: SkillToolResult) {
	const block = result.content[0];
	if (block.type !== 'text') throw new Error('Expected text tool content');
	return block.text;
}

describe('create_skill tool', () => {
	beforeEach(() => {
		state.skills = [];
		state.inserted = [];
		state.ownedProject = true;
	});

	const context = {
		userId: 'user-1',
		conversationProjectId: null
	};

	it('creates a personal skill successfully', async () => {
		const tool = createCreateSkillTool(context);
		const result = await tool.execute(
			'call-1',
			{
				name: 'Python Expert',
				description: 'Writes idiomatic Python with type hints',
				instructions: 'You are a Python expert. Always use type hints and docstrings.',
				enabledTools: ['web_search'],
				triggerPhrases: ['write python', 'python code']
			},
			undefined
		);

		expect(state.inserted.length).toBe(1);
		expect(state.inserted[0]).toMatchObject({
			userId: 'user-1',
			projectId: null,
			name: 'Python Expert',
			description: 'Writes idiomatic Python with type hints',
			instructions: 'You are a Python expert. Always use type hints and docstrings.',
			enabledTools: ['web_search'],
			triggerPhrases: ['write python', 'python code']
		});
		expect(textFrom(result)).toContain('Skill "Python Expert" created successfully!');
		expect(result.details).toMatchObject({ skill: { name: 'Python Expert' } });
	});

	it('rejects empty name or empty instructions', async () => {
		const tool = createCreateSkillTool(context);
		const resultNoName = (await tool.execute(
			'call-2',
			{
				name: '  ',
				instructions: 'Some instructions'
			},
			undefined
		)) as TestSkillToolResult;
		expect(resultNoName.isError).toBe(true);
		expect(textFrom(resultNoName)).toContain('name cannot be empty');

		const resultNoInstructions = (await tool.execute(
			'call-3',
			{
				name: 'Valid Name',
				instructions: '  '
			},
			undefined
		)) as TestSkillToolResult;
		expect(resultNoInstructions.isError).toBe(true);
		expect(textFrom(resultNoInstructions)).toContain('instructions cannot be empty');
	});

	it('validates project ownership when projectId is provided', async () => {
		state.ownedProject = false;
		const tool = createCreateSkillTool(context);
		const result = (await tool.execute(
			'call-4',
			{
				name: 'Project Skill',
				instructions: 'Do project things',
				projectId: '00000000-0000-4000-8000-000000000001'
			},
			undefined
		)) as TestSkillToolResult;
		expect(result.isError).toBe(true);
		expect(textFrom(result)).toContain('does not exist or is not accessible');
	});

	it('rejects unavailable tools for personal scope', async () => {
		const tool = createCreateSkillTool(context);
		const result = (await tool.execute(
			'call-5',
			{
				name: 'Skill with Project Tool',
				instructions: 'Some instructions',
				enabledTools: ['project_knowledge_search'] // projectOnly tool in personal scope
			},
			undefined
		)) as TestSkillToolResult;
		expect(result.isError).toBe(true);
		expect(textFrom(result)).toContain('One or more selected tools are unavailable');
	});

	it('deduplicates trigger phrases with normalized comparison', async () => {
		const tool = createCreateSkillTool(context);
		await tool.execute(
			'call-6',
			{
				name: 'Trigger Test',
				instructions: 'Testing triggers',
				triggerPhrases: ['hello world', 'HELLO   WORLD', 'second trigger']
			},
			undefined
		);
		expect(state.inserted[0].triggerPhrases).toEqual(['hello world', 'second trigger']);
	});
});
