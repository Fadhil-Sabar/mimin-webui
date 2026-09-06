import { describe, expect, it } from 'vitest';
import { extractMessageText, extractSnippet } from '../src/lib/server/conversations';

describe('extractMessageText', () => {
	it('handles plain string content', () => {
		expect(extractMessageText('Hello world')).toBe('Hello world');
	});

	it('handles array of text parts and ignores thinking parts', () => {
		const content = [
			{ type: 'thinking', thinking: 'Internal reasoning here' },
			{ type: 'text', text: 'Final answer to the user.' }
		];
		expect(extractMessageText(content)).toBe('Final answer to the user.');
	});

	it('handles array of strings and mixed objects', () => {
		const content = ['Part 1', { text: 'Part 2' }];
		expect(extractMessageText(content)).toBe('Part 1 Part 2');
	});

	it('handles content object with text or content property', () => {
		expect(extractMessageText({ text: 'Object text' })).toBe('Object text');
		expect(extractMessageText({ content: 'Object content' })).toBe('Object content');
	});

	it('handles null, undefined, and non-text types', () => {
		expect(extractMessageText(null)).toBe('');
		expect(extractMessageText(undefined)).toBe('');
		expect(extractMessageText(12345)).toBe('');
	});
});

describe('extractSnippet', () => {
	it('returns snippet around the matched query with ellipsis', () => {
		const text =
			'In this tutorial, we will learn how to configure PostgreSQL connection pooling using PgBouncer for optimal performance.';
		const snippet = extractSnippet(text, 'PostgreSQL', 50);
		expect(snippet).toContain('PostgreSQL');
		expect(snippet.startsWith('…') || snippet.endsWith('…')).toBe(true);
	});

	it('handles match at the very beginning without leading ellipsis', () => {
		const text = 'PostgreSQL is an advanced open-source relational database management system.';
		const snippet = extractSnippet(text, 'PostgreSQL', 30);
		expect(snippet.startsWith('PostgreSQL')).toBe(true);
		expect(snippet.endsWith('…')).toBe(true);
	});

	it('handles match at the very end without trailing ellipsis', () => {
		const text = 'The database we recommend using for this system is PostgreSQL';
		const snippet = extractSnippet(text, 'PostgreSQL', 30);
		expect(snippet.endsWith('PostgreSQL')).toBe(true);
		expect(snippet.startsWith('…')).toBe(true);
	});

	it('performs case-insensitive matching', () => {
		const text = 'Deploying applications with Docker containers.';
		const snippet = extractSnippet(text, 'docker', 40);
		expect(snippet.toLowerCase()).toContain('docker');
	});

	it('returns full text without ellipsis if shorter than maxLength', () => {
		const text = 'Short message';
		expect(extractSnippet(text, 'Short', 50)).toBe('Short message');
	});

	it('handles empty query and empty text', () => {
		expect(extractSnippet('', 'test')).toBe('');
		expect(extractSnippet('Some text', '')).toBe('Some text');
	});
});
