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
		description: 'Read a specific public URL and return its readable text.',
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
		name: 'browser_tabs',
		label: 'Browser Tabs',
		description: "List the user's open browser tabs via browser extension.",
		category: 'browser',
		enabled: false,
		readOnly: true,
		settingHint: 'Configure in Settings > Browser Extension',
		settingHref: '/settings/browser-extension'
	},
	{
		name: 'browser_read_tab',
		label: 'Browser Read Tab',
		description: "Read one of the user's open browser tabs via browser extension.",
		category: 'browser',
		enabled: false,
		readOnly: true,
		settingHint: 'Configure in Settings > Browser Extension',
		settingHref: '/settings/browser-extension'
	},
	{
		name: 'browser_interact',
		label: 'Browser Interact',
		description: "Click, type, and navigate inside the user's open browser tabs.",
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
		name: 'create_skill',
		label: 'Create Skill',
		description: 'Create a reusable skill with custom instructions, tools, and triggers.',
		category: 'workspace',
		enabled: true
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
