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
		description:
			'Read a specific public URL and return its readable text. Pages that only JavaScript can fill in are read through the browser extension when it is connected.',
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
		name: 'inspect_canvas',
		label: 'Inspect Canvas',
		description: 'Inspect style guidelines and scenes in the current visual Canvas workspace.',
		category: 'canvas',
		enabled: true
	},
	{
		name: 'create_scene',
		label: 'Create Scene',
		description: 'Create a new mockup scene/screen in the Canvas.',
		category: 'canvas',
		enabled: true
	},
	{
		name: 'edit_scene',
		label: 'Edit Scene',
		description: 'Update the HTML/CSS/JS or viewport of an existing Canvas scene.',
		category: 'canvas',
		enabled: true
	},
	{
		name: 'delete_scene',
		label: 'Delete Scene',
		description: 'Delete a scene from the Canvas.',
		category: 'canvas',
		enabled: true
	},
	{
		name: 'create_connection',
		label: 'Create Connection',
		description: 'Create a directed navigation flow between two Canvas scenes.',
		category: 'canvas',
		enabled: true
	},
	{
		name: 'delete_connection',
		label: 'Delete Connection',
		description: 'Delete a directed navigation flow from the Canvas.',
		category: 'canvas',
		enabled: true
	},
	{
		name: 'update_style_guideline',
		label: 'Update Style Guideline',
		description: 'Update design tokens, rules, avoidances, or direction for the Canvas.',
		category: 'canvas',
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
export type ToolListOptions = {
	/** Include project-only tools for a caller that is not scoped to one project. */
	includeProjectTools?: boolean;
};

export function listTools(projectId?: string, options: ToolListOptions = {}) {
	const includeProjectTools = Boolean(projectId) || options.includeProjectTools === true;
	return tools.filter((tool) => !tool.projectOnly || includeProjectTools);
}
export function getTool(name: string, projectId?: string) {
	return listTools(projectId).find((tool) => tool.name === name);
}
