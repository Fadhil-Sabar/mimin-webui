import { describe, expect, it } from 'vitest';
import { AGENT_SYSTEM_PROMPT } from '../src/lib/server/ai/agent.service';

describe('agent tool-use policy', () => {
	it('allows iterative tool use until the answer is sufficiently grounded', () => {
		expect(AGENT_SYSTEM_PROMPT).toMatch(/repeatedly|again/i);
		expect(AGENT_SYSTEM_PROMPT).toMatch(/sufficient|enough/i);
	});

	it('requires project knowledge lookup for project-specific questions', () => {
		expect(AGENT_SYSTEM_PROMPT).toMatch(
			/when project_knowledge_search is available, use it before answering questions about the active project/i
		);
	});
});
