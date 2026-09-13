import type { ModelOption, ThinkingLevel } from '$lib/components/ModelPicker.svelte';
import type { ToolOption } from '$lib/components/ToolPicker.svelte';
import { SvelteSet } from 'svelte/reactivity';
import {
	isSkillSuggestionDismissed,
	matchSkillSuggestion,
	type Skill,
	type SkillSummary
} from '$lib/skills';
import {
	conversationsState,
	resolveInitialModel,
	setLastUsedModel
} from '$lib/client/conversations.svelte';
import { BROWSER_BRIDGE_TOOLS, BROWSER_BRIDGE_TOOL_FALLBACKS, modelRef } from './chat-format';
import type { Conversation } from './chat-types';

export type ChatSettingsDeps = {
	/** Show a transient toast. */
	notify: (value: string) => void;
	getActiveId: () => string;
	getActiveConversation: () => Conversation | null;
	setActiveConversation: (conversation: Conversation) => void;
	getConversations: () => Conversation[];
	setConversations: (update: (conversation: Conversation) => Conversation) => void;
	getConversationLoading: () => boolean;
	setConversationLoading: (value: boolean) => void;
	getConversationLoadToken: () => number;
	bumpConversationLoadToken: () => void;
	getConversationNavigationToken: () => number;
	/** The current composer draft, used to suggest a skill. */
	getDraft: () => string;
	/** Whether the browser extension bridge is connected. */
	getBrowserBridgeEnabled: () => boolean;
};

/**
 * Conversation-scoped preferences: model, thinking level, active skill and
 * enabled tools. Each of them is persisted through the conversations API, so
 * the whole group shares the same optimistic-update and token-guard shape.
 * Exactly one instance exists per page load.
 */
export function createChatSettings(deps: ChatSettingsDeps) {
	let models = $state<ModelOption[]>([]);
	let modelsLoading = $state(true);
	let modelLoadError = $state('');
	let modelSaving = $state(false);
	let thinkingSaving = $state(false);
	let thinkingLevelsByModel = $state<Record<string, ThinkingLevel>>({});
	let availableTools = $state<ToolOption[]>([]);
	let toolsLoading = $state(true);
	let skills = $state<Skill[]>([]);
	let skillsLoading = $state(false);
	let skillSaving = $state(false);
	let toolsSaving = $state(false);
	let suggestionDismissed = $state(false);
	let suggestion = $state<SkillSummary | null>(null);
	let skillsLoadToken = 0;
	let toolsLoadToken = 0;

	const eligibleSkills = $derived(
		skills.filter(
			(skill) => !skill.projectId || skill.projectId === deps.getActiveConversation()?.projectId
		)
	);

	$effect(() => {
		const draft = deps.getDraft();
		const candidates = eligibleSkills;
		const projectId = deps.getActiveConversation()?.projectId ?? null;
		const selectedId = deps.getActiveConversation()?.activeSkill?.id ?? null;
		suggestionDismissed = isSkillSuggestionDismissed(draft, suggestionDismissed);
		const dismissed = suggestionDismissed;
		suggestion = null;
		const timer = setTimeout(() => {
			if (!dismissed) suggestion = matchSkillSuggestion(draft, candidates, projectId, selectedId);
		}, 250);
		return () => clearTimeout(timer);
	});

	async function loadSkills() {
		const token = ++skillsLoadToken;
		skillsLoading = true;
		try {
			const response = await fetch('/api/skills');
			if (!response.ok) throw new Error('Could not load skills');
			const result = await response.json();
			if (token === skillsLoadToken) skills = result.skills ?? [];
		} catch (error) {
			if (token === skillsLoadToken)
				deps.notify(error instanceof Error ? error.message : 'Could not load skills');
		} finally {
			if (token === skillsLoadToken) skillsLoading = false;
		}
	}

	async function selectSkill(skillId: string | null) {
		const activeId = deps.getActiveId();
		if (!activeId || deps.getConversationLoading() || skillSaving || toolsSaving || modelSaving)
			return;
		const id = activeId;
		const navigationToken = deps.getConversationNavigationToken();
		skillSaving = true;
		try {
			const response = await fetch(`/api/conversations/${id}`, {
				method: 'PATCH',
				headers: { 'content-type': 'application/json' },
				body: JSON.stringify({ skillId })
			});
			const result = await response.json();
			if (!response.ok) throw new Error(result.error?.message ?? 'Could not select skill');
			deps.setConversations((conversation) =>
				conversation.id === id ? result.conversation : conversation
			);
			conversationsState.addOrUpdate(result.conversation);
			if (deps.getActiveId() === id && navigationToken === deps.getConversationNavigationToken()) {
				deps.bumpConversationLoadToken();
				deps.setConversationLoading(false);
				deps.setActiveConversation(result.conversation);
				deps.notify('Applies to future replies.');
			}
		} catch (error) {
			if (deps.getActiveId() === id)
				deps.notify(error instanceof Error ? error.message : 'Could not select skill');
		} finally {
			skillSaving = false;
		}
	}

	async function toggleSkill(skillId: string, enabled: boolean) {
		await selectSkill(enabled ? skillId : null);
	}

	const displayTools = $derived.by(() => {
		const browserBridgeEnabled = deps.getBrowserBridgeEnabled();
		const tools = availableTools.map((tool) =>
			BROWSER_BRIDGE_TOOLS.has(tool.name)
				? {
						...tool,
						enabled: browserBridgeEnabled,
						readOnly: true,
						settingHref: '/settings/browser-extension'
					}
				: tool
		);
		for (const fallback of BROWSER_BRIDGE_TOOL_FALLBACKS) {
			if (tools.some((tool) => tool.name === fallback.name)) continue;
			tools.push({
				...fallback,
				enabled: browserBridgeEnabled,
				settingHint: 'Configure in Settings > Browser Extension',
				settingHref: '/settings/browser-extension'
			});
		}
		return tools;
	});

	const configuredModels = $derived(
		models.filter((model) => model.configured || model.userConfigured)
	);
	const pickerModels = $derived.by(() => {
		const current = deps.getActiveConversation()?.model;
		if (!current || configuredModels.some((model) => modelRef(model) === current))
			return configuredModels;
		const currentModel = models.find((model) => modelRef(model) === current);
		return currentModel ? [currentModel, ...configuredModels] : configuredModels;
	});
	const selectedModel = $derived(
		models.find((model) => modelRef(model) === deps.getActiveConversation()?.model)
	);
	const availableThinkingLevels = $derived<ThinkingLevel[]>(
		selectedModel?.capabilities?.thinkingLevels ?? ['off']
	);
	const selectedThinkingLevel = $derived.by(() => {
		const model = deps.getActiveConversation()?.model;
		const saved = model ? thinkingLevelsByModel[model] : undefined;
		return saved && availableThinkingLevels.includes(saved)
			? saved
			: (availableThinkingLevels[0] ?? 'off');
	});

	async function loadModels() {
		try {
			const response = await fetch('/api/models');
			if (!response.ok) throw new Error('Could not load models');
			const data = await response.json();
			models = Array.isArray(data.models) ? data.models : [];
			const errors = Array.isArray(data.errors) ? data.errors : [];
			modelLoadError = errors
				.map((error: { message?: string }) => error.message ?? '')
				.filter(Boolean)
				.join(' ');
			if (modelLoadError) deps.notify('Some live models could not be loaded. Check Providers.');
		} catch (error) {
			deps.notify(error instanceof Error ? error.message : 'Could not load models');
		} finally {
			modelsLoading = false;
		}
	}

	function defaultModel() {
		return resolveInitialModel(
			configuredModels,
			deps.getActiveConversation()?.model,
			deps.getConversations()
		);
	}

	async function loadTools(projectId?: string | null) {
		const requestToken = ++toolsLoadToken;
		toolsLoading = true;
		try {
			const url = projectId ? `/api/tools?projectId=${projectId}` : '/api/tools';
			const response = await fetch(url);
			if (response.ok && requestToken === toolsLoadToken) {
				const data = await response.json();
				if (requestToken !== toolsLoadToken) return;
				availableTools = data.tools ?? [];
			}
		} catch {
			/* ignore */
		} finally {
			if (requestToken === toolsLoadToken) toolsLoading = false;
		}
	}

	/** Forget tools of the conversation being left, and ignore its in-flight load. */
	function resetTools() {
		availableTools = [];
		toolsLoadToken += 1;
	}

	async function loadThinkingPreferences() {
		try {
			const response = await fetch('/api/preferences');
			if (!response.ok) return;
			const data = await response.json();
			if (data.thinkingLevels && typeof data.thinkingLevels === 'object')
				thinkingLevelsByModel = data.thinkingLevels as Record<string, ThinkingLevel>;
		} catch {
			/* ignore */
		}
	}

	async function selectModel(model: string) {
		const activeId = deps.getActiveId();
		if (
			!activeId ||
			skillSaving ||
			toolsSaving ||
			modelSaving ||
			model === deps.getActiveConversation()?.model
		)
			return;
		const id = activeId;
		const loadToken = deps.getConversationLoadToken();
		modelSaving = true;
		try {
			const response = await fetch(`/api/conversations/${id}`, {
				method: 'PATCH',
				headers: { 'content-type': 'application/json' },
				body: JSON.stringify({ model })
			});
			if (!response.ok)
				throw new Error(
					(await response.json().catch(() => null))?.error?.message ?? 'Could not select model'
				);
			const data = await response.json();
			if (deps.getActiveId() === id && loadToken === deps.getConversationLoadToken())
				deps.setActiveConversation(data.conversation);
			deps.setConversations((conversation) =>
				conversation.id === id ? data.conversation : conversation
			);
			setLastUsedModel(model);
			deps.notify('Model selected');
		} catch (error) {
			deps.notify(error instanceof Error ? error.message : 'Could not select model');
		} finally {
			modelSaving = false;
		}
	}

	async function selectThinkingLevel(level: string) {
		const model = deps.getActiveConversation()?.model;
		if (!deps.getActiveId() || !model || !availableThinkingLevels.includes(level as ThinkingLevel))
			return;
		const nextLevel = level as ThinkingLevel;
		const previousLevel = thinkingLevelsByModel[model];
		thinkingLevelsByModel = { ...thinkingLevelsByModel, [model]: nextLevel };
		thinkingSaving = true;
		try {
			const response = await fetch('/api/preferences', {
				method: 'PUT',
				headers: { 'content-type': 'application/json' },
				body: JSON.stringify({ model, thinkingLevel: nextLevel })
			});
			if (!response.ok)
				throw new Error(
					(await response.json().catch(() => null))?.error?.message ??
						'Could not save thinking level'
				);
			deps.notify('Thinking level saved');
		} catch (error) {
			if (previousLevel)
				thinkingLevelsByModel = { ...thinkingLevelsByModel, [model]: previousLevel };
			else {
				const restored = { ...thinkingLevelsByModel };
				delete restored[model];
				thinkingLevelsByModel = restored;
			}
			deps.notify(error instanceof Error ? error.message : 'Could not save thinking level');
		} finally {
			thinkingSaving = false;
		}
	}

	async function toggleTool(toolName: string, enable: boolean) {
		const activeId = deps.getActiveId();
		const activeConversation = deps.getActiveConversation();
		if (!activeId || !activeConversation || skillSaving || toolsSaving || modelSaving) return;
		const id = activeId;
		const loadToken = deps.getConversationLoadToken();
		const toolObj = displayTools.find((t) => t.name === toolName);
		if (toolObj?.readOnly) return;
		toolsSaving = true;
		const conversation = activeConversation;
		const current = conversation.enabledTools ?? [];
		const updated = enable
			? [...new SvelteSet([...current, toolName])]
			: current.filter((t) => t !== toolName);

		deps.setActiveConversation({ ...conversation, enabledTools: updated });
		deps.setConversations((item) => (item.id === id ? { ...item, enabledTools: updated } : item));

		try {
			const response = await fetch(`/api/conversations/${id}`, {
				method: 'PATCH',
				headers: { 'content-type': 'application/json' },
				body: JSON.stringify({ enabledTools: updated })
			});
			if (!response.ok) throw new Error('Could not update tools');
			const data = await response.json();
			if (data.conversation) {
				if (deps.getActiveId() === id && loadToken === deps.getConversationLoadToken())
					deps.setActiveConversation(data.conversation);
				deps.setConversations((item) => (item.id === id ? data.conversation : item));
			}
			const label = toolObj?.label ?? toolName;
			deps.notify(enable ? `${label} enabled` : `${label} disabled`);
		} catch (error) {
			deps.notify(error instanceof Error ? error.message : 'Could not update tools');
			const currentConversation = deps.getActiveConversation();
			if (
				currentConversation &&
				deps.getActiveId() === id &&
				loadToken === deps.getConversationLoadToken()
			) {
				deps.setActiveConversation({ ...currentConversation, enabledTools: current });
			}
			deps.setConversations((item) => (item.id === id ? { ...item, enabledTools: current } : item));
		} finally {
			toolsSaving = false;
		}
	}

	function dismissSuggestion() {
		suggestionDismissed = true;
	}

	return {
		get models() {
			return models;
		},
		get modelsLoading() {
			return modelsLoading;
		},
		get modelLoadError() {
			return modelLoadError;
		},
		get modelSaving() {
			return modelSaving;
		},
		get thinkingSaving() {
			return thinkingSaving;
		},
		get configuredModels() {
			return configuredModels;
		},
		get pickerModels() {
			return pickerModels;
		},
		get availableThinkingLevels() {
			return availableThinkingLevels;
		},
		get selectedThinkingLevel() {
			return selectedThinkingLevel;
		},
		get skills() {
			return skills;
		},
		get skillsLoading() {
			return skillsLoading;
		},
		get skillSaving() {
			return skillSaving;
		},
		get eligibleSkills() {
			return eligibleSkills;
		},
		get suggestion() {
			return suggestion;
		},
		get suggestionDismissed() {
			return suggestionDismissed;
		},
		get availableTools() {
			return availableTools;
		},
		get toolsLoading() {
			return toolsLoading;
		},
		get toolsSaving() {
			return toolsSaving;
		},
		get displayTools() {
			return displayTools;
		},
		loadModels,
		loadThinkingPreferences,
		loadSkills,
		loadTools,
		resetTools,
		selectModel,
		selectThinkingLevel,
		selectSkill,
		toggleSkill,
		toggleTool,
		dismissSuggestion,
		defaultModel
	};
}
