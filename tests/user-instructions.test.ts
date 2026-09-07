import { describe, expect, it } from 'vitest';
import { buildProjectSystemPrompt } from '../src/lib/server/ai/project-context';
import { buildUserSystemPrompt } from '../src/lib/server/ai/user-instructions.service';

describe('user instructions prompt context', () => {
	it('adds trimmed user preferences without replacing the base prompt', () => {
		const prompt = buildUserSystemPrompt('base behavior', '  Use short paragraphs.  ');
		expect(prompt).toContain('base behavior');
		expect(prompt).toContain('<user-instructions>\nUse short paragraphs.\n</user-instructions>');
	});

	it('leaves the prompt unchanged when instructions are empty', () => {
		expect(buildUserSystemPrompt('base behavior', '')).toBe('base behavior');
		expect(buildUserSystemPrompt('base behavior', null)).toBe('base behavior');
	});

	it('places project instructions after global user preferences', () => {
		const withUser = buildUserSystemPrompt('base', 'Use concise answers.');
		const prompt = buildProjectSystemPrompt(withUser, 'Use this project glossary.');
		expect(prompt.indexOf('<user-instructions>')).toBeLessThan(
			prompt.indexOf('<project-instructions>')
		);
	});
});
