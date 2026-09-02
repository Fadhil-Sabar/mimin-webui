import { describe, expect, it } from 'vitest';
import {
	buildProjectSystemPrompt,
	getProjectConversationTools,
	PROJECT_KNOWLEDGE_TOOL
} from '../src/lib/server/ai/project-context';

describe('project conversation context', () => {
	it('enables project knowledge for project conversations without duplicates', () => {
		expect(getProjectConversationTools('project-id')).toEqual([
			'web_search',
			PROJECT_KNOWLEDGE_TOOL
		]);
		expect(getProjectConversationTools('project-id', [PROJECT_KNOWLEDGE_TOOL])).toEqual([
			PROJECT_KNOWLEDGE_TOOL
		]);
		expect(
			getProjectConversationTools('project-id', [
				'web_search',
				'web_search',
				PROJECT_KNOWLEDGE_TOOL,
				'web_search'
			])
		).toEqual(['web_search', PROJECT_KNOWLEDGE_TOOL]);
	});

	it('does not add project-only tools to ordinary conversations', () => {
		expect(
			getProjectConversationTools(null, ['web_search', 'web_search', PROJECT_KNOWLEDGE_TOOL])
		).toEqual(['web_search']);
		expect(getProjectConversationTools(undefined)).toEqual(['web_search']);
		expect(getProjectConversationTools('')).toEqual(['web_search']);
	});

	it('adds project instructions while preserving the base prompt', () => {
		const prompt = buildProjectSystemPrompt('base', '  Use the project glossary.  ');
		expect(prompt).toContain('base');
		expect(prompt).toContain(
			'<project-instructions>\nUse the project glossary.\n</project-instructions>'
		);
		expect(buildProjectSystemPrompt('base', '   ')).toBe('base');
		expect(buildProjectSystemPrompt('base', null)).toBe('base');
		expect(buildProjectSystemPrompt('base', '\n  Keep this exact wording.\n')).toContain(
			'Keep this exact wording.'
		);
	});
});
