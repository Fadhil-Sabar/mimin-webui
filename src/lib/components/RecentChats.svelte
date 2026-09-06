<script lang="ts">
	import { onMount } from 'svelte';
	import { resolve } from '$app/paths';
	import { sidebar } from '$lib/client/sidebar.svelte';
	import { conversationsState, type ConversationSummary } from '$lib/client/conversations.svelte';
	import { Check, Pencil, Trash2, X } from '@lucide/svelte';

	let {
		conversations,
		activeId = '',
		onSelectChat,
		onStartRename,
		onPromptDelete,
		editingId = null,
		editingTitle = $bindable(''),
		onSaveRename,
		onCancelRename
	}: {
		conversations?: ConversationSummary[];
		activeId?: string;
		onSelectChat?: (id: string) => void;
		onStartRename?: (conversation: ConversationSummary) => void;
		onPromptDelete?: (conversation: ConversationSummary) => void;
		editingId?: string | null;
		editingTitle?: string;
		onSaveRename?: (id: string) => void;
		onCancelRename?: () => void;
	} = $props();

	onMount(() => {
		void conversationsState.load();
	});

	let displayConversations = $derived(
		conversations !== undefined ? conversations : conversationsState.items
	);

	function focusInput(node: HTMLInputElement) {
		node.focus();
		node.select();
	}

	function fadeIfOverflow(node: HTMLElement) {
		const check = () => {
			if (node.scrollWidth > node.clientWidth + 1) {
				node.classList.add('overflow-fade');
			} else {
				node.classList.remove('overflow-fade');
			}
		};
		check();
		const ro = new ResizeObserver(check);
		ro.observe(node);
		if (node.parentElement) {
			ro.observe(node.parentElement);
		}
		const mo = new MutationObserver(check);
		mo.observe(node, { childList: true, characterData: true, subtree: true });

		return {
			update() {
				check();
			},
			destroy() {
				ro.disconnect();
				mo.disconnect();
			}
		};
	}
</script>

{#if displayConversations.length > 0}
	<div class="nav-label projects-label">Recent chats</div>
	{#each displayConversations as conversation (conversation.id)}
		<div class="recent-chat-item" class:active-project={conversation.id === activeId}>
			{#if editingId === conversation.id}
				<form
					class="inline-rename-form"
					onsubmit={(e) => {
						e.preventDefault();
						onSaveRename?.(conversation.id);
					}}
				>
					<input
						type="text"
						class="inline-rename-input"
						bind:value={editingTitle}
						onkeydown={(e) => {
							if (e.key === 'Escape') onCancelRename?.();
						}}
						use:focusInput
					/>
					<button type="submit" class="item-action-btn check" title="Save" aria-label="Save title">
						<Check size={13} />
					</button>
					<button
						type="button"
						class="item-action-btn cancel"
						onclick={onCancelRename}
						title="Cancel"
						aria-label="Cancel rename"
					>
						<X size={13} />
					</button>
				</form>
			{:else}
				{#if onSelectChat}
					<button
						type="button"
						class="project-item-btn"
						onclick={() => {
							sidebar.closeMobile();
							onSelectChat(conversation.id);
						}}
						title={conversation.projectName
							? `${conversation.title} - ${conversation.projectName}`
							: conversation.title}
					>
						<span class="project-dot"></span>
						<span class="chat-title-text" use:fadeIfOverflow>{conversation.title}</span>
						{#if conversation.projectName}
							<span class="chat-project-badge">- {conversation.projectName}</span>
						{/if}
					</button>
				{:else}
					<a
						class="project-item-btn"
						href={resolve(`/chat?id=${encodeURIComponent(conversation.id)}`)}
						onclick={() => sidebar.closeMobile()}
						title={conversation.projectName
							? `${conversation.title} - ${conversation.projectName}`
							: conversation.title}
					>
						<span class="project-dot"></span>
						<span class="chat-title-text" use:fadeIfOverflow>{conversation.title}</span>
						{#if conversation.projectName}
							<span class="chat-project-badge">- {conversation.projectName}</span>
						{/if}
					</a>
				{/if}
				{#if onStartRename && onPromptDelete}
					<div class="chat-item-actions">
						<button
							type="button"
							class="item-action-btn"
							title="Rename chat"
							aria-label="Rename chat"
							onclick={(e) => {
								e.stopPropagation();
								onStartRename(conversation);
							}}
						>
							<Pencil size={13} />
						</button>
						<button
							type="button"
							class="item-action-btn danger"
							title="Delete chat"
							aria-label="Delete chat"
							onclick={(e) => {
								e.stopPropagation();
								onPromptDelete(conversation);
							}}
						>
							<Trash2 size={13} />
						</button>
					</div>
				{/if}
			{/if}
		</div>
	{/each}
{/if}
