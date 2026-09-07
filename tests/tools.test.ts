import { describe, expect, it } from 'vitest';
import { getTool, listTools } from '../src/lib/server/ai/tools/registry';

describe('tool registry', () => {
	it('hides project knowledge outside project conversations', () => {
		expect(listTools().some((tool) => tool.name === 'project_knowledge_search')).toBe(false);
		expect(getTool('project_knowledge_search', 'project-id')?.projectOnly).toBe(true);
	});
	it('exposes web tools with normalized metadata', () => {
		expect(getTool('web_fetch')?.label).toBe('Web Fetch');
	});

	it('does not expose the unimplemented files tool', () => {
		expect(getTool('files')).toBeUndefined();
	});

	it('exposes browser_search tool as read-only with settings reference', () => {
		const tool = getTool('browser_search');
		expect(tool).toBeDefined();
		expect(tool?.label).toBe('Browser Search');
		expect(tool?.readOnly).toBe(true);
		expect(tool?.settingHref).toBe('/settings/browser-extension');
	});

	it('exposes browser_open tool as read-only with settings reference', () => {
		const tool = getTool('browser_open');
		expect(tool).toBeDefined();
		expect(tool?.label).toBe('Browser Open');
		expect(tool?.readOnly).toBe(true);
		expect(tool?.settingHref).toBe('/settings/browser-extension');
	});

	it('exposes ask_question tool in registry', () => {
		const tool = getTool('ask_question');
		expect(tool).toBeDefined();
		expect(tool?.label).toBe('Ask Question');
		expect(tool?.category).toBe('interaction');
		expect(tool?.enabled).toBe(true);
	});
});
