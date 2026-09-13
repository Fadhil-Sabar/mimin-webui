export type ScopeFilter = 'all' | 'personal' | 'project';

export type Skill = {
	id: string;
	name: string;
	description: string;
	instructions: string;
	projectId: string | null;
	enabledTools: string[];
	triggerPhrases: string[];
	createdAt: string;
	updatedAt: string;
};

export type Project = { id: string; name: string };

export type Tool = {
	name: string;
	label: string;
	description: string;
	category: string;
	enabled: boolean;
	projectOnly?: boolean;
	readOnly?: boolean;
	settingHint?: string;
	settingHref?: string;
};

export type SkillDraft = {
	name: string;
	description: string;
	instructions: string;
	projectId: string | null;
	enabledTools: string[];
	triggerPhrases: string[];
};
