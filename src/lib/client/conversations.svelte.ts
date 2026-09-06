export type ConversationSummary = {
	id: string;
	title: string;
	model?: string;
	projectId: string | null;
	projectName?: string | null;
	createdAt?: string;
	updatedAt?: string;
};

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
	}

	addOrUpdate(conversation: ConversationSummary) {
		const idx = this.items.findIndex((c) => c.id === conversation.id);
		if (idx >= 0) {
			this.items[idx] = { ...this.items[idx], ...conversation };
		} else {
			this.items.unshift(conversation);
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
