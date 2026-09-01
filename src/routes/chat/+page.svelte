<script lang="ts">
	import { onMount } from 'svelte';
	import { resolve } from '$app/paths';
	import { createConversation, stopConversation, streamMessage } from '$lib/client/api';
	import {
		ArrowUp,
		Bot,
		ChevronDown,
		FolderKanban,
		MessageSquare,
		Paperclip,
		Plus,
		Search,
		Sparkles,
		Square,
		Wrench
	} from '@lucide/svelte';

	type Conversation = {
		id: string;
		title: string;
		model: string;
		enabledTools: string[];
		createdAt: string;
		updatedAt: string;
		projectId: string | null;
	};
	type ChatMessage = {
		id: string;
		role: 'user' | 'assistant';
		content: unknown;
		createdAt: string;
	};

	let running = $state(false);
	let message = $state('');
	let toast = $state('');
	let busy = $state(true);
	let user = $state<{ name: string } | null>(null);
	let conversations = $state<Conversation[]>([]);
	let activeId = $state('');
	let activeConversation = $state<Conversation | null>(null);
	let messages = $state<ChatMessage[]>([]);
	let liveResponse = $state('');
	let liveError = $state('');
	let abortController: AbortController | undefined;

	function notify(value: string) {
		toast = value;
		setTimeout(() => (toast = ''), 1800);
	}

	function contentText(content: unknown): string {
		if (typeof content === 'string') return content;
		if (Array.isArray(content))
			return content.map((part) => (typeof part === 'string' ? part : (part?.text ?? ''))).join('');
		return '';
	}

	async function loadConversations() {
		try {
			const response = await fetch('/api/conversations');
			if (!response.ok) throw new Error('Could not load conversations');
			const data = await response.json();
			conversations = data.conversations ?? [];
		} catch (error) {
			notify(error instanceof Error ? error.message : 'Could not load conversations');
		}
	}

	async function loadConversation(id: string) {
		activeId = id;
		activeConversation = conversations.find((c) => c.id === id) ?? null;
		liveResponse = '';
		liveError = '';
		try {
			const response = await fetch(`/api/conversations/${id}`);
			if (!response.ok) throw new Error('Could not load conversation');
			const data = await response.json();
			messages = (data.messages ?? []).filter(
				(m: ChatMessage) => m.role === 'user' || m.role === 'assistant'
			);
		} catch (error) {
			notify(error instanceof Error ? error.message : 'Could not load conversation');
		}
	}

	async function startNewConversation() {
		try {
			const conversation = await createConversation({});
			await loadConversations();
			await loadConversation(conversation.id);
		} catch (error) {
			notify(error instanceof Error ? error.message : 'Backend unavailable');
		}
	}

	onMount(async () => {
		try {
			const response = await fetch('/api/auth/session');
			if (response.ok) user = (await response.json()).user ?? null;
		} catch {
			/* ignore */
		}
		await loadConversations();
		const requested = new URL(window.location.href).searchParams.get('id');
		const target = requested ? conversations.find((c) => c.id === requested) : conversations[0];
		if (target) {
			await loadConversation(target.id);
		} else {
			await startNewConversation();
		}
		busy = false;
	});

	function formatTime(iso: string) {
		return new Date(iso).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
	}

	function appendAssistantMessage(text: string) {
		messages = [
			...messages,
			{
				id: `${activeId}:assistant`,
				role: 'assistant',
				content: text,
				createdAt: new Date().toISOString()
			}
		];
		liveResponse = '';
	}

	async function sendMessage() {
		const content = message.trim();
		if (!content || !activeId) {
			notify(!activeId ? 'No active conversation' : 'Type a message first');
			return;
		}
		running = true;
		liveError = '';
		liveResponse = '';
		message = '';
		messages = [
			...messages,
			{ id: `${activeId}:user`, role: 'user', content, createdAt: new Date().toISOString() }
		];
		abortController = new AbortController();
		try {
			await streamMessage(
				activeId,
				content,
				(event) => {
					if (event.type === 'message.delta') liveResponse += String(event.delta ?? '');
					if (event.type === 'error') {
						liveError = String((event.error as { message?: string })?.message ?? 'Agent error');
					}
				},
				abortController.signal
			);
			if (liveResponse && !liveError) appendAssistantMessage(liveResponse);
		} catch (error) {
			if ((error as Error).name !== 'AbortError')
				notify(error instanceof Error ? error.message : 'Agent error');
		} finally {
			running = false;
			abortController = undefined;
			await loadConversations();
			const updated = conversations.find((c) => c.id === activeId);
			if (updated) activeConversation = updated;
		}
	}

	async function stopMessage() {
		if (activeId) await stopConversation(activeId);
		abortController?.abort();
		running = false;
		if (liveResponse && !liveError) appendAssistantMessage(liveResponse);
		notify('Generation stopped');
	}

	function onKeydown(event: KeyboardEvent) {
		if (event.key === 'Enter' && !event.shiftKey) {
			event.preventDefault();
			if (!running) sendMessage();
		}
	}

	async function logout() {
		await fetch('/api/auth/logout', { method: 'POST' });
		window.location.href = '/login';
	}
</script>

<svelte:head><title>Mimin WebUI | Chat</title></svelte:head>
<div class="app-shell">
	<aside class="sidebar">
		<div class="brand">
			<span class="brand-mark"><Sparkles size={13} /></span><span>solace</span><span
				class="brand-muted">/ agent</span
			>
		</div>
		<button class="new-chat" onclick={startNewConversation}
			><Plus size={16} /> New chat <kbd>⌘ K</kbd></button
		>
		<div class="nav-label">Workspace</div>
		<a class="nav-item active" href={resolve('/chat')}
			><MessageSquare size={16} /> Chat <span class="nav-count">{conversations.length}</span></a
		>
		<a class="nav-item" href={resolve('/projects')}><FolderKanban size={16} /> Projects</a>
		{#if conversations.length > 0}
			<div class="nav-label projects-label">Recent chats</div>
			{#each conversations as conversation (conversation.id)}
				<button
					class="project-item"
					class:active-project={conversation.id === activeId}
					onclick={() => loadConversation(conversation.id)}
				>
					<span class="project-dot"></span>{conversation.title}
				</button>
			{/each}
		{/if}
		<div class="sidebar-bottom">
			<button class="nav-item" onclick={logout}>Log out</button>
			<div class="user-row">
				<span class="avatar">{user?.name?.[0]?.toUpperCase() ?? 'F'}</span><span
					><strong>{user?.name ?? 'Fadhil'}</strong><small>Personal workspace</small></span
				>
			</div>
		</div>
	</aside>
	<main class="main-content">
		<header class="topbar">
			<div class="breadcrumb">
				<strong>Chat</strong><ChevronDown size={14} /><span
					>{activeConversation?.title ?? 'New session'}</span
				>
			</div>
			<button class="icon-button" onclick={() => notify('Search opened')}
				><Search size={17} /></button
			>
		</header>
		<div class="chat-wrap">
			<div class="chat-title">
				<span class="ready" class:working={running}><i></i> {running ? 'working' : 'ready'}</span>
				<h1>{activeConversation?.title ?? 'New conversation'}</h1>
				<p>
					{activeConversation?.model
						? (activeConversation.model.split('/')[1] ?? activeConversation.model)
						: 'Pick a model'}{activeConversation && activeConversation.enabledTools?.length
						? ` · ${activeConversation.enabledTools.join(', ')}`
						: ''}
				</p>
			</div>
			{#if busy}
				<div class="empty-state">Loading conversations...</div>
			{:else if messages.length === 0 && !liveResponse}
				<div class="empty-state">Ask something to start a conversation.</div>
			{/if}
			{#each messages as msg (msg.id)}
				<article class="message">
					<div class="message-label">
						{msg.role === 'user' ? 'YOU' : ''}<Bot size={14} />
						{msg.role === 'user' ? '' : 'SOL'} <small>{formatTime(msg.createdAt)}</small>
					</div>
					<div><p>{contentText(msg.content)}</p></div>
				</article>
			{/each}
			{#if liveResponse}
				<article class="message">
					<div class="message-label"><Bot size={14} /> SOL</div>
					<div class="response"><p class="response-text">{liveResponse}</p></div>
				</article>
			{/if}
			{#if liveError}
				<div class="inline-error"><strong>Agent error</strong> {liveError}</div>
			{/if}
			<div class="chat-composer">
				<textarea bind:value={message} placeholder="Message Sol..." onkeydown={onKeydown}
				></textarea>
				<div class="composer-row">
					<button class="control"><Paperclip size={15} /> File</button>
					<button class="control" onclick={() => notify('Model selector opened')}
						><Bot size={15} />
						{activeConversation?.model
							? (activeConversation.model.split('/')[1] ?? activeConversation.model)
							: 'Pick a model'}
						<ChevronDown size={13} /></button
					>
					<button
						class="control"
						onclick={() =>
							notify(
								activeConversation?.enabledTools?.length
									? `Active: ${activeConversation.enabledTools.join(', ')}`
									: 'No tools active'
							)}><Wrench size={15} /> Tools <ChevronDown size={13} /></button
					>
					<button
						class="send-button"
						class:stop={running}
						onclick={() => (running ? stopMessage() : sendMessage())}
						>{#if running}<Square size={13} />{:else}<ArrowUp size={16} />{/if}</button
					>
				</div>
			</div>
		</div>
	</main>
</div>
{#if toast}<div class="toast">{toast}</div>{/if}

<style>
	.chat-wrap {
		max-width: 850px;
		margin: auto;
		padding: 34px 32px 45px;
	}
	.chat-title {
		padding-bottom: 24px;
		border-bottom: 1px solid #e1e1dd;
	}
	.chat-title h1 {
		font-size: 25px;
		letter-spacing: -0.05em;
		margin: 9px 0 5px;
	}
	.chat-title p {
		color: #999;
		font-size: 12px;
		margin: 0;
	}
	.ready {
		float: right;
		color: #56805d;
		border: 1px solid #c9ddcc;
		padding: 4px 7px;
		border-radius: 5px;
		font-size: 11px;
	}
	.ready i {
		display: inline-block;
		width: 6px;
		height: 6px;
		background: #6e9a74;
		border-radius: 50%;
		margin-right: 4px;
	}
	.ready.working {
		color: #8a6d3b;
		border-color: #e3d5a8;
	}
	.empty-state {
		text-align: center;
		color: #999;
		font-size: 13px;
		padding: 42px 0 10px;
	}
	.message {
		display: grid;
		grid-template-columns: 80px 1fr;
		gap: 24px;
		padding: 25px 0;
		border-bottom: 1px solid #f0f0ed;
	}
	.message-label {
		display: flex;
		align-items: center;
		gap: 5px;
		color: #999;
		font-size: 11px;
	}
	.message-label small {
		color: #bbb;
		margin-left: 4px;
	}
	.message p {
		margin: 0;
		color: #444;
		white-space: pre-wrap;
		font-family: ui-sans-serif, system-ui, sans-serif;
	}
	.response {
		font-family: ui-sans-serif, system-ui, sans-serif;
	}
	.response-text {
		margin: 0;
		line-height: 1.6;
		white-space: pre-wrap;
	}
	.inline-error {
		background: #fdf3f2;
		border: 1px solid #f0cfcb;
		color: #8d2f26;
		border-radius: 6px;
		padding: 10px 12px;
		margin: 18px 0 0;
		font-size: 13px;
	}
	.inline-error strong {
		display: block;
		font-size: 12px;
		margin-bottom: 2px;
	}
	.chat-composer {
		position: sticky;
		bottom: 18px;
		background: white;
		border: 1px solid #c8c8c3;
		border-radius: 9px;
		padding: 12px;
		margin-top: 28px;
		box-shadow: 0 8px 24px #0001;
	}
	.chat-composer textarea {
		width: 100%;
		height: 45px;
		border: 0;
		outline: 0;
		resize: none;
		font: 15px/1.5 inherit;
	}
	.composer-row {
		display: flex;
		gap: 7px;
		border-top: 1px solid #eee;
		padding-top: 10px;
	}
	.control {
		display: inline-flex;
		align-items: center;
		gap: 6px;
		border: 1px solid #e0e0dc;
		border-radius: 6px;
		background: #fafaf8;
		padding: 7px 9px;
		color: #666;
		font-size: 12px;
	}
	.control:hover {
		color: #111;
		border-color: #aaa;
	}
	.send-button {
		display: grid;
		place-items: center;
		margin-left: auto;
		width: 32px;
		border: 0;
		border-radius: 6px;
		color: white;
		background: #181818;
	}
	.send-button.stop {
		background: #8d2f26;
	}
	.toast {
		position: fixed;
		bottom: 22px;
		left: 50%;
		transform: translateX(-50%);
		background: #181818;
		color: white;
		font-size: 12px;
		padding: 8px 13px;
		border-radius: 6px;
		z-index: 50;
	}
	@media (max-width: 700px) {
		.chat-wrap {
			padding: 24px 18px;
		}
		.message {
			grid-template-columns: 1fr;
			gap: 6px;
		}
	}
</style>
