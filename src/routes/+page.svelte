<script lang="ts">
	import { onMount } from 'svelte';
	import { resolve } from '$app/paths';
	import {
		Bot,
		FolderKanban,
		MessageSquare,
		Paperclip,
		Plus,
		Send,
		Sparkles,
		Wrench
	} from '@lucide/svelte';
	let prompt = $state('');
	let toast = $state('');
	let user = $state<{ name: string } | null>(null);
	let conversations = $state<{ id: string; title: string }[]>([]);
	function notify(message: string) {
		toast = message;
		setTimeout(() => (toast = ''), 1600);
	}
	function usePrompt(value: string) {
		prompt = value;
	}

	onMount(async () => {
		try {
			const sessionResponse = await fetch('/api/auth/session');
			if (sessionResponse.ok) user = (await sessionResponse.json()).user ?? null;
		} catch {
			/* ignore */
		}
		try {
			const response = await fetch('/api/conversations');
			if (response.ok) conversations = (await response.json()).conversations ?? [];
		} catch {
			/* ignore */
		}
	});

	async function logout() {
		await fetch('/api/auth/logout', { method: 'POST' });
		window.location.href = '/login';
	}
</script>

<svelte:head><title>Mimin WebUI | Home</title></svelte:head>
<div class="app-shell">
	<aside class="sidebar">
		<div class="brand">
			<span class="brand-mark"><Sparkles size={13} /></span><span>solace</span><span
				class="brand-muted">/ agent</span
			>
		</div>
		<a class="new-chat" href={resolve('/chat')}><Plus size={16} /> New chat <kbd>⌘ K</kbd></a>
		<div class="nav-label">Workspace</div>
		<a class="nav-item active" href={resolve('/')}
			><MessageSquare size={16} /> Chat <span class="nav-count">{conversations.length}</span></a
		>
		<a class="nav-item" href={resolve('/projects')}><FolderKanban size={16} /> Projects</a>
		{#if conversations.length > 0}
			<div class="nav-label projects-label">Recent chats</div>
			{#each conversations as conversation (conversation.id)}
				<a class="project-item" href={resolve(`/chat?id=${encodeURIComponent(conversation.id)}`)}
					><span class="project-dot"></span>{conversation.title}</a
				>
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
			<div class="breadcrumb"><strong>Home</strong></div>
			<span class="avatar avatar-top">F</span>
		</header>
		<div class="home-wrap">
			<div class="eyebrow">AI WORKSPACE · READY</div>
			<h1>What would you like to<br />work on today?</h1>
			<p class="intro">
				Think with an agent that can research, build, and organize your work in one calm workspace.
			</p>
			<div class="home-composer">
				<textarea bind:value={prompt} placeholder="Ask anything..."></textarea>
				<div class="composer-row">
					<button class="control" onclick={() => notify('File picker opened')}
						><Paperclip size={15} /> Attach</button
					>
					<button class="control" onclick={() => notify('Model selector opened')}
						><Bot size={15} /> GPT-5.6 Sol <span>⌄</span></button
					>
					<button class="control" onclick={() => notify('Tools selector opened')}
						><Wrench size={15} /> Tools <span>⌄</span></button
					>
					<a class="send-button" href={resolve('/chat')}><Send size={15} /></a>
				</div>
			</div>
			<div class="example-row">
				<button onclick={() => usePrompt('Summarize project notes')}>Summarize project notes</button
				><button onclick={() => usePrompt('Design a clean API')}>Design a clean API</button><button
					onclick={() => usePrompt('Explore ideas')}>Explore ideas</button
				>
			</div>
		</div>
	</main>
</div>
{#if toast}<div class="toast">{toast}</div>{/if}

<style>
	.home-wrap {
		max-width: 800px;
		margin: auto;
		padding: 15vh 32px 80px;
	}
	.home-wrap h1 {
		font-size: 42px;
		line-height: 1.08;
		letter-spacing: -0.065em;
		margin: 0 0 14px;
	}
	.intro {
		max-width: 500px;
		color: #777;
		margin: 0 0 43px;
	}
	.home-composer {
		background: #fff;
		border: 1px solid #cfcfca;
		border-radius: 11px;
		padding: 15px;
		box-shadow: 0 10px 30px #00000008;
	}
	.home-composer textarea {
		display: block;
		width: 100%;
		height: 72px;
		border: 0;
		outline: 0;
		resize: none;
		font: 16px/1.5 inherit;
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
	.control span {
		color: #aaa;
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
		text-decoration: none;
	}
	.example-row {
		display: flex;
		gap: 8px;
		flex-wrap: wrap;
		margin-top: 18px;
	}
	.example-row button {
		border: 1px solid #e4e4e0;
		background: transparent;
		color: #777;
		border-radius: 18px;
		padding: 7px 11px;
		font-size: 12px;
	}
	.example-row button:hover {
		color: #222;
		background: #f1f1ee;
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
		.home-wrap {
			padding: 10vh 18px;
		}
		.home-wrap h1 {
			font-size: 34px;
		}
		.composer-row {
			flex-wrap: wrap;
		}
		.send-button {
			height: 32px;
		}
	}
</style>
