<script lang="ts">
	import { ChevronDown, PanelLeft, Search } from '@lucide/svelte';
	import ThemeToggle from '$lib/components/ThemeToggle.svelte';
	import { sidebar } from '$lib/client/sidebar.svelte';
	import { conversationSearch } from '$lib/client/conversations.svelte';
	import { modelId } from './chat-format';
	import type { Conversation } from './chat-types';

	type Props = {
		conversation?: Conversation | null;
		running?: boolean;
		activity?: string;
	};

	let { conversation = null, running = false, activity = '' }: Props = $props();
</script>

<header class="topbar">
	<div class="topbar-left">
		<button
			class="sidebar-toggle topbar-toggle"
			onclick={() => sidebar.toggle()}
			title="Toggle sidebar"
			aria-label="Toggle sidebar"><PanelLeft size={16} /></button
		>
		<div class="breadcrumb">
			<strong>Chat</strong><ChevronDown size={14} /><span
				>{conversation?.title ?? 'New session'}</span
			>
		</div>
	</div>
	<div class="top-actions">
		<button
			class="icon-button"
			aria-label="Search conversations"
			title="Search conversations (⌘O)"
			onclick={() => conversationSearch.open()}><Search size={17} /></button
		>
		<ThemeToggle />
	</div>
</header>
<div class="chat-title">
	<span class="ready" class:working={running}>
		<i></i>
		{running ? (activity ? `working · ${activity.toLowerCase()}` : 'working') : 'ready'}
	</span>
	<h1>{conversation?.title ?? 'New conversation'}</h1>
	<p>
		{conversation?.model ? modelId(conversation.model) : 'Pick a model'}{conversation &&
		conversation.enabledTools?.length
			? ` · ${conversation.enabledTools.join(', ')}`
			: ''}
	</p>
</div>

<style>
	.chat-title {
		padding-bottom: 24px;
		border-bottom: 1px solid var(--border);
	}
	.chat-title h1 {
		font-family: var(--font-body);
		font-size: var(--text-xl);
		font-weight: 600;
		line-height: 1.25;
		letter-spacing: -0.02em;
		color: var(--text-strong);
		margin: 8px 0 4px;
	}
	.chat-title p {
		color: var(--text-muted);
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
	@media (max-width: 760px) {
		.ready {
			float: none;
			display: inline-flex;
		}
	}
</style>
