<script lang="ts">
	import { resolve } from '$app/paths';
	import { MessageSquare } from '@lucide/svelte';
	import { Button } from '$lib/components/ui/button/index.js';
	import { formatDate } from '$lib/format';
	import type { Conversation, PageInfo } from './project-types';
	import ProjectSearch from './ProjectSearch.svelte';

	let {
		filteredConversations,
		loadedCount,
		query = $bindable(''),
		pagination,
		loadingMore,
		onloadmore
	}: {
		filteredConversations: Conversation[];
		loadedCount: number;
		query?: string;
		pagination: PageInfo;
		loadingMore: boolean;
		onloadmore: () => void;
	} = $props();
</script>

<section class="section-block conversations">
	<div class="section-heading">
		<div>
			<h2>Recent conversations</h2>
			<p>Pick up where you left off in this project.</p>
			{#if query.trim()}<small class="search-scope">Searching all project conversations…</small
				>{/if}
		</div>
		<div class="section-tools">
			<ProjectSearch bind:value={query} />
		</div>
	</div>
	<div class="conversation-list">
		{#each filteredConversations as conversation (conversation.id)}
			<a class="conversation-row" href={resolve(`/chat?id=${encodeURIComponent(conversation.id)}`)}>
				<div class="conversation-icon"><MessageSquare size={16} /></div>
				<div class="conversation-name">
					<strong>{conversation.title}</strong>
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
		<Button
			class="mt-[10px] w-full"
			variant="outline"
			type="button"
			onclick={() => void onloadmore()}
			disabled={loadingMore}
			aria-busy={loadingMore}
		>
			{loadingMore
				? 'Loading conversations…'
				: `Load more conversations (${loadedCount} of ${pagination.total})`}
		</Button>
	{/if}
	<div class="list-footer">
		<span
			>Showing {Math.min(filteredConversations.length, pagination.total)} of {pagination.total}</span
		>
		{#if pagination.total > filteredConversations.length}
			<span>Load more to view all conversations</span>
		{:else}
			<span>All conversations loaded</span>
		{/if}
	</div>
</section>

<style>
	.section-block {
		padding-top: var(--space-6);
	}
	.section-heading {
		display: flex;
		align-items: center;
		justify-content: space-between;
		gap: var(--space-4);
		margin-bottom: var(--space-3);
	}
	.section-tools {
		display: flex;
		align-items: center;
		gap: var(--space-2);
		flex: 0 0 auto;
	}
	.section-heading h2 {
		margin: 0;
		font-family: var(--font-body);
		font-size: var(--text-body-lg);
		line-height: var(--text-body-lg--line-height);
		letter-spacing: var(--text-body-lg--letter-spacing);
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
		margin-top: var(--space-1);
		color: var(--text-dim);
		font-size: var(--text-body-sm);
		line-height: var(--text-body-sm--line-height);
		letter-spacing: var(--text-body-sm--letter-spacing);
	}
	.conversation-list {
		overflow: hidden;
		background: var(--surface);
		border: 1px solid var(--border);
		border-radius: var(--radius-lg);
	}
	.conversation-row {
		display: grid;
		align-items: center;
		gap: var(--space-3);
		min-height: 52px;
		width: 100%;
		padding: 10px 14px;
		border-bottom: 1px solid var(--border);
		text-align: left;
		transition: background var(--duration-short2) var(--ease-standard);
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
	.conversation-name strong {
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
	.list-footer {
		display: flex;
		justify-content: space-between;
		gap: var(--space-3);
		padding: 12px 2px 0;
		color: var(--text-dim);
		font-size: var(--text-body-sm);
		line-height: var(--text-body-sm--line-height);
	}
	@media (max-width: 760px) {
		.section-heading {
			align-items: stretch;
			flex-direction: column;
		}
		.section-tools {
			align-items: stretch;
			flex-wrap: wrap;
		}
		.section-tools :global(.project-search) {
			flex: 1 1 180px;
			width: auto;
		}
		.section-tools :global(button) {
			flex: 0 0 auto;
		}
		.list-footer {
			align-items: flex-start;
			flex-direction: column;
		}
	}
</style>
