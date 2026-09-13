<script lang="ts">
	import { resolve } from '$app/paths';
	import { MessageSquare, Plus } from '@lucide/svelte';
	import { formatDate } from './project-format';
	import type { Conversation, PageInfo } from './project-types';

	let {
		filteredConversations,
		loadedCount,
		query,
		pagination,
		loadingMore,
		onloadmore,
		onstartchat
	}: {
		filteredConversations: Conversation[];
		loadedCount: number;
		query: string;
		pagination: PageInfo;
		loadingMore: boolean;
		onloadmore: () => void;
		onstartchat: () => void;
	} = $props();
</script>

<section class="section-block conversations">
	<div class="section-heading">
		<div>
			<h2>Conversations</h2>
			<p>Continue work from previous project sessions.</p>
			{#if query.trim()}<small class="search-scope">Search filters loaded conversations only.</small
				>{/if}
		</div>
		<button class="button primary" onclick={onstartchat}><Plus size={15} /> New chat</button>
	</div>
	<div class="conversation-list">
		{#each filteredConversations as conversation (conversation.id)}
			<a class="conversation-row" href={resolve(`/chat?id=${encodeURIComponent(conversation.id)}`)}>
				<div class="conversation-icon"><MessageSquare size={16} /></div>
				<div class="conversation-name">
					<strong>{conversation.title}</strong><small>{conversation.model}</small>
				</div>
				<span class="muted">{formatDate(conversation.updatedAt)}</span>
			</a>
		{/each}
		{#if loadedCount === 0}<div class="empty-state conversation-empty">
				No conversations yet.
			</div>{/if}
		{#if loadedCount > 0 && filteredConversations.length === 0}<div
				class="empty-state conversation-empty"
			>
				No conversations match “{query}”.
			</div>{/if}
	</div>
	{#if pagination.hasMore}
		<button
			class="load-more"
			type="button"
			onclick={() => void onloadmore()}
			disabled={loadingMore}
			aria-busy={loadingMore}
		>
			{loadingMore
				? 'Loading conversations…'
				: `Load more conversations (${loadedCount} of ${pagination.total})`}
		</button>
	{/if}
</section>

<style>
	.section-block {
		padding-top: 32px;
	}
	.section-heading {
		display: flex;
		align-items: flex-end;
		justify-content: space-between;
		gap: 16px;
		margin-bottom: 12px;
	}
	.section-heading h2 {
		margin: 0;
		font-family: var(--font-body);
		font-size: var(--text-base);
		font-weight: 600;
		letter-spacing: -0.015em;
		color: var(--text-strong);
		line-height: 1.3;
	}
	.section-heading p {
		margin: 3px 0 0;
		color: var(--text-muted);
		font-size: var(--text-sm);
		line-height: 1.4;
	}
	.search-scope {
		display: block;
		margin-top: 4px;
		color: var(--text-dim);
		font-size: var(--text-xs);
	}
	.button {
		display: inline-flex;
		align-items: center;
		justify-content: center;
		gap: 7px;
		min-height: 36px;
		padding: 7px 12px;
		border-radius: 6px;
		border: 1px solid var(--border-strong);
		background: var(--surface);
		color: var(--text-body);
		font-family: var(--font-body);
		font-size: var(--text-sm);
		font-weight: 500;
		line-height: 1;
		white-space: nowrap;
		transition: 0.15s ease;
	}
	.button:hover {
		color: var(--text-strong);
		border-color: var(--text-dim);
		background: var(--surface-hover);
	}
	.button.primary {
		color: var(--accent-fg);
		background: var(--accent-bg);
		border-color: var(--accent-bg);
	}
	.button.primary:hover {
		background: var(--accent-bg-hover);
		border-color: var(--accent-bg-hover);
	}
	.conversation-list {
		overflow: hidden;
		background: var(--surface);
		border: 1px solid var(--border);
		border-radius: 8px;
	}
	.conversation-row {
		display: grid;
		align-items: center;
		gap: 12px;
		min-height: 52px;
		width: 100%;
		padding: 10px 14px;
		border-bottom: 1px solid var(--border);
		text-align: left;
		transition: background 0.12s ease;
		grid-template-columns: 32px minmax(0, 1fr) 90px;
		color: inherit;
		text-decoration: none;
	}
	.conversation-row:last-child {
		border-bottom: 0;
	}
	.conversation-row:hover {
		background: var(--surface-2);
	}
	.conversation-icon {
		display: grid;
		place-items: center;
		width: 30px;
		height: 30px;
		color: var(--text-muted);
		background: var(--surface-2);
		border: 1px solid var(--border);
		border-radius: 50%;
	}
	.conversation-name {
		min-width: 0;
	}
	.conversation-name strong,
	.conversation-name small {
		display: block;
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
	}
	.conversation-name strong {
		font-size: var(--text-sm);
		font-weight: 500;
		color: var(--text-strong);
		line-height: 1.35;
	}
	.conversation-name small {
		color: var(--text-dim);
		font-size: var(--text-xs);
		line-height: 1.3;
		margin-top: 1px;
	}
	.muted {
		color: var(--text-dim);
		font-size: var(--text-xs);
		font-variant-numeric: tabular-nums;
		line-height: 1.3;
	}
	.empty-state {
		text-align: center;
		color: var(--text-dim);
		font-size: var(--text-sm);
		padding: 34px 0;
		line-height: 1.5;
	}
	.load-more {
		display: block;
		width: 100%;
		margin-top: 10px;
		padding: 9px 12px;
		color: var(--text-muted);
		background: var(--surface);
		border: 1px solid var(--border);
		border-radius: 6px;
		font-size: var(--text-sm);
		font-weight: 500;
		transition: 0.15s ease;
	}
	.load-more:hover:not(:disabled) {
		color: var(--text-strong);
		border-color: var(--text-dim);
		background: var(--surface-2);
	}
	.load-more:focus-visible {
		outline: 2px solid var(--focus);
		outline-offset: 2px;
	}
	.load-more:disabled {
		cursor: wait;
		opacity: 0.65;
	}
</style>
