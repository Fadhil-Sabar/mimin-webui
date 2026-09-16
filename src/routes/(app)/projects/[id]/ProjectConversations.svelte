<script lang="ts">
	import { resolve } from '$app/paths';
	import { MessageSquare, Plus } from '@lucide/svelte';
	import { Button } from '$lib/components/ui/button/index.js';
	import { formatDate } from '$lib/format';
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
		<Button variant="default" onclick={onstartchat}><Plus size={15} /> New chat</Button>
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
		font-size: var(--text-body-lg);
		line-height: var(--text-body-lg--line-height);
		letter-spacing: var(--text-body-lg--letter-spacing);
		font-weight: 500;
		color: var(--text-strong);
	}
	.section-heading p {
		margin: 3px 0 0;
		color: var(--text-muted);
		font-size: var(--text-body-md);
		line-height: var(--text-body-md--line-height);
		letter-spacing: var(--text-body-md--letter-spacing);
	}
	.search-scope {
		display: block;
		margin-top: 4px;
		color: var(--text-dim);
		font-size: var(--text-body-sm);
		line-height: var(--text-body-sm--line-height);
		letter-spacing: var(--text-body-sm--letter-spacing);
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
		font-size: var(--text-body-md);
		line-height: var(--text-body-md--line-height);
		letter-spacing: var(--text-body-md--letter-spacing);
		font-weight: 500;
		color: var(--text-strong);
	}
	.conversation-name small {
		color: var(--text-dim);
		font-size: var(--text-body-sm);
		line-height: var(--text-body-sm--line-height);
		letter-spacing: var(--text-body-sm--letter-spacing);
		margin-top: 1px;
	}
	.muted {
		color: var(--text-dim);
		font-size: var(--text-body-sm);
		line-height: var(--text-body-sm--line-height);
		letter-spacing: var(--text-body-sm--letter-spacing);
		font-variant-numeric: tabular-nums;
	}
	.empty-state {
		text-align: center;
		color: var(--text-dim);
		font-size: var(--text-body-md);
		line-height: var(--text-body-md--line-height);
		letter-spacing: var(--text-body-md--letter-spacing);
		padding: 34px 0;
	}
</style>
