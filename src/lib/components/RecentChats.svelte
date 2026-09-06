<script lang="ts">
	import { onMount } from 'svelte';
	import { resolve } from '$app/paths';
	import { sidebar } from '$lib/client/sidebar.svelte';
	import { deleteConversation, updateConversation } from '$lib/client/api';
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

	let localEditingId = $state<string | null>(null);
	let localDeletingConversation = $state<ConversationSummary | null>(null);
	let localDeleteLoading = $state(false);
	let localStatus = $state('');
	let statusTimeout: ReturnType<typeof setTimeout> | undefined;
	let effectiveEditingId = $derived(editingId ?? localEditingId);

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

	function setLocalStatus(message: string) {
		localStatus = message;
		if (statusTimeout) clearTimeout(statusTimeout);
		statusTimeout = setTimeout(() => (localStatus = ''), 1800);
	}

	function startRename(conversation: ConversationSummary) {
		if (onStartRename) {
			onStartRename(conversation);
			return;
		}
		localEditingId = conversation.id;
		editingTitle = conversation.title;
	}

	function cancelRename() {
		if (onCancelRename) {
			onCancelRename();
			return;
		}
		localEditingId = null;
		editingTitle = '';
	}

	async function saveRename(id: string) {
		if (onSaveRename) {
			onSaveRename(id);
			return;
		}
		const title = editingTitle.trim();
		if (!title) {
			setLocalStatus('Title cannot be empty');
			return;
		}
		try {
			const updated = await updateConversation(id, { title });
			conversationsState.updateTitle(id, updated.title);
			localEditingId = null;
			setLocalStatus('Conversation renamed');
		} catch (error) {
			setLocalStatus(error instanceof Error ? error.message : 'Could not rename conversation');
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
			setLocalStatus('Conversation deleted');
		} catch (error) {
			setLocalStatus(error instanceof Error ? error.message : 'Could not delete conversation');
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
	<div class="nav-label projects-label">Recent chats</div>
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
					<button type="submit" class="item-action-btn check" title="Save" aria-label="Save title">
						<Check size={13} />
					</button>
					<button
						type="button"
						class="item-action-btn cancel"
						onclick={cancelRename}
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
				<div class="chat-item-actions">
					<button
						type="button"
						class="item-action-btn"
						title="Rename chat"
						aria-label="Rename chat"
						onclick={(e) => {
							e.stopPropagation();
							startRename(conversation);
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
							promptDelete(conversation);
						}}
					>
						<Trash2 size={13} />
					</button>
				</div>
			{/if}
		</div>
	{/each}
{/if}

{#if localDeletingConversation}
	<div
		class="modal-backdrop"
		role="dialog"
		aria-modal="true"
		tabindex="-1"
		onclick={(event) => {
			if (event.target === event.currentTarget) localDeletingConversation = null;
		}}
		onkeydown={(event) => {
			if (event.key === 'Escape') localDeletingConversation = null;
		}}
	>
		<div class="modal" role="document">
			<div class="modal-head">
				<h2>Delete chat</h2>
				<button
					class="icon-button"
					onclick={() => (localDeletingConversation = null)}
					aria-label="Close dialog"
				>
					<X size={16} />
				</button>
			</div>
			<p class="modal-text">
				Are you sure you want to delete <strong>"{localDeletingConversation.title}"</strong>? This
				will permanently remove all messages in this conversation.
			</p>
			<div class="modal-actions">
				<button
					class="button"
					onclick={() => (localDeletingConversation = null)}
					disabled={localDeleteLoading}>Cancel</button
				>
				<button class="button danger" onclick={confirmDelete} disabled={localDeleteLoading}>
					{localDeleteLoading ? 'Deleting...' : 'Delete'}
				</button>
			</div>
		</div>
	</div>
{/if}
{#if localStatus}<div class="toast" role="status" aria-live="polite">{localStatus}</div>{/if}

<style>
	.modal-text {
		margin: 0 0 16px;
		color: var(--text-body);
		font-size: var(--text-sm);
		line-height: 1.55;
	}
</style>
