import { describe, expect, it } from 'vitest';
import { buildSkillSystemPrompt } from '../src/lib/server/ai/agent.service';
import {
	getConversationSkillSnapshot,
	getConversationSkillSummary,
	getTurnSkillSnapshot,
	skillActivationFields,
	skillSnapshotToSummary
} from '../src/lib/server/skill-runtime';

const snapshot = {
	id: 'skill-1',
	projectId: null,
	name: 'Release writer',
	description: 'Writes release notes',
	instructions: 'Use a concise changelog format.',
	enabledTools: ['web_search'],
	triggerPhrases: ['write release notes']
};

describe('skill runtime snapshots', () => {
	it('captures activation as a complete immutable snapshot', () => {
		const fields = skillActivationFields({ ...snapshot, userId: 'user-1' });
		expect(fields).toEqual({ activeSkillId: 'skill-1', activeSkillSnapshot: snapshot });
		expect(getConversationSkillSnapshot({ ...fields, projectId: null })).toEqual(snapshot);
		expect(getConversationSkillSummary({ ...fields, projectId: null })).toMatchObject({
			id: 'skill-1',
			name: 'Release writer',
			description: 'Writes release notes',
			enabledTools: ['web_search']
		});
	});

	it('keeps a snapshot usable after its foreign key is cleared', () => {
		const conversation = {
			activeSkillId: null,
			activeSkillSnapshot: snapshot,
			projectId: 'project-1'
		};
		expect(getConversationSkillSnapshot(conversation)).toEqual(snapshot);
		expect(getConversationSkillSummary(conversation)?.id).toBe('skill-1');
	});

	it('keeps an explicit no-skill turn from inheriting a later active skill', () => {
		const conversation = { activeSkillId: 'skill-1', activeSkillSnapshot: snapshot };
		expect(getTurnSkillSnapshot({ skillSnapshot: null }, conversation)).toBeNull();
		expect(getTurnSkillSnapshot({}, conversation)).toEqual(snapshot);
	});

	it('clears a skill without changing the conversation tools', () => {
		expect(skillActivationFields(null)).toEqual({
			activeSkillId: null,
			activeSkillSnapshot: null
		});
	});

	it('composes skill instructions after project instructions', () => {
		const prompt = buildSkillSystemPrompt('base\n\nproject', snapshot);
		expect(prompt.indexOf('base')).toBeLessThan(prompt.indexOf('project'));
		expect(prompt.indexOf('project')).toBeLessThan(prompt.indexOf('Turn skill instructions'));
		expect(prompt).toContain(
			'<skill-instructions>\nUse a concise changelog format.\n</skill-instructions>'
		);
		expect(prompt).toContain(
			'subordinate to the base agent policy, user instructions, project instructions'
		);
		expect(prompt).toContain('runtime routing/tool availability');
	});

	it('does not expose instructions when making a public summary', () => {
		const summary = skillSnapshotToSummary(snapshot);
		expect(summary).not.toHaveProperty('instructions');
	});
});
