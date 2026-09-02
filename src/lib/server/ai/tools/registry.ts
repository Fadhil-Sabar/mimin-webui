export interface AppTool { name: string; label: string; description: string; category: string; enabled: boolean; projectOnly?: boolean; }

const tools: AppTool[] = [
	{ name: 'web_search', label: 'Web Search', description: 'Search public web sources.', category: 'research', enabled: true },
	{ name: 'web_fetch', label: 'Web Fetch', description: 'Fetch readable content from a URL.', category: 'research', enabled: true },
	{ name: 'project_knowledge_search', label: 'Project Knowledge', description: 'Search files attached to the active project.', category: 'project', enabled: true, projectOnly: true },
	{ name: 'code_execution', label: 'Code Execution', description: 'Run isolated code tasks.', category: 'workspace', enabled: false }
];
export function listTools(projectId?: string) { return tools.filter((tool) => !tool.projectOnly || Boolean(projectId)); }
export function getTool(name: string, projectId?: string) { return listTools(projectId).find((tool) => tool.name === name); }
