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
});
