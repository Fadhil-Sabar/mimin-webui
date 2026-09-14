<script lang="ts">
	import { ChevronDown, LayoutTemplate, PanelLeft, Search } from '@lucide/svelte';
	import ThemeToggle from '$lib/components/ThemeToggle.svelte';
	import { sidebar } from '$lib/client/sidebar.svelte';
	import { conversationSearch } from '$lib/client/conversations.svelte';
	import type { Conversation } from './chat-types';

	type Props = {
		conversation?: Conversation | null;
		canvasOpen?: boolean;
		hasCanvas?: boolean;
		canvasLoading?: boolean;
		ontogglecanvas?: () => void;
	};

	let {
		conversation = null,
		canvasOpen = false,
		hasCanvas = false,
		canvasLoading = false,
		ontogglecanvas
	}: Props = $props();
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
		{#if ontogglecanvas}
			<button
				class="canvas-toggle-btn"
				class:active={canvasOpen}
				disabled={canvasLoading}
				title={canvasOpen ? 'Close Canvas' : hasCanvas ? 'Open Canvas' : 'Create Canvas'}
				aria-label="Toggle Canvas"
				onclick={ontogglecanvas}
			>
				<LayoutTemplate size={16} />
				<span class="canvas-btn-text">{canvasLoading ? 'Loading…' : 'Canvas'}</span>
				{#if hasCanvas}<span class="canvas-active-dot"></span>{/if}
			</button>
		{/if}
		<button
			class="icon-button"
			aria-label="Search conversations"
			title="Search conversations (⌘O)"
			onclick={() => conversationSearch.open()}><Search size={17} /></button
		>
		<ThemeToggle />
	</div>
</header>

<style>
	.canvas-toggle-btn {
		display: inline-flex;
		align-items: center;
		gap: 6px;
		height: 32px;
		padding: 0 10px;
		border: 1px solid var(--border);
		background: var(--surface);
		border-radius: 6px;
		font-size: var(--text-xs);
		font-weight: 500;
		color: var(--text-muted);
		cursor: pointer;
		position: relative;
		transition:
			color 0.16s ease,
			background 0.16s ease,
			border-color 0.16s ease;
	}

	.canvas-toggle-btn:hover:not(:disabled) {
		background: var(--surface-hover);
		color: var(--text-strong);
		border-color: var(--border-strong);
	}

	.canvas-toggle-btn.active {
		background: var(--surface-3);
		border-color: var(--border-strong);
		color: var(--text-strong);
		font-weight: 550;
	}

	.canvas-toggle-btn:disabled {
		opacity: 0.6;
		cursor: wait;
	}

	.canvas-active-dot {
		width: 5px;
		height: 5px;
		border-radius: 50%;
		background: var(--status-ok-dot);
	}

	@media (max-width: 500px) {
		.canvas-btn-text {
			display: none;
		}
	}
</style>
