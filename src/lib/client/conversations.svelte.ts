import type { SkillSummary } from '$lib/skills';

export type ConversationSummary = {
	activeSkill?: SkillSummary | null;
	id: string;
	title: string;
	model?: string;
	projectId: string | null;
	projectName?: string | null;
	createdAt?: string;
	updatedAt?: string;
	snippet?: string | null;
};

export const LAST_USED_MODEL_STORAGE_KEY = 'mimin_last_used_model';

export function getLastUsedModel(): string | null {
	if (typeof window === 'undefined') return null;
	try {
		return localStorage.getItem(LAST_USED_MODEL_STORAGE_KEY);
	} catch {
		return null;
	}
}

export function setLastUsedModel(model: string | null | undefined) {
	if (typeof window === 'undefined' || !model) return;
	try {
		localStorage.setItem(LAST_USED_MODEL_STORAGE_KEY, model);
	} catch {
		/* ignore */
	}
}

export function resolveInitialModel(
	configuredModels: { provider: string; id: string }[],
	preferredCandidate?: string | null,
	fallbackConversations?: { model?: string }[]
): string | undefined {
	if (!configuredModels || configuredModels.length === 0) return undefined;

	const candidates = [
		preferredCandidate,
		getLastUsedModel(),
		fallbackConversations?.[0]?.model,
		conversationsState.items[0]?.model,
		'openai/gpt-4o-mini'
	].filter(Boolean) as string[];

	for (const candidate of candidates) {
		const matched = configuredModels.find((model) => `${model.provider}/${model.id}` === candidate);
		if (matched) return `${matched.provider}/${matched.id}`;
	}

	const fallback = configuredModels[0];
	return `${fallback.provider}/${fallback.id}`;
}

class ConversationsState {
	items = $state<ConversationSummary[]>([]);
	loading = $state(false);
	loaded = $state(false);

	async load(force = false) {
		if (this.loading) return;
		if (this.loaded && !force) return;
		this.loading = true;
		try {
			const res = await fetch('/api/conversations');
			if (res.ok) {
				const data = await res.json();
				this.items = data.conversations ?? [];
				this.loaded = true;
				if (!getLastUsedModel() && this.items[0]?.model) {
					setLastUsedModel(this.items[0].model);
				}
			}
		} catch (error) {
			console.error('Failed to load conversations:', error);
		} finally {
			this.loading = false;
		}
	}

	setItems(items: ConversationSummary[]) {
		this.items = items;
		this.loaded = true;
		if (!getLastUsedModel() && items[0]?.model) {
			setLastUsedModel(items[0].model);
		}
	}

	addOrUpdate(conversation: ConversationSummary) {
		const idx = this.items.findIndex((c) => c.id === conversation.id);
		if (idx >= 0) {
			this.items[idx] = { ...this.items[idx], ...conversation };
		} else {
			this.items.unshift(conversation);
		}
		if (conversation.model) {
			setLastUsedModel(conversation.model);
		}
	}

	remove(id: string) {
		this.items = this.items.filter((c) => c.id !== id);
	}

	updateTitle(id: string, title: string) {
		const item = this.items.find((c) => c.id === id);
		if (item) item.title = title;
	}
}

export const conversationsState = new ConversationsState();

class ConversationSearchState {
	isOpen = $state(false);
	query = $state('');
	private selectHandler: ((id: string) => void) | null = null;

	open(initialQuery = '') {
		this.query = initialQuery;
		this.isOpen = true;
	}

	close() {
		this.isOpen = false;
		this.query = '';
	}

	toggle() {
		if (this.isOpen) {
			this.close();
		} else {
			this.open();
		}
	}

	registerSelectHandler(handler: (id: string) => void) {
		this.selectHandler = handler;
	}

	unregisterSelectHandler() {
		this.selectHandler = null;
	}

	async handleSelect(id: string) {
		this.close();
		if (this.selectHandler) {
			this.selectHandler(id);
		} else {
			const { goto } = await import('$app/navigation');
			const { resolve } = await import('$app/paths');
			void goto(resolve(`/chat?id=${encodeURIComponent(id)}`));
		}
	}
}

export const conversationSearch = new ConversationSearchState();
