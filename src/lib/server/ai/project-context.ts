export const PROJECT_KNOWLEDGE_TOOL = 'project_knowledge_search';

/**
 * Project conversations always have access to their project's knowledge tool.
 * Keep this normalization at the API boundary so older clients cannot create
 * a project chat that silently lacks project context.
 */
export function getProjectConversationTools(
	projectId: string | null | undefined,
	enabledTools: string[] = ['web_search']
) {
	const tools = [...new Set(enabledTools)].filter(
		(tool) => projectId || tool !== PROJECT_KNOWLEDGE_TOOL
	);
	if (projectId && !tools.includes(PROJECT_KNOWLEDGE_TOOL)) tools.push(PROJECT_KNOWLEDGE_TOOL);
	return tools;
}

/** Project instructions are configuration; file/search results remain untrusted data. */
export function buildProjectSystemPrompt(basePrompt: string, instructions?: string | null) {
	const value = instructions?.trim();
	if (!value) return basePrompt;
	return `${basePrompt}\n\nProject instructions (follow these project-level instructions):\n<project-instructions>\n${value}\n</project-instructions>`;
}
