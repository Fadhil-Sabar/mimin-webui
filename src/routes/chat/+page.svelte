<script lang="ts">
	import { onMount } from 'svelte';
	import { resolve } from '$app/paths';
	import { createConversation, stopConversation, streamMessage } from '$lib/client/api';
	import {
		ArrowUp,
		Bot,
		ChevronDown,
		FolderKanban,
		LogOut,
		MessageSquare,
		Paperclip,
		Plus,
		Search,
		Settings,
		Sparkles,
		Square,
		UserRound,
		Wrench
	} from '@lucide/svelte';
	import ThemeToggle from '$lib/components/ThemeToggle.svelte';
	import ModelPicker, { type ModelOption } from '$lib/components/ModelPicker.svelte';

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
	let models = $state<ModelOption[]>([]);
	let modelsLoading = $state(true);
	let modelLoadError = $state('');
	let modelSaving = $state(false);
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

	function modelRef(model: ModelOption) {
		return `${model.provider}/${model.id}`;
	}

	function modelId(modelRefValue: string) {
		return modelRefValue.split('/').slice(1).join('/') || modelRefValue;
	}

	let configuredModels = $derived(
		models.filter((model) => model.configured || model.userConfigured)
	);
	let pickerModels = $derived.by(() => {
		const current = activeConversation?.model;
		if (!current || configuredModels.some((model) => modelRef(model) === current))
			return configuredModels;
		const currentModel = models.find((model) => modelRef(model) === current);
		return currentModel ? [currentModel, ...configuredModels] : configuredModels;
	});

	async function loadModels() {
		try {
			const response = await fetch('/api/models');
			if (!response.ok) throw new Error('Could not load models');
			const data = await response.json();
			models = Array.isArray(data.models) ? data.models : [];
			const errors = Array.isArray(data.errors) ? data.errors : [];
			modelLoadError = errors
				.map((error: { message?: string }) => error.message ?? '')
				.filter(Boolean)
				.join(' ');
			if (modelLoadError) notify('Some live models could not be loaded. Check Providers.');
		} catch (error) {
			notify(error instanceof Error ? error.message : 'Could not load models');
		} finally {
			modelsLoading = false;
		}
	}

	function defaultModel() {
		const preferred = configuredModels.find((model) => modelRef(model) === 'openai/gpt-4o-mini');
		const selected = preferred ?? configuredModels[0];
		return selected ? modelRef(selected) : undefined;
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
			activeConversation = data.conversation ?? activeConversation;
			messages = (data.messages ?? []).filter(
				(m: ChatMessage) => m.role === 'user' || m.role === 'assistant'
			);
		} catch (error) {
			notify(error instanceof Error ? error.message : 'Could not load conversation');
		}
	}

	async function startNewConversation() {
		try {
			const model = defaultModel();
			const conversation = await createConversation(model ? { model } : {});
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
		await Promise.all([loadModels(), loadConversations()]);
		const params = new URL(window.location.href).searchParams;
		const requested = params.get('id');
		const pendingPrompt = params.get('prompt');
		const target = requested ? conversations.find((c) => c.id === requested) : conversations[0];
		if (target) {
			await loadConversation(target.id);
		} else {
			await startNewConversation();
		}
		busy = false;
		if (pendingPrompt) {
			message = pendingPrompt;
			await sendMessage();
		}
	});

	async function selectModel(model: string) {
		if (!activeId || model === activeConversation?.model) return;
		modelSaving = true;
		try {
			const response = await fetch(`/api/conversations/${activeId}`, {
				method: 'PATCH',
				headers: { 'content-type': 'application/json' },
				body: JSON.stringify({ model })
			});
			if (!response.ok)
				throw new Error(
					(await response.json().catch(() => null))?.error?.message ?? 'Could not select model'
				);
			const data = await response.json();
			activeConversation = data.conversation;
			conversations = conversations.map((conversation) =>
				conversation.id === activeId ? data.conversation : conversation
			);
			notify('Model selected');
		} catch (error) {
			notify(error instanceof Error ? error.message : 'Could not select model');
		} finally {
			modelSaving = false;
		}
	}

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
			<span class="brand-mark"><Sparkles size={13} /></span><span>mimin</span><span
				class="brand-muted">/ workbench</span
			>
		</div>
		<button class="new-chat" onclick={startNewConversation}
			><Plus size={16} /> New chat <kbd>⌘ K</kbd></button
		>
		<div class="sidebar-scroll">
			<div class="nav-label">Workspace</div>
			<a class="nav-item active" href={resolve('/chat')}
				><MessageSquare size={16} /> Chat <span class="nav-count">{conversations.length}</span></a
			>
			<a class="nav-item" href={resolve('/projects')}><FolderKanban size={16} /> Projects</a>
			<div class="nav-label projects-label">Preferences</div>
			<a class="nav-item" href={resolve('/settings')}><Settings size={16} /> Models</a>
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
		</div>
		<div class="sidebar-bottom">
			<div class="user-row">
				<span class="avatar">{user?.name?.[0]?.toUpperCase() ?? 'F'}</span>
				<div class="user-meta">
					<strong>{user?.name ?? 'Fadhil'}</strong>
					<small>Personal workspace</small>
				</div>
				<button class="logout-btn" onclick={logout} title="Log out" aria-label="Log out">
					<LogOut size={15} />
				</button>
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
			<div class="top-actions">
				<button
					class="icon-button"
					aria-label="Search conversations"
					title="Search conversations"
					onclick={() => notify('Search opened')}><Search size={17} /></button
				>
				<ThemeToggle />
			</div>
		</header>
		<div class="chat-wrap">
			<div class="chat-title">
				<span class="ready" class:working={running}><i></i> {running ? 'working' : 'ready'}</span>
				<h1>{activeConversation?.title ?? 'New conversation'}</h1>
				<p>
					{activeConversation?.model
						? modelId(activeConversation.model)
						: 'Pick a model'}{activeConversation && activeConversation.enabledTools?.length
						? ` · ${activeConversation.enabledTools.join(', ')}`
						: ''}
				</p>
			</div>
			{#if busy}
				<div class="empty-state" role="status">Loading conversations...</div>
			{:else if messages.length === 0 && !liveResponse}
				<div class="empty-state">Ask something to start a conversation.</div>
			{/if}
			{#each messages as msg (msg.id)}
				<article
					class="message"
					class:assistant-message={msg.role === 'assistant'}
					aria-label={`${msg.role === 'user' ? 'Your' : 'Mimin'} message`}
				>
					<div class="message-label">
						{#if msg.role === 'user'}
							<UserRound size={14} aria-hidden="true" />
							<span>YOU</span>
						{:else}
							<Bot size={14} aria-hidden="true" />
							<span>MIMIN</span>
						{/if}
						<time datetime={msg.createdAt}>{formatTime(msg.createdAt)}</time>
					</div>
					<div><p>{contentText(msg.content)}</p></div>
				</article>
			{/each}
			{#if liveResponse}
				<article class="message assistant-message" aria-label="Mimin message">
					<div class="message-label">
						<Bot size={14} aria-hidden="true" />
						<span>MIMIN</span>
					</div>
					<div class="response"><p class="response-text">{liveResponse}</p></div>
				</article>
			{/if}
			{#if liveError}
				<div class="inline-error" role="alert"><strong>Agent error</strong> {liveError}</div>
			{/if}
			<div class="chat-composer">
				<textarea
					bind:value={message}
					aria-label="Message Mimin"
					placeholder="Ask Mimin to think, write, or plan..."
					onkeydown={onKeydown}></textarea>
				<div class="composer-row">
					<button
						class="control"
						title="Attachments are not available in chat yet"
						onclick={() => notify('Attachments are not available in chat yet')}
						><Paperclip size={15} /> File</button
					>
					<ModelPicker
						models={pickerModels}
						value={activeConversation?.model ?? ''}
						loading={modelsLoading}
						disabled={!activeId || modelSaving || configuredModels.length === 0}
						placeholder={configuredModels.length
							? 'Pick a model'
							: modelLoadError
								? 'Models unavailable'
								: 'Configure a provider'}
						onselect={selectModel}
					/>
					<button
						class="control"
						title="Show enabled tools"
						onclick={() =>
							notify(
								activeConversation?.enabledTools?.length
									? `Active tools: ${activeConversation.enabledTools.join(', ')}`
									: 'No tools are enabled for this chat'
							)}><Wrench size={15} /> Tools</button
					>
					<button
						class="send-button"
						class:stop={running}
						aria-label={running ? 'Stop generation' : 'Send message'}
						title={running ? 'Stop generation' : 'Send message'}
						onclick={() => (running ? stopMessage() : sendMessage())}
						>{#if running}<Square size={13} />{:else}<ArrowUp size={16} />{/if}</button
					>
				</div>
			</div>
		</div>
	</main>
</div>
{#if toast}<div class="toast" role="status" aria-live="polite">{toast}</div>{/if}

<style>
	.chat-wrap {
		width: 100%;
		padding: 34px 44px 45px;
	}
	.chat-title {
		padding-bottom: 24px;
		border-bottom: 1px solid var(--border);
	}
	.chat-title h1 {
		font-family: var(--font-display);
		font-size: var(--text-xl);
		line-height: 1.1;
		letter-spacing: -0.02em;
		margin: 9px 0 5px;
	}
	.chat-title p {
		color: var(--text-dim);
		font-size: var(--text-sm);
		margin: 0;
	}
	.ready {
		float: right;
		color: var(--status-ok-text);
		border: 1px solid color-mix(in srgb, var(--status-ok-dot) 35%, transparent);
		padding: 4px 7px;
		border-radius: 5px;
		font-size: var(--text-xs);
		line-height: 1.2;
	}
	.ready i {
		display: inline-block;
		width: 6px;
		height: 6px;
		background: var(--status-ok-dot);
		border-radius: 50%;
		margin-right: 4px;
	}
	.ready.working {
		color: var(--status-working-text);
		border-color: color-mix(in srgb, var(--status-working-dot) 40%, transparent);
	}
	.empty-state {
		text-align: center;
		color: var(--text-dim);
		font-size: var(--text-sm);
		padding: 42px 0 10px;
	}
	.message {
		display: grid;
		grid-template-columns: 130px 1fr;
		gap: 24px;
		padding: 24px 0;
		border-bottom: 1px solid var(--border);
	}
	.assistant-message {
		margin-inline: -14px;
		padding-inline: 14px;
		background: color-mix(in srgb, var(--surface-3) 52%, transparent);
		border-bottom-color: transparent;
	}
	.assistant-message + .message {
		border-top: 1px solid var(--border);
	}
	.message-label {
		display: flex;
		align-items: center;
		gap: 6px;
		color: var(--text-dim);
		font-size: var(--text-xs);
		white-space: nowrap;
		flex-shrink: 0;
	}
	.message-label time {
		color: var(--text-faint);
		margin-left: 2px;
		font-variant-numeric: tabular-nums;
	}
	.message p {
		margin: 0;
		color: var(--text-body);
		line-height: 1.6;
		white-space: pre-wrap;
		font-family: var(--font-body);
	}
	.assistant-message .response,
	.assistant-message > div:last-child {
		max-width: 66ch;
	}
	.response {
		font-family: var(--font-body);
	}
	.response-text {
		margin: 0;
		line-height: 1.6;
		white-space: pre-wrap;
	}
	.inline-error {
		background: rgba(141, 47, 38, 0.09);
		border: 1px solid rgba(141, 47, 38, 0.35);
		color: var(--danger-text);
		border-radius: 6px;
		padding: 10px 12px;
		margin: 18px 0 0;
		font-size: var(--text-sm);
	}
	.inline-error strong {
		display: block;
		font-size: var(--text-sm);
		margin-bottom: 2px;
	}
	.chat-composer {
		position: sticky;
		bottom: 18px;
		background: var(--surface);
		border: 1px solid var(--border-strong);
		border-radius: 9px;
		padding: 12px;
		margin-top: 28px;
		box-shadow: 0 10px 28px var(--shadow-faint);
	}
	.chat-composer textarea {
		width: 100%;
		min-height: 45px;
		border: 0;
		outline: 0;
		resize: none;
		font: var(--text-base)/1.5 inherit;
		background: transparent;
	}
	.composer-row {
		display: flex;
		align-items: center;
		gap: 7px;
		border-top: 1px solid var(--border);
		padding-top: 10px;
	}
	.control {
		display: inline-flex;
		align-items: center;
		gap: 6px;
		min-height: 38px;
		border: 1px solid var(--border);
		border-radius: 6px;
		background: var(--surface-subtle);
		padding: 7px 9px;
		color: var(--text-muted);
		font-size: var(--text-sm);
		transition: 0.18s ease;
	}
	.control:hover {
		color: var(--text-strong);
		border-color: var(--text-faint);
	}
	.send-button {
		display: grid;
		place-items: center;
		margin-left: auto;
		width: 40px;
		height: 40px;
		flex: 0 0 auto;
		border: 0;
		border-radius: 8px;
		color: var(--accent-fg);
		background: var(--accent-bg);
		transition: 0.18s ease;
	}
	.send-button:hover {
		background: var(--accent-bg-hover);
	}
	.send-button.stop {
		background: var(--danger-bg);
		color: #ffffff;
	}
	.toast {
		position: fixed;
		bottom: 22px;
		left: 50%;
		transform: translateX(-50%);
		background: var(--accent-bg);
		color: var(--accent-fg);
		font-size: var(--text-sm);
		padding: 8px 13px;
		border-radius: 6px;
		z-index: 50;
	}
	@media (max-width: 860px) {
		.chat-wrap {
			padding: 28px 18px 36px;
		}
		.message {
			grid-template-columns: 1fr;
			gap: 6px;
		}
		.ready {
			float: none;
			display: inline-flex;
		}
	}
	@media (max-width: 420px) {
		.chat-wrap {
			padding-inline: 14px;
		}
	}
</style>
