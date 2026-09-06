<script lang="ts">
	import { tick } from 'svelte';
	import {
		conversationSearch,
		conversationsState,
		type ConversationSummary
	} from '$lib/client/conversations.svelte';
	import { searchConversations } from '$lib/client/api';
	import { sidebar } from '$lib/client/sidebar.svelte';
	import { CornerDownLeft, FolderKanban, Loader2, MessageSquare, Search, X } from '@lucide/svelte';

	let inputEl: HTMLInputElement | undefined = $state();
	let resultsContainerEl: HTMLDivElement | undefined = $state();
	let query = $state('');
	let searching = $state(false);
	let selectedIndex = $state(0);
	let remoteResults = $state<ConversationSummary[] | null>(null);
	let searchTimeout: ReturnType<typeof setTimeout> | undefined;
	let abortController: AbortController | undefined;

	let localFiltered = $derived.by(() => {
		const q = query.trim().toLowerCase();
		if (!q) return conversationsState.items;
		return conversationsState.items.filter(
			(item) =>
				item.title.toLowerCase().includes(q) ||
				(item.projectName && item.projectName.toLowerCase().includes(q))
		);
	});

	let displayResults = $derived.by(() => {
		if (!query.trim()) return conversationsState.items;
		if (remoteResults !== null) return remoteResults;
		return localFiltered;
	});

	$effect(() => {
		if (conversationSearch.isOpen) {
			query = conversationSearch.query || '';
			remoteResults = null;
			selectedIndex = 0;
			void conversationsState.load();
			void tick().then(() => {
				inputEl?.focus();
				inputEl?.select();
			});
		} else {
			if (searchTimeout) clearTimeout(searchTimeout);
			abortController?.abort();
			searching = false;
			remoteResults = null;
		}
	});

	$effect(() => {
		const q = query.trim();
		if (!conversationSearch.isOpen) return;
		selectedIndex = 0;

		if (searchTimeout) clearTimeout(searchTimeout);
		abortController?.abort();

		if (!q) {
			remoteResults = null;
			searching = false;
			return;
		}

		searching = true;
		const controller = new AbortController();
		abortController = controller;

		searchTimeout = setTimeout(async () => {
			try {
				const res = await searchConversations(q, null, controller.signal);
				if (!controller.signal.aborted) {
					remoteResults = res;
					searching = false;
				}
			} catch {
				if (!controller.signal.aborted) {
					searching = false;
				}
			}
		}, 180);
	});

	function handleKeydown(event: KeyboardEvent) {
		if (!conversationSearch.isOpen) return;

		if (event.key === 'Escape') {
			event.preventDefault();
			conversationSearch.close();
			return;
		}

		const total = displayResults.length;
		if (total === 0) return;

		if (event.key === 'ArrowDown') {
			event.preventDefault();
			selectedIndex = (selectedIndex + 1) % total;
			scrollToSelected();
		} else if (event.key === 'ArrowUp') {
			event.preventDefault();
			selectedIndex = (selectedIndex - 1 + total) % total;
			scrollToSelected();
		} else if (event.key === 'Enter') {
			event.preventDefault();
			const target = displayResults[selectedIndex];
			if (target) {
				selectItem(target.id);
			}
		}
	}

	function scrollToSelected() {
		void tick().then(() => {
			if (!resultsContainerEl) return;
			const selectedEl = resultsContainerEl.querySelector<HTMLElement>(
				'.search-result-item.selected'
			);
			if (selectedEl) {
				selectedEl.scrollIntoView({ block: 'nearest' });
			}
		});
	}

	function selectItem(id: string) {
		sidebar.closeMobile();
		void conversationSearch.handleSelect(id);
	}

	function tokenizeMatch(text: string, q: string): { text: string; matched: boolean }[] {
		if (!q.trim() || !text) return [{ text, matched: false }];
		const escaped = q.trim().replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
		const regex = new RegExp(`(${escaped})`, 'gi');
		const parts = text.split(regex);
		return parts.map((part) => ({
			text: part,
			matched: part.toLowerCase() === q.trim().toLowerCase()
		}));
	}

	function formatRelativeTime(dateStr?: string): string {
		if (!dateStr) return '';
		const date = new Date(dateStr);
		if (isNaN(date.getTime())) return '';
		const now = new Date();
		const diffSec = Math.floor((now.getTime() - date.getTime()) / 1000);
		if (diffSec < 60) return 'Just now';
		const diffMin = Math.floor(diffSec / 60);
		if (diffMin < 60) return `${diffMin}m ago`;
		const diffHour = Math.floor(diffMin / 60);
		if (diffHour < 24) return `${diffHour}h ago`;
		const diffDay = Math.floor(diffHour / 24);
		if (diffDay === 1) return 'Yesterday';
		if (diffDay < 7) return `${diffDay}d ago`;
		return date.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
	}
</script>

<svelte:window onkeydown={handleKeydown} />

{#if conversationSearch.isOpen}
	<div
		class="modal-backdrop conversation-search-backdrop"
		role="dialog"
		aria-modal="true"
		aria-label="Search conversations"
		tabindex="-1"
		onclick={(e) => {
			if (e.target === e.currentTarget) conversationSearch.close();
		}}
		onkeydown={(e) => {
			if (e.key === 'Escape') conversationSearch.close();
		}}
	>
		<div class="search-modal-card" role="document">
			<div class="search-input-wrapper">
				<Search size={18} class="search-lead-icon" aria-hidden="true" />
				<input
					bind:this={inputEl}
					bind:value={query}
					type="text"
					class="search-input"
					placeholder="Search conversations by title or message..."
					aria-label="Search conversations"
					autocomplete="off"
					spellcheck="false"
				/>
				{#if searching}
					<Loader2 size={16} class="search-spinner animate-spin" aria-hidden="true" />
				{/if}
				{#if query}
					<button
						type="button"
						class="icon-button clear-btn"
						title="Clear query"
						aria-label="Clear query"
						onclick={() => {
							query = '';
							inputEl?.focus();
						}}
					>
						<X size={14} />
					</button>
				{/if}
				<button
					type="button"
					class="icon-button close-btn"
					title="Close dialog (Esc)"
					aria-label="Close dialog"
					onclick={() => conversationSearch.close()}
				>
					<X size={16} />
				</button>
			</div>

			<div class="search-results-list" bind:this={resultsContainerEl} role="listbox">
				{#if displayResults.length > 0}
					<div class="results-header">
						<span>{query.trim() ? 'Search results' : 'Recent conversations'}</span>
						<span class="results-count">{displayResults.length}</span>
					</div>
					{#each displayResults as item, index (item.id)}
						<button
							type="button"
							class="search-result-item"
							class:selected={index === selectedIndex}
							role="option"
							aria-selected={index === selectedIndex}
							onmouseenter={() => (selectedIndex = index)}
							onclick={() => selectItem(item.id)}
						>
							<div class="result-icon-col">
								<MessageSquare size={16} class="chat-icon" />
							</div>
							<div class="result-body">
								<div class="result-top-line">
									<span class="result-title">
										{#each tokenizeMatch(item.title, query) as token, tokenIndex (tokenIndex)}
											{#if token.matched}
												<mark class="search-highlight">{token.text}</mark>
											{:else}
												{token.text}
											{/if}
										{/each}
									</span>
									{#if item.projectName}
										<span class="project-pill" title="Project: {item.projectName}">
											<FolderKanban size={11} />
											<span>{item.projectName}</span>
										</span>
									{/if}
								</div>
								{#if item.snippet}
									<p class="result-snippet">
										{#each tokenizeMatch(item.snippet, query) as token, tokenIndex (tokenIndex)}
											{#if token.matched}
												<mark class="search-highlight">{token.text}</mark>
											{:else}
												{token.text}
											{/if}
										{/each}
									</p>
								{/if}
							</div>
							<div class="result-meta-col">
								{#if item.updatedAt}
									<span class="result-time">{formatRelativeTime(item.updatedAt)}</span>
								{/if}
								{#if index === selectedIndex}
									<span class="select-badge" aria-hidden="true">
										<CornerDownLeft size={11} />
									</span>
								{/if}
							</div>
						</button>
					{/each}
				{:else if searching}
					<div class="search-empty-state">
						<Loader2 size={20} class="animate-spin" />
						<p>Searching conversation history...</p>
					</div>
				{:else if query.trim()}
					<div class="search-empty-state">
						<Search size={22} class="empty-icon" />
						<p class="empty-heading">No conversations found</p>
						<p class="empty-sub">No conversations or messages matched “{query.trim()}”.</p>
					</div>
				{:else}
					<div class="search-empty-state">
						<MessageSquare size={22} class="empty-icon" />
						<p class="empty-heading">No conversations yet</p>
						<p class="empty-sub">Start a new chat to begin your first conversation.</p>
					</div>
				{/if}
			</div>

			<div class="search-footer">
				<div class="footer-shortcuts">
					<span class="shortcut-tag"><kbd>↑</kbd><kbd>↓</kbd> navigate</span>
					<span class="shortcut-tag"><kbd>↵</kbd> open</span>
					<span class="shortcut-tag"><kbd>esc</kbd> close</span>
				</div>
			</div>
		</div>
	</div>
{/if}

<style>
	.conversation-search-backdrop {
		align-items: flex-start;
		padding-top: min(10vh, 80px);
		z-index: 100;
	}

	.search-modal-card {
		width: min(620px, 94vw);
		max-height: 80vh;
		background: var(--surface);
		border: 1px solid var(--border-strong);
		border-radius: 12px;
		box-shadow: 0 24px 60px var(--shadow);
		display: flex;
		flex-direction: column;
		overflow: hidden;
		animation: modalFadeIn 0.15s ease-out;
	}

	@keyframes modalFadeIn {
		from {
			opacity: 0;
			transform: scale(0.98) translateY(-6px);
		}
		to {
			opacity: 1;
			transform: scale(1) translateY(0);
		}
	}

	.search-input-wrapper {
		display: flex;
		align-items: center;
		gap: 10px;
		padding: 14px 16px;
		border-bottom: 1px solid var(--border);
		position: relative;
	}

	:global(.search-lead-icon) {
		color: var(--text-muted);
		flex-shrink: 0;
	}

	.search-input {
		flex: 1;
		min-width: 0;
		border: 0;
		outline: 0;
		background: transparent;
		color: var(--text-strong);
		font-family: var(--font-body);
		font-size: var(--text-base);
		line-height: 1.4;
	}

	.search-input::placeholder {
		color: var(--text-faint);
	}

	:global(.search-spinner) {
		color: var(--text-muted);
		flex-shrink: 0;
	}

	:global(.animate-spin) {
		animation: spin 1s linear infinite;
	}

	@keyframes spin {
		from {
			transform: rotate(0deg);
		}
		to {
			transform: rotate(360deg);
		}
	}

	.clear-btn,
	.close-btn {
		width: 28px;
		height: 28px;
		border-radius: 6px;
		display: inline-flex;
		align-items: center;
		justify-content: center;
		color: var(--text-muted);
		background: transparent;
		border: 0;
		cursor: pointer;
		transition:
			background-color 0.15s ease,
			color 0.15s ease;
	}

	.clear-btn:hover,
	.close-btn:hover {
		background: var(--surface-subtle);
		color: var(--text-strong);
	}

	.search-results-list {
		flex: 1;
		overflow-y: auto;
		padding: 8px;
		max-height: 480px;
	}

	.results-header {
		display: flex;
		align-items: center;
		justify-content: space-between;
		padding: 6px 10px 8px;
		font-size: var(--text-xs);
		font-weight: 600;
		letter-spacing: 0.04em;
		text-transform: uppercase;
		color: var(--text-faint);
	}

	.results-count {
		font-variant-numeric: tabular-nums;
		opacity: 0.8;
	}

	.search-result-item {
		width: 100%;
		display: flex;
		align-items: flex-start;
		gap: 12px;
		padding: 10px 12px;
		background: transparent;
		border: 0;
		border-radius: 8px;
		cursor: pointer;
		text-align: left;
		color: var(--text-body);
		font-family: var(--font-body);
		transition: background-color 0.12s ease;
	}

	.search-result-item:hover,
	.search-result-item.selected {
		background: var(--surface-hover);
	}

	.search-result-item.selected {
		outline: 1px solid var(--border-strong);
	}

	.result-icon-col {
		padding-top: 2px;
		flex-shrink: 0;
		color: var(--text-muted);
	}

	.search-result-item.selected .result-icon-col {
		color: var(--accent-bg);
	}

	.result-body {
		flex: 1;
		min-width: 0;
	}

	.result-top-line {
		display: flex;
		align-items: center;
		gap: 8px;
		flex-wrap: wrap;
	}

	.result-title {
		font-weight: 500;
		font-size: var(--text-sm);
		color: var(--text-strong);
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
	}

	.project-pill {
		display: inline-flex;
		align-items: center;
		gap: 4px;
		padding: 2px 6px;
		border-radius: 4px;
		background: var(--surface-subtle);
		border: 1px solid var(--border);
		font-size: 11px;
		color: var(--text-muted);
	}

	.result-snippet {
		margin: 4px 0 0;
		font-size: var(--text-xs);
		color: var(--text-muted);
		line-height: 1.45;
		display: -webkit-box;
		line-clamp: 2;
		-webkit-line-clamp: 2;
		-webkit-box-orient: vertical;
		overflow: hidden;
		word-break: break-word;
	}

	.search-highlight {
		background: color-mix(in srgb, var(--accent-bg) 25%, transparent);
		color: var(--text-strong);
		font-weight: 600;
		border-radius: 2px;
		padding: 0 2px;
	}

	.result-meta-col {
		display: flex;
		flex-direction: column;
		align-items: flex-end;
		gap: 6px;
		flex-shrink: 0;
		padding-top: 2px;
	}

	.result-time {
		font-size: 11px;
		color: var(--text-faint);
		font-variant-numeric: tabular-nums;
		white-space: nowrap;
	}

	.select-badge {
		display: inline-flex;
		align-items: center;
		justify-content: center;
		width: 18px;
		height: 18px;
		border-radius: 4px;
		background: var(--surface-subtle);
		border: 1px solid var(--border);
		color: var(--text-muted);
	}

	.search-empty-state {
		display: flex;
		flex-direction: column;
		align-items: center;
		justify-content: center;
		padding: 40px 20px;
		text-align: center;
		color: var(--text-muted);
	}

	:global(.empty-icon) {
		color: var(--text-faint);
		margin-bottom: 12px;
	}

	.empty-heading {
		margin: 0 0 4px;
		font-size: var(--text-sm);
		font-weight: 500;
		color: var(--text-strong);
	}

	.empty-sub {
		margin: 0;
		font-size: var(--text-xs);
		color: var(--text-faint);
		max-width: 320px;
	}

	.search-footer {
		display: flex;
		align-items: center;
		justify-content: flex-end;
		padding: 8px 14px;
		border-top: 1px solid var(--border);
		background: var(--surface-subtle);
	}

	.footer-shortcuts {
		display: flex;
		align-items: center;
		gap: 12px;
	}

	.shortcut-tag {
		display: inline-flex;
		align-items: center;
		gap: 4px;
		font-size: 11px;
		color: var(--text-faint);
	}

	.shortcut-tag kbd {
		display: inline-block;
		padding: 1px 4px;
		border-radius: 3px;
		background: var(--surface);
		border: 1px solid var(--border);
		font-family: var(--font-mono, monospace);
		font-size: 10px;
		color: var(--text-muted);
	}

	@media (max-width: 600px) {
		.conversation-search-backdrop {
			padding: 12px;
		}
		.search-modal-card {
			width: 100%;
			max-height: 90vh;
		}
		.footer-shortcuts {
			display: none;
		}
	}
</style>
