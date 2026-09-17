<script lang="ts">
	import { onMount } from 'svelte';
	import { resolve } from '$app/paths';
	import { sidebar } from '$lib/client/sidebar.svelte';
	import { deleteConversation, updateConversation } from '$lib/client/api';
	import {
		conversationSearch,
		conversationsState,
		type ConversationSummary
	} from '$lib/client/conversations.svelte';
	import { Check, Pencil, Search, Trash2, X } from '@lucide/svelte';
	import { toast } from 'svelte-sonner';
	import { Button } from '$lib/components/ui/button/index.js';
	import ConfirmDialog from '$lib/components/ConfirmDialog.svelte';

	let {
		conversations,
		activeId = '',
		onSelectChat,
		onStartRename,
		onPromptDelete,
		editingId = null,
		onSaveRename,
		onCancelRename
	}: {
		conversations?: ConversationSummary[];
		activeId?: string;
		onSelectChat?: (id: string) => void;
		onStartRename?: (conversation: ConversationSummary) => void;
		onPromptDelete?: (conversation: ConversationSummary) => void;
		editingId?: string | null;
		onSaveRename?: (id: string, title: string) => void;
		onCancelRename?: () => void;
	} = $props();

	let localEditingId = $state<string | null>(null);
	let localDeletingConversation = $state<ConversationSummary | null>(null);
	let localDeleteLoading = $state(false);
	let editingTitle = $state('');
	let effectiveEditingId = $derived(editingId ?? localEditingId);
	/** A parent (the chat room) can drive in-page switching; otherwise items are links. */
	let selectHandler = $derived(onSelectChat ?? undefined);

	function selectConversation(id: string) {
		sidebar.closeMobile();
		selectHandler?.(id);
	}

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

	function startRename(conversation: ConversationSummary) {
		editingTitle = conversation.title;
		if (onStartRename) {
			onStartRename(conversation);
			return;
		}
		localEditingId = conversation.id;
	}

	function cancelRename() {
		editingTitle = '';
		if (onCancelRename) {
			onCancelRename();
			return;
		}
		localEditingId = null;
	}

	async function saveRename(id: string) {
		const title = editingTitle.trim();
		if (!title) {
			toast('Title cannot be empty');
			return;
		}
		if (onSaveRename) {
			onSaveRename(id, title);
			return;
		}
		try {
			const updated = await updateConversation(id, { title });
			conversationsState.updateTitle(id, updated.title);
			localEditingId = null;
			toast('Conversation renamed');
		} catch (error) {
			toast(error instanceof Error ? error.message : 'Could not rename conversation');
		}
	}

	function promptDelete(conversation: ConversationSummary) {
		if (onPromptDelete) {
			onPromptDelete(conversation);
			return;
		}
		localDeletingConversation = conversation;
	}

	async function confirmDelete() {
		if (!localDeletingConversation) return;
		localDeleteLoading = true;
		try {
			await deleteConversation(localDeletingConversation.id);
			conversationsState.remove(localDeletingConversation.id);
			localDeletingConversation = null;
			toast('Conversation deleted');
		} catch (error) {
			toast(error instanceof Error ? error.message : 'Could not delete conversation');
		} finally {
			localDeleteLoading = false;
		}
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
	<div class="recent-chats-header">
		<span class="nav-label nav-label-group">Recent chats</span>
		<button
			type="button"
			class="nav-label-action"
			title="Search conversations (⌘O)"
			aria-label="Search conversations"
			onclick={() => conversationSearch.open()}
		>
			<Search size={13} />
		</button>
	</div>
	{#each displayConversations as conversation (conversation.id)}
		<div class="recent-chat-item" class:active-project={conversation.id === activeId}>
			{#if effectiveEditingId === conversation.id}
				<form
					class="inline-rename-form"
					onsubmit={(e) => {
						e.preventDefault();
						void saveRename(conversation.id);
					}}
				>
					<input
						type="text"
						class="inline-rename-input"
						bind:value={editingTitle}
						onkeydown={(e) => {
							if (e.key === 'Escape') cancelRename();
						}}
						use:focusInput
					/>
					<Button type="submit" variant="ghost" size="icon-sm" title="Save" aria-label="Save title">
						<Check size={13} />
					</Button>
					<Button
						type="button"
						variant="ghost"
						size="icon-sm"
						onclick={cancelRename}
						title="Cancel"
						aria-label="Cancel rename"
					>
						<X size={13} />
					</Button>
				</form>
			{:else}
				{#if selectHandler}
					<button
						type="button"
						class="project-item-btn"
						onclick={() => selectConversation(conversation.id)}
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
				<div class="chat-item-actions">
					<Button
						type="button"
						variant="ghost"
						size="icon-sm"
						title="Rename chat"
						aria-label="Rename chat"
						onclick={(e) => {
							e.stopPropagation();
							startRename(conversation);
						}}
					>
						<Pencil size={13} />
					</Button>
					<Button
						type="button"
						variant="ghost"
						size="icon-sm"
						title="Delete chat"
						aria-label="Delete chat"
						onclick={(e) => {
							e.stopPropagation();
							promptDelete(conversation);
						}}
					>
						<Trash2 size={13} />
					</Button>
				</div>
			{/if}
		</div>
	{/each}
{/if}

{#if localDeletingConversation}
	<ConfirmDialog
		open={true}
		title="Delete chat"
		loading={localDeleteLoading}
		onconfirm={confirmDelete}
		oncancel={() => (localDeletingConversation = null)}
	>
		{#snippet description()}
			Are you sure you want to delete <strong>"{localDeletingConversation?.title}"</strong>? This
			will permanently remove all messages in this conversation.
		{/snippet}
	</ConfirmDialog>
{/if}

<style>
	.recent-chats-header {
		display: flex;
		align-items: center;
		justify-content: space-between;
		padding-right: 6px;
	}
	.nav-label-action {
		background: transparent;
		border: 0;
		color: var(--text-faint);
		cursor: pointer;
		padding: 4px;
		border-radius: 4px;
		display: inline-flex;
		align-items: center;
		justify-content: center;
		transition:
			color 0.15s ease,
			background-color 0.15s ease;
		margin-top: 14px;
	}
	.nav-label-action:hover {
		color: var(--text-strong);
		background: var(--surface-subtle);
	}
</style>
