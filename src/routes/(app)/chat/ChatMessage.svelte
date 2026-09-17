<script lang="ts">
	import {
		AlertTriangle,
		Check,
		Clipboard,
		ChevronDown,
		Paperclip,
		RotateCcw,
		Sparkles
	} from '@lucide/svelte';
	import { untrack } from 'svelte';
	import Markdown from '$lib/components/Markdown.svelte';
	import * as Bubble from '$lib/components/ui/bubble';
	import * as Message from '$lib/components/ui/message';
	import { cn } from '$lib/utils.js';
	import type { SkillSummary } from '$lib/skills';
	import MessageContextLine from './MessageContextLine.svelte';
	import ToolCallPanel from './ToolCallPanel.svelte';
	import {
		contentText,
		formatFileSize,
		formatTime,
		formatToolLabel,
		isImageAttachment,
		messageContextSummary,
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
		/** Filenames attached to the user message this turn answers. */
		contextAttachments?: string[];
		projectName?: string | null;
		/** Display preference for the compact context line. */
		showContext?: boolean;
		/**
		 * Whether this instance appeared in a settled transcript — a message the reader
		 * just sent, or a reply that just streamed in — as opposed to arriving with a
		 * bulk load. See `animateEnter` for why it is read only once.
		 */
		enterMotion?: boolean;
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
		onconsentsubmit,
		contextAttachments = [],
		projectName = null,
		showContext = true,
		enterMotion = true
	}: Props = $props();

	/**
	 * Snapshotted at init rather than tracked reactively. The enter animation is a
	 * one-shot for elements created while the transcript is live, so the decision has
	 * to be frozen when the element mounts: a reactive class would be re-applied when
	 * the parent re-arms after a load and restart the animation on every message
	 * already on screen — the exact whole-thread flash the arming exists to prevent.
	 */
	const animateEnter = untrack(() => enterMotion);

	/** Short status suffix for an attachment chip; images carry no extraction state. */
	function attachmentStatusLabel(status?: string | null) {
		if (status === 'failed') return 'text unavailable';
		if (status === 'empty') return 'no text';
		if (status === 'image') return '';
		return status ? 'ready' : '';
	}

	// While the thinking block streams it renders as a fixed-height scroller, so
	// follow the text down like the transcript does — but stop once the reader
	// scrolls back up, and resume when they return to the bottom.
	const THINKING_SCROLL_THRESHOLD = 24;
	let thinkingEl = $state<HTMLDivElement | null>(null);
	let thinkingPinned = $state(true);

	/**
	 * A finished assistant reply with no text and no tool call: the turn ended
	 * before an answer was written (see the server's turn outcome). An interrupted
	 * turn gets its own notice instead, which says what actually happened.
	 */
	const incompleteReply = $derived(
		message.role === 'assistant' &&
			message.turnState !== 'interrupted' &&
			!message.isStreaming &&
			!contentText(message.content).trim() &&
			(message.toolCalls?.length ?? 0) === 0
	);

	/**
	 * The footer already offers Regenerate for the latest reply and it runs the same
	 * retry, so the notice only carries its own action when the footer will not.
	 */
	const showInterruptedRetry = $derived(canRetry && !(isLast && canRegenerate));

	/**
	 * The compact context line that shares the footer row with the message actions.
	 * It is gated on the display preference and on the turn having something
	 * substantive to report — a project name alone must not put a line on every reply.
	 */
	const context = $derived(
		showContext
			? messageContextSummary(message, { attachments: contextAttachments, skill, projectName })
			: null
	);

	const hasFooterActions = $derived(
		(message.role === 'user' && isLast && canRetry) ||
			(message.role === 'assistant' &&
				!message.isStreaming &&
				Boolean(contentText(message.content)))
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
	class={cn('chat-message', animateEnter && 'enter-motion')}
	role="article"
	aria-label={`${message.role === 'user' ? 'Your' : 'Mimin'} message`}
>
	<Message.Content class="chat-message-content">
		<Message.Header class="chat-message-header">
			<span class="sender-name">{message.role === 'user' ? 'You' : 'Mimin'}</span>
			{#if skill}<span class="skill-badge">{skill.name}</span>{/if}
			<time datetime={message.createdAt}>{formatTime(message.createdAt)}</time>
			{#if message.role === 'assistant' && message.isStreaming}
				<span class="live-tag shimmer-text" role="status">
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
							{#if isImageAttachment(attachment) && attachment.url}
								<!-- eslint-disable svelte/no-navigation-without-resolve -->
								<a
									class="attachment-thumb-link"
									href={attachment.url}
									target="_blank"
									rel="noreferrer"
									title={`${attachment.filename} · ${formatFileSize(attachment.sizeBytes)}`}
								>
									<img
										class="attachment-thumb"
										src={attachment.url}
										alt={attachment.filename}
										loading="lazy"
									/>
								</a>
								<!-- eslint-enable svelte/no-navigation-without-resolve -->
							{:else}
								<div class="attachment-chip">
									<Paperclip size={13} aria-hidden="true" />
									<span>{attachment.filename}</span><small>
										{formatFileSize(
											attachment.sizeBytes
										)}{#if attachmentStatusLabel(attachment.extractionStatus)}
											· {attachmentStatusLabel(attachment.extractionStatus)}{/if}
									</small>
								</div>
							{/if}
						{/each}
					</div>
				{/if}
				{#if message.role === 'assistant' && thinkingText(message.content)}
					<details
						class="thinking-block"
						open={message.isStreaming && !contentText(message.content)}
					>
						<summary class="thinking-summary state-layer">
							<Sparkles size={13} />
							<span class:shimmer-text={message.isStreaming && !contentText(message.content)}>
								Thinking process
							</span>
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
					<p class="response-text thinking"><span class="shimmer-text">Thinking...</span></p>
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
				{#if message.role === 'assistant' && message.turnState === 'interrupted'}
					<div class="interrupted-notice" role="status">
						<AlertTriangle size={13} aria-hidden="true" />
						<span>
							{contentText(message.content).trim()
								? 'This reply was interrupted before it finished.'
								: 'This turn was interrupted before writing an answer.'}
						</span>
						{#if showInterruptedRetry}
							<button
								type="button"
								class="interrupted-retry state-layer"
								onclick={onretry}
								disabled={retryDisabled}
							>
								<RotateCcw size={12} aria-hidden="true" /> Retry
							</button>
						{/if}
					</div>
				{/if}
			</Bubble.Content>
		</Bubble.Root>
		{#if hasFooterActions || context}
			<Message.Footer
				class="chat-message-footer"
				aria-label={hasFooterActions ? 'Message actions' : 'Message context'}
			>
				{#if hasFooterActions}
					<div class="footer-actions">
						{#if message.role === 'user' && isLast && canRetry}
							<button
								type="button"
								class="message-retry-btn state-layer"
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
								class="message-action-btn state-layer"
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
									class="message-action-btn state-layer"
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
					</div>
				{/if}
				{#if context}
					<MessageContextLine {context} />
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
	/* Gated on a class fixed at mount, so a bulk transcript load creates its messages
	 * without it and stays still, while a message appended to a settled transcript
	 * gets it and rises in. */
	:global(.chat-message.enter-motion) {
		animation: message-in var(--duration-medium1) var(--ease-emphasized-decelerate) backwards;
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
	.attachment-thumb-link {
		display: block;
		line-height: 0;
		border: 1px solid var(--border);
		border-radius: 8px;
		overflow: hidden;
		transition: border-color var(--duration-short3) var(--ease-standard);
	}
	.attachment-thumb-link:hover {
		border-color: var(--border-strong);
	}
	.attachment-thumb {
		display: block;
		max-width: 240px;
		max-height: 200px;
		width: auto;
		height: auto;
		object-fit: contain;
	}
	.response-text {
		margin: 0;
		line-height: var(--text-body-lg--line-height);
		white-space: pre-wrap;
	}
	/* A breathing caret is the live signal while tokens stream in. Animating the caret
	 * rather than the incoming text is deliberate: a per-token animation would restart
	 * on every SSE delta and jank badly. */
	.streaming-plain-text::after {
		content: '';
		display: inline-block;
		width: 2px;
		height: 1em;
		margin-left: 2px;
		vertical-align: text-bottom;
		background: var(--text-muted);
		animation: caret-fade 1.2s var(--ease-standard) infinite;
	}
	.incomplete-reply {
		color: var(--status-working-text);
		font-size: var(--text-body-md);
		line-height: var(--text-body-md--line-height);
		letter-spacing: var(--text-body-md--letter-spacing);
	}
	.interrupted-notice {
		display: flex;
		align-items: center;
		flex-wrap: wrap;
		gap: 8px;
		margin-top: 10px;
		padding: 7px 10px;
		border: 1px solid var(--border);
		border-radius: 8px;
		background: var(--surface-subtle);
		color: var(--status-working-text);
		font-size: var(--text-body-sm);
		line-height: var(--text-body-sm--line-height);
		letter-spacing: var(--text-body-sm--letter-spacing);
		font-weight: var(--text-body-sm--font-weight);
	}
	.interrupted-retry {
		display: inline-flex;
		align-items: center;
		gap: 4px;
		margin-left: auto;
		padding: 2px 8px;
		border: 1px solid var(--border-strong);
		border-radius: 6px;
		background: transparent;
		color: var(--text);
		font-size: var(--text-label-md);
		line-height: var(--text-label-md--line-height);
		letter-spacing: var(--text-label-md--letter-spacing);
		font-weight: var(--text-label-md--font-weight);
		cursor: pointer;
	}
	.interrupted-retry:hover:not(:disabled) {
		background: var(--surface-2);
	}
	.interrupted-retry:disabled {
		opacity: 0.5;
		cursor: not-allowed;
	}
	:global(.chat-message-footer) {
		gap: 4px;
		padding-inline: 0;
	}
	/* Gated on the same mount-time class as the message. A footer mounts together with
	 * its message on a bulk load, so animating every one of them would flash the whole
	 * thread — the thing the arming exists to prevent. For a message that arrived while
	 * the transcript was live the class is set, and the footer appears later, when the
	 * turn stops streaming: it rises in on the message's own keyframe, so the end of a
	 * turn reads as one beat. */
	:global(.chat-message.enter-motion .chat-message-footer) {
		animation: message-in var(--duration-short4) var(--ease-standard) backwards;
	}
	.footer-actions {
		display: flex;
		align-items: center;
		gap: 4px;
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
		transition: opacity var(--duration-short2) var(--ease-standard);
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
		transition:
			color var(--duration-short3) var(--ease-standard),
			background-color var(--duration-short3) var(--ease-standard),
			border-color var(--duration-short3) var(--ease-standard);
	}
	.message-retry-btn:hover:not(:disabled) {
		color: var(--text);
		border-color: var(--border-strong);
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
		transition: transform var(--duration-short4) var(--ease-standard);
	}
	details[open] > .thinking-summary :global(.chevron) {
		transform: rotate(180deg);
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
	/* No flex/gap here any more — the pulsing dot that needed centring is gone and the
	 * label carries the live signal itself, via `.shimmer-text`. */
	.thinking {
		color: var(--text-muted);
		font-style: italic;
	}
	@media (max-width: 760px) {
		:global(.chat-bubble[data-variant='secondary']) {
			max-width: 92%;
		}
	}
</style>
