<script lang="ts">
	import { Bot, ChevronDown, Paperclip, RotateCcw, Sparkles, UserRound } from '@lucide/svelte';
	import Markdown from '$lib/components/Markdown.svelte';
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
		onquestionsubmit,
		onconsentsubmit
	}: Props = $props();
</script>

<article
	class="message"
	class:assistant-message={message.role === 'assistant'}
	aria-label={`${message.role === 'user' ? 'Your' : 'Mimin'} message`}
>
	<div class="message-label">
		<div class="message-label-header">
			{#if message.role === 'user'}
				<UserRound size={14} aria-hidden="true" />
				<span>YOU</span>
			{:else}
				<Bot size={14} aria-hidden="true" />
				<span>MIMIN</span>
			{/if}
			{#if skill}<span class="skill-badge">{skill.name}</span>{/if}
			<time datetime={message.createdAt}>{formatTime(message.createdAt)}</time>
		</div>
		{#if message.role === 'user' && isLast && canRetry}
			<button
				type="button"
				class="message-retry-btn"
				onclick={onretry}
				disabled={retryDisabled}
				title="Retry last message"
				aria-label="Retry last message"
			>
				<RotateCcw size={11} aria-hidden="true" />
				<span>Retry</span>
			</button>
		{/if}
		{#if message.role === 'assistant' && message.isStreaming}
			<span class="live-tag">
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
	</div>
	<div class="message-body">
		{#if message.attachments?.length}
			<div class="attachment-list message-attachments" aria-label="Attached files">
				{#each message.attachments as attachment (attachment.id)}
					<div class="attachment-chip">
						<Paperclip size={13} aria-hidden="true" />
						<span>{attachment.filename}</span><small>
							{formatFileSize(attachment.sizeBytes)}{#if attachment.extractionStatus === 'failed'}
								· text unavailable{:else if attachment.extractionStatus === 'empty'}
								· no text{:else if attachment.extractionStatus}
								· ready{/if}
						</small>
					</div>
				{/each}
			</div>
		{/if}
		{#if message.role === 'assistant' && thinkingText(message.content)}
			<details class="thinking-block" open={message.isStreaming && !contentText(message.content)}>
				<summary class="thinking-summary">
					<Sparkles size={13} />
					<span>Thinking process</span>
					{#if message.isStreaming && !contentText(message.content)}
						<span class="thinking-live-dot"></span>
					{/if}
					<ChevronDown size={13} class="chevron" />
				</summary>
				<div class="thinking-content">{thinkingText(message.content)}</div>
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
		{/if}
		{#if message.toolCalls && message.toolCalls.length > 0}
			<ToolCallPanel toolCalls={message.toolCalls} {running} {onquestionsubmit} {onconsentsubmit} />
		{/if}
	</div>
</article>

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
		font-size: var(--text-xs);
		font-weight: 500;
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
	/* The preceding sibling lives in another instance of this component, so the
	   first compound cannot be verified statically. */
	:global(.assistant-message) + .message {
		border-top: 1px solid var(--border);
	}
	.message-label {
		display: flex;
		flex-direction: column;
		align-items: flex-start;
		gap: 3px;
		color: var(--text-dim);
		font-size: var(--text-xs);
		flex-shrink: 0;
		min-width: 0;
	}
	.message-label-header {
		display: flex;
		flex-wrap: wrap;
		max-width: 100%;
		align-items: center;
		gap: 6px;
		white-space: nowrap;
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
		font-size: var(--text-xs);
	}
	.attachment-chip span {
		max-width: 220px;
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
	}
	.attachment-chip small {
		color: var(--text-faint);
		white-space: nowrap;
	}
	.message-attachments {
		margin-bottom: 12px;
	}
	.assistant-message > div:last-child {
		min-width: 0;
	}
	.response-text {
		margin: 0;
		line-height: 1.6;
		white-space: pre-wrap;
	}
	.message-retry-btn {
		display: inline-flex;
		align-items: center;
		gap: 4px;
		margin-top: 4px;
		padding: 2px 7px;
		font-size: var(--text-xs);
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
		font-size: var(--text-sm);
		overflow: hidden;
	}
	.thinking-summary {
		display: flex;
		align-items: center;
		gap: 6px;
		padding: 7px 11px;
		cursor: pointer;
		color: var(--text-muted);
		font-size: var(--text-xs);
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
		font-size: var(--text-xs);
		line-height: 1.55;
		white-space: pre-wrap;
		font-family: var(--font-mono, monospace);
		max-height: 260px;
		overflow-y: auto;
	}
	.live-tag {
		font-size: var(--text-xs);
		color: var(--text-dim);
		font-style: italic;
		line-height: 1.35;
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
		.message {
			grid-template-columns: 1fr;
			gap: 6px;
		}
	}
</style>
