export type ConversationSummary = {
	id: string;
	title: string;
	model?: string;
	projectId: string | null;
	projectName?: string | null;
	createdAt?: string;
	updatedAt?: string;
	snippet?: string | null;
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
