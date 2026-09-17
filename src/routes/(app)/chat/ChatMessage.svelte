<script lang="ts">
	import { Check, Clipboard, ChevronDown, Paperclip, RotateCcw, Sparkles } from '@lucide/svelte';
	import Markdown from '$lib/components/Markdown.svelte';
	import * as Bubble from '$lib/components/ui/bubble';
	import * as Message from '$lib/components/ui/message';
	import type { SkillSummary } from '$lib/skills';
	import ToolCallPanel from './ToolCallPanel.svelte';
	import {
		contentText,
		formatFileSize,
		formatTime,
		formatToolLabel,
		thinkingText
	} from './chat-format';
	import type {
		ConsentSubmitHandler,
		ConversationMessage,
		QuestionSubmitHandler,
		TurnSource
	} from './chat-types';

	type Props = {
		message: ConversationMessage;
		skill?: SkillSummary | null;
		sources?: TurnSource[];
		isLast?: boolean;
		canRetry?: boolean;
		running?: boolean;
		retryDisabled?: boolean;
		onretry?: () => void;
		canRegenerate?: boolean;
		regenerateDisabled?: boolean;
		onregenerate?: () => void;
		onquestionsubmit?: QuestionSubmitHandler;
		onconsentsubmit?: ConsentSubmitHandler;
	};

	let {
		message,
		skill = null,
		sources = [],
		isLast = false,
		canRetry = false,
		running = false,
		retryDisabled = false,
		onretry,
		canRegenerate = false,
		regenerateDisabled = false,
		onregenerate,
		onquestionsubmit,
		onconsentsubmit
	}: Props = $props();

	// While the thinking block streams it renders as a fixed-height scroller, so
	// follow the text down like the transcript does — but stop once the reader
	// scrolls back up, and resume when they return to the bottom.
	const THINKING_SCROLL_THRESHOLD = 24;
	let thinkingEl = $state<HTMLDivElement | null>(null);
	let thinkingPinned = $state(true);

	/**
	 * A finished assistant reply with no text and no tool call: the turn ended
	 * before an answer was written (see the server's turn outcome).
	 */
	const incompleteReply = $derived(
		message.role === 'assistant' &&
			!message.isStreaming &&
			!contentText(message.content).trim() &&
			(message.toolCalls?.length ?? 0) === 0
	);

	function handleThinkingScroll() {
		if (!thinkingEl) return;
		thinkingPinned =
			thinkingEl.scrollHeight - thinkingEl.scrollTop - thinkingEl.clientHeight <
			THINKING_SCROLL_THRESHOLD;
	}

	$effect(() => {
		const streaming = message.isStreaming && !contentText(message.content);
		if (!streaming || !thinkingText(message.content) || !thinkingPinned) return;
		if (thinkingEl) thinkingEl.scrollTop = thinkingEl.scrollHeight;
	});

	let copyStatus = $state<'idle' | 'copied' | 'failed'>('idle');

	async function copyResponse() {
		try {
			if (!navigator.clipboard) throw new Error('Clipboard unavailable');
			await navigator.clipboard.writeText(contentText(message.content));
			copyStatus = 'copied';
		} catch {
			copyStatus = 'failed';
		}
	}
</script>

<Message.Root
	align={message.role === 'user' ? 'end' : 'start'}
	class="chat-message"
	role="article"
	aria-label={`${message.role === 'user' ? 'Your' : 'Mimin'} message`}
>
	<Message.Content class="chat-message-content">
		<Message.Header class="chat-message-header">
			<span class="sender-name">{message.role === 'user' ? 'You' : 'Mimin'}</span>
			{#if skill}<span class="skill-badge">{skill.name}</span>{/if}
			<time datetime={message.createdAt}>{formatTime(message.createdAt)}</time>
			{#if message.role === 'assistant' && message.isStreaming}
				<span class="live-tag" role="status">
					{#if message.toolCalls?.some((t) => t.status === 'running')}
						{formatToolLabel(
							message.toolCalls.find((t) => t.status === 'running')!.toolName,
							message.toolCalls.find((t) => t.status === 'running')!.input
						).action.toLowerCase()}
					{:else if thinkingText(message.content) && !contentText(message.content)}
						thinking...
					{:else if contentText(message.content)}
						responding...
					{:else}
						working...
					{/if}
				</span>
			{/if}
		</Message.Header>
		<Bubble.Root variant={message.role === 'user' ? 'secondary' : 'ghost'} class="chat-bubble">
			<Bubble.Content class="chat-bubble-content">
				{#if message.attachments?.length}
					<div class="attachment-list message-attachments" aria-label="Attached files">
						{#each message.attachments as attachment (attachment.id)}
							<div class="attachment-chip">
								<Paperclip size={13} aria-hidden="true" />
								<span>{attachment.filename}</span><small>
									{formatFileSize(
										attachment.sizeBytes
									)}{#if attachment.extractionStatus === 'failed'}
										· text unavailable{:else if attachment.extractionStatus === 'empty'}
										· no text{:else if attachment.extractionStatus}
										· ready{/if}
								</small>
							</div>
						{/each}
					</div>
				{/if}
				{#if message.role === 'assistant' && thinkingText(message.content)}
					<details
						class="thinking-block"
						open={message.isStreaming && !contentText(message.content)}
					>
						<summary class="thinking-summary">
							<Sparkles size={13} />
							<span>Thinking process</span>
							{#if message.isStreaming && !contentText(message.content)}
								<span class="thinking-live-dot"></span>
							{/if}
							<ChevronDown size={13} class="chevron" />
						</summary>
						<div class="thinking-content" bind:this={thinkingEl} onscroll={handleThinkingScroll}>
							{thinkingText(message.content)}
						</div>
					</details>
				{/if}
				{#if contentText(message.content)}
					{#if message.role === 'assistant' && message.isStreaming}
						<p class="response-text streaming-plain-text">{contentText(message.content)}</p>
					{:else if message.role === 'assistant'}
						<Markdown content={contentText(message.content)} {sources} />
					{:else}
						<p>{contentText(message.content)}</p>
					{/if}
				{:else if message.role === 'assistant' && message.isStreaming && !thinkingText(message.content) && (!message.toolCalls || message.toolCalls.length === 0)}
					<p class="response-text thinking"><span class="pulse-dot"></span> Thinking...</p>
				{:else if incompleteReply}
					<p class="response-text incomplete-reply">
						{message.stopReason === 'length'
							? 'This reply stopped before writing an answer: the model used its whole output budget on reasoning.'
							: 'This reply stopped before writing an answer: only reasoning was produced.'}
					</p>
				{/if}
				{#if message.toolCalls && message.toolCalls.length > 0}
					<ToolCallPanel
						toolCalls={message.toolCalls}
						{running}
						{onquestionsubmit}
						{onconsentsubmit}
					/>
				{/if}
			</Bubble.Content>
		</Bubble.Root>
		{#if (message.role === 'user' && isLast && canRetry) || (message.role === 'assistant' && !message.isStreaming && contentText(message.content))}
			<Message.Footer class="chat-message-footer" aria-label="Message actions">
				{#if message.role === 'user' && isLast && canRetry}
					<button
						type="button"
						class="message-retry-btn"
						onclick={onretry}
						disabled={retryDisabled}
						title="Retry last message"
						aria-label="Retry last message"
					>
						<RotateCcw size={12} aria-hidden="true" /> Retry
					</button>
				{:else if message.role === 'assistant'}
					<button
						type="button"
						class="message-action-btn"
						onclick={copyResponse}
						aria-label="Copy response"
						data-tooltip={copyStatus === 'copied' ? 'Copied' : 'Copy response'}
					>
						{#if copyStatus === 'copied'}<Check size={14} aria-hidden="true" />{:else}<Clipboard
								size={14}
								aria-hidden="true"
							/>{/if}
					</button>
					{#if isLast && canRegenerate}
						<button
							type="button"
							class="message-action-btn"
							onclick={onregenerate}
							disabled={regenerateDisabled}
							aria-label="Regenerate response"
							data-tooltip="Regenerate"
						>
							<RotateCcw size={14} aria-hidden="true" />
						</button>
					{/if}
					{#if copyStatus !== 'idle'}
						<span class="sr-only" role="status" aria-live="polite">
							{copyStatus === 'copied'
								? 'Response copied to clipboard.'
								: 'Could not copy response. Try again.'}
						</span>
					{/if}
				{/if}
			</Message.Footer>
		{/if}
	</Message.Content>
</Message.Root>

<style>
	.skill-badge {
		display: inline-flex;
		align-items: center;
		gap: 6px;
		max-width: 100%;
		padding: 3px 8px;
		border: 1px solid var(--border);
		border-radius: 6px;
		background: var(--surface-subtle);
		color: var(--text);
		font-size: var(--text-body-sm);
		line-height: var(--text-body-sm--line-height);
		letter-spacing: var(--text-body-sm--letter-spacing);
		font-weight: 500;
	}
	:global(.chat-message) {
		padding: 12px 0;
	}
	:global(.chat-message-content) {
		gap: 6px;
	}
	:global(.chat-message[data-align='end'] .chat-message-content) {
		align-items: flex-end;
	}
	:global(.chat-message-header) {
		gap: 8px;
		padding-inline: 0;
	}
	:global(.chat-message[data-align='end'] .chat-message-header) {
		justify-content: flex-end;
	}
	.sender-name {
		color: var(--text-strong);
		font-weight: 500;
	}
	time {
		color: var(--text-faint);
		font-variant-numeric: tabular-nums;
	}
	:global(.chat-bubble[data-variant='ghost']) {
		width: 100%;
	}
	:global(.chat-bubble[data-variant='secondary']) {
		max-width: min(80%, 640px);
	}
	:global(.chat-bubble-content) {
		font-size: var(--text-body-lg);
		line-height: var(--text-body-lg--line-height);
		letter-spacing: var(--text-body-lg--letter-spacing);
	}
	:global(.chat-bubble[data-variant='secondary'] .chat-bubble-content) {
		background: var(--surface-2);
		border: 1px solid var(--border);
		color: var(--text-body);
		padding: 11px 14px;
		border-radius: 14px 14px 5px 14px;
	}
	:global(.chat-bubble[data-variant='ghost'] .chat-bubble-content) {
		color: var(--text-body);
	}
	:global(.chat-bubble-content) p {
		margin: 0;
		color: var(--text-body);
		line-height: var(--text-body-lg--line-height);
		white-space: pre-wrap;
		font-family: var(--font-body);
	}
	.attachment-list {
		display: flex;
		flex-wrap: wrap;
		gap: 6px;
		margin-bottom: 10px;
	}
	.attachment-chip {
		display: inline-flex;
		align-items: center;
		gap: 6px;
		max-width: 100%;
		padding: 6px 8px;
		border: 1px solid var(--border);
		border-radius: 6px;
		background: var(--surface-subtle);
		color: var(--text-body);
		font-size: var(--text-body-sm);
		line-height: var(--text-body-sm--line-height);
		letter-spacing: var(--text-body-sm--letter-spacing);
	}
	.attachment-chip span {
		max-width: 220px;
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
	}
	.attachment-chip small {
		font-size: var(--text-label-sm);
		line-height: var(--text-label-sm--line-height);
		letter-spacing: var(--text-label-sm--letter-spacing);
		color: var(--text-faint);
		white-space: nowrap;
	}
	.message-attachments {
		margin-bottom: 12px;
	}
	.response-text {
		margin: 0;
		line-height: var(--text-body-lg--line-height);
		white-space: pre-wrap;
	}
	.incomplete-reply {
		color: var(--status-working-text);
		font-size: var(--text-body-md);
		line-height: var(--text-body-md--line-height);
		letter-spacing: var(--text-body-md--letter-spacing);
	}
	:global(.chat-message-footer) {
		gap: 4px;
		padding-inline: 0;
	}
	.message-action-btn {
		position: relative;
		display: inline-flex;
		align-items: center;
		justify-content: center;
		width: 28px;
		height: 28px;
		padding: 0;
		border: 0;
		border-radius: 6px;
		background: transparent;
		color: var(--text-muted);
		font-size: var(--text-body-sm);
		line-height: var(--text-body-sm--line-height);
		letter-spacing: var(--text-body-sm--letter-spacing);
		cursor: pointer;
	}
	.message-action-btn:hover:not(:disabled) {
		color: var(--text);
		background: var(--surface-hover);
	}
	.message-action-btn:disabled {
		opacity: 0.5;
		cursor: not-allowed;
	}
	/* Icon-only buttons reveal their label on hover/focus. */
	.message-action-btn[data-tooltip]::after {
		content: attr(data-tooltip);
		position: absolute;
		bottom: calc(100% + 6px);
		left: 50%;
		padding: 3px 7px;
		border-radius: 4px;
		background: var(--accent-bg);
		color: var(--accent-fg);
		font-size: var(--text-body-sm);
		line-height: var(--text-body-sm--line-height);
		letter-spacing: var(--text-body-sm--letter-spacing);
		white-space: nowrap;
		opacity: 0;
		pointer-events: none;
		transform: translateX(-50%);
		transition: opacity 0.12s ease;
		z-index: 20;
	}
	.message-action-btn[data-tooltip]:hover::after,
	.message-action-btn[data-tooltip]:focus-visible::after {
		opacity: 1;
		transition-delay: 0.3s;
	}
	.sr-only {
		position: absolute;
		width: 1px;
		height: 1px;
		padding: 0;
		margin: -1px;
		overflow: hidden;
		clip: rect(0, 0, 0, 0);
		white-space: nowrap;
		border: 0;
	}
	.message-retry-btn {
		display: inline-flex;
		align-items: center;
		gap: 4px;
		padding: 5px 8px;
		font-size: var(--text-body-sm);
		line-height: var(--text-body-sm--line-height);
		letter-spacing: var(--text-body-sm--letter-spacing);
		color: var(--text-muted);
		background: var(--surface-subtle);
		border: 1px solid var(--border);
		border-radius: 4px;
		cursor: pointer;
		transition: all 0.15s ease;
	}
	.message-retry-btn:hover:not(:disabled) {
		color: var(--text);
		border-color: var(--border-hover);
		background: var(--surface-hover);
	}
	.message-retry-btn:disabled {
		opacity: 0.5;
		cursor: not-allowed;
	}
	.thinking-block {
		margin-bottom: 10px;
		border: 1px solid var(--border);
		background: var(--surface-subtle);
		border-radius: 7px;
		font-size: var(--text-body-md);
		line-height: var(--text-body-md--line-height);
		letter-spacing: var(--text-body-md--letter-spacing);
		overflow: hidden;
	}
	.thinking-summary {
		display: flex;
		align-items: center;
		gap: 6px;
		padding: 7px 11px;
		cursor: pointer;
		color: var(--text-muted);
		font-size: var(--text-body-sm);
		line-height: var(--text-body-sm--line-height);
		letter-spacing: var(--text-body-sm--letter-spacing);
		font-weight: 500;
		user-select: none;
		list-style: none;
	}
	.thinking-summary::-webkit-details-marker {
		display: none;
	}
	.thinking-summary:hover {
		color: var(--text-strong);
		background: var(--surface-hover);
	}
	:global(.thinking-summary .chevron) {
		margin-left: auto;
		transition: transform 0.18s ease;
	}
	details[open] > .thinking-summary :global(.chevron) {
		transform: rotate(180deg);
	}
	.thinking-live-dot {
		width: 6px;
		height: 6px;
		border-radius: 50%;
		background: var(--accent-bg);
		animation: pulse-glow 1s ease-in-out infinite;
	}
	.thinking-content {
		padding: 8px 12px 10px;
		border-top: 1px solid var(--border);
		color: var(--text-dim);
		font-size: var(--text-body-sm);
		line-height: var(--text-body-sm--line-height);
		letter-spacing: var(--text-body-sm--letter-spacing);
		white-space: pre-wrap;
		font-family: var(--font-mono);
		max-height: 260px;
		overflow-y: auto;
	}
	.live-tag {
		font-size: var(--text-body-sm);
		line-height: var(--text-body-sm--line-height);
		letter-spacing: var(--text-body-sm--letter-spacing);
		color: var(--text-dim);
		font-style: italic;
		word-break: break-word;
	}
	.thinking {
		display: inline-flex;
		align-items: center;
		gap: 8px;
		color: var(--text-muted);
		font-style: italic;
	}
	.pulse-dot {
		width: 7px;
		height: 7px;
		border-radius: 50%;
		background: var(--accent-bg);
		animation: pulse-glow 1.4s ease-in-out infinite;
	}
	@keyframes pulse-glow {
		0%,
		100% {
			opacity: 0.3;
			transform: scale(0.85);
		}
		50% {
			opacity: 1;
			transform: scale(1.2);
		}
	}
	@media (max-width: 760px) {
		:global(.chat-bubble[data-variant='secondary']) {
			max-width: 92%;
		}
	}
</style>
