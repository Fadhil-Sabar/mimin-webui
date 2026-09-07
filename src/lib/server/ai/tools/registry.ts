export interface AppTool {
	name: string;
	label: string;
	description: string;
	category: string;
	enabled: boolean;
	projectOnly?: boolean;
	readOnly?: boolean;
	settingHint?: string;
	settingHref?: string;
}

const tools: AppTool[] = [
	{
		name: 'web_search',
		label: 'Web Search',
		description: 'Search public web sources.',
		category: 'research',
		enabled: true
	},
	{
		name: 'web_fetch',
		label: 'Web Fetch',
		description: 'Fetch readable content from a URL.',
		category: 'research',
		enabled: true
	},
	{
		name: 'ask_question',
		label: 'Ask Question',
		description:
			'Ask clarifying questions or present options to the user when uncertain about requirements or decisions.',
		category: 'interaction',
		enabled: true
	},
	{
		name: 'browser_search',
		label: 'Browser Search',
		description: 'Search Google or Google Scholar via browser extension.',
		category: 'browser',
		enabled: false,
		readOnly: true,
		settingHint: 'Configure in Settings > Browser Extension',
		settingHref: '/settings/browser-extension'
	},
	{
		name: 'browser_open',
		label: 'Browser Open',
		description: 'Open and read a public webpage via browser extension.',
		category: 'browser',
		enabled: false,
		readOnly: true,
		settingHint: 'Configure in Settings > Browser Extension',
		settingHref: '/settings/browser-extension'
	},
	{
		name: 'project_knowledge_search',
		label: 'Project Knowledge',
		description: 'Search files attached to the active project.',
		category: 'project',
		enabled: true,
		projectOnly: true
	},
	{
		name: 'code_execution',
		label: 'Code Execution',
		description: 'Run isolated code tasks.',
		category: 'workspace',
		enabled: false
	}
];
export function listTools(projectId?: string) {
	return tools.filter((tool) => !tool.projectOnly || Boolean(projectId));
}
export function getTool(name: string, projectId?: string) {
	return listTools(projectId).find((tool) => tool.name === name);
}
