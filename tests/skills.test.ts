import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import {
	isSkillSuggestionDismissed,
	matchSkillSuggestion,
	type SkillSummary
} from '../src/lib/skills';
import {
	skillInput,
	SKILL_MAX_TRIGGER_PHRASES,
	SKILL_NAME_MAX_LENGTH,
	SKILL_INSTRUCTIONS_MAX_LENGTH
} from '../src/lib/server/validation';
import { validateSkillTools } from '../src/lib/server/skills';

const personal = (overrides: Partial<SkillSummary> = {}): SkillSummary => ({
	id: 'skill-personal',
	projectId: null,
	name: 'Personal helper',
	description: 'A helper',
	enabledTools: ['web_search'],
	triggerPhrases: ['write a summary'],
	...overrides
});

describe('skill validation', () => {
	it('retains snapshots through the migration foreign-key actions', () => {
		const migration = readFileSync(
			new URL('../drizzle/0011_rapid_blade.sql', import.meta.url),
			'utf8'
		);
		expect(migration).toContain('"skills_project_id_projects_id_fk"');
		expect(migration).toContain('"conversations_active_skill_id_skills_id_fk"');
		expect(migration).toContain('ON DELETE cascade');
		expect(migration).toContain('ON DELETE set null');
		expect(migration).toContain('"active_skill_snapshot" jsonb');
		expect(migration).toContain('"skill_snapshot" jsonb');
	});

	it('trims fields and rejects duplicate normalized triggers', () => {
		const result = skillInput.safeParse({
			name: '  Summarize  ',
			description: '  Summarize clearly. ',
			instructions: '  Use short paragraphs. ',
			triggerPhrases: ['Write   a summary', ' write a  SUMMARY ']
		});
		expect(result.success).toBe(false);
		const valid = skillInput.parse({
			name: '  Summarize  ',
			description: '  Summarize clearly. ',
			instructions: '  Use short paragraphs. ',
			triggerPhrases: ['Write   a summary']
		});
		expect(valid).toMatchObject({
			name: 'Summarize',
			description: 'Summarize clearly.',
			instructions: 'Use short paragraphs.'
		});
	});

	it('enforces skill field bounds and trigger count', () => {
		expect(
			skillInput.safeParse({ name: 'x'.repeat(SKILL_NAME_MAX_LENGTH), instructions: 'x' }).success
		).toBe(true);
		expect(
			skillInput.safeParse({ name: 'x'.repeat(SKILL_NAME_MAX_LENGTH + 1), instructions: 'x' })
				.success
		).toBe(false);
		expect(
			skillInput.safeParse({
				name: 'x',
				instructions: 'x'.repeat(SKILL_INSTRUCTIONS_MAX_LENGTH + 1)
			}).success
		).toBe(false);
		expect(
			skillInput.safeParse({
				name: 'x',
				instructions: 'x',
				triggerPhrases: Array.from(
					{ length: SKILL_MAX_TRIGGER_PHRASES + 1 },
					(_, i) => `phrase ${i}`
				)
			}).success
		).toBe(false);
	});

	it('allows only registry tools valid for the skill scope', () => {
		expect(validateSkillTools(['web_search', 'web_search'], null)).toEqual(['web_search']);
		expect(validateSkillTools(['project_knowledge_search'], null)).toBeNull();
		expect(validateSkillTools(['project_knowledge_search'], 'project-1')).toEqual([
			'project_knowledge_search'
		]);
		expect(validateSkillTools(['browser_search'], null)).toBeNull();
		expect(validateSkillTools(['code_execution'], null)).toEqual(['code_execution']);
		expect(validateSkillTools(['made_up_tool'], null)).toBeNull();
	});
});

describe('skill suggestions', () => {
	it('requires a sufficiently long draft and matches whitespace-insensitively', () => {
		const skill = personal();
		expect(matchSkillSuggestion('write a', [skill], null, null)).toBeNull();
		expect(
			matchSkillSuggestion('Please WRITE   A summary for this report', [skill], null, null)
		).toBe(skill);
	});

	it('prefers the longest trigger, then a matching project skill, then alpha order', () => {
		const short = personal({ id: 'a', name: 'Zulu', triggerPhrases: ['write'] });
		const long = personal({ id: 'b', name: 'Alpha', triggerPhrases: ['write a summary'] });
		const project = personal({
			id: 'c',
			name: 'Project',
			projectId: 'project-1',
			triggerPhrases: ['write a summary']
		});
		expect(
			matchSkillSuggestion('Please write a summary now', [short, long, project], 'project-1', null)
		).toBe(project);
		const alpha = personal({ id: 'd', name: 'Alpha', triggerPhrases: ['write'] });
		expect(matchSkillSuggestion('Please write this', [short, alpha], null, null)).toBe(alpha);
	});

	it('ignores project skills from another project and the active skill', () => {
		const active = personal({ id: 'active', triggerPhrases: ['write this'] });
		const otherProject = personal({
			id: 'other',
			projectId: 'project-2',
			triggerPhrases: ['write this']
		});
		expect(
			matchSkillSuggestion('Please write this now', [active, otherProject], 'project-1', 'active')
		).toBeNull();
	});

	it('keeps dismissal scoped to a non-empty draft', () => {
		expect(isSkillSuggestionDismissed('still drafting', true)).toBe(true);
		expect(isSkillSuggestionDismissed('', true)).toBe(false);
		expect(isSkillSuggestionDismissed('still drafting', false)).toBe(false);
	});
});
