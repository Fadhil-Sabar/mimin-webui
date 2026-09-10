<script lang="ts">
	import { ShieldCheck, Check, X, Globe } from '@lucide/svelte';
	import type { ConsentDecision, ConsentState } from '$lib/client/consent-state';

	export type BrowserConsentDecision = ConsentDecision;
	export type BrowserConsentState = ConsentState;

	type ToolCall = {
		input?: unknown;
		consent?: BrowserConsentState;
		[key: string]: unknown;
	};

	type Props = {
		toolCall: ToolCall;
		active?: boolean;
		disabled?: boolean;
		summary?: string;
		onsubmit?: (decision: BrowserConsentDecision) => Promise<void> | void;
	};

	let { toolCall, active = false, disabled = false, summary = '', onsubmit }: Props = $props();

	let consent = $derived(toolCall.consent);
	let decision = $derived(consent?.decision);
	let isSubmitting = $state(false);
	let submitError = $state('');

	// Keys are tool names, matching the tool chip the user sees in the transcript.
	const ACTION_LABELS: Record<string, string> = {
		browser_tabs: 'list your open tabs',
		browser_read_tab: 'read a tab',
		browser_interact: 'click, type, or navigate in a tab',
		browser_open: 'open a page',
		browser_search: 'search in your browser'
	};

	let actionLabel = $derived(
		(consent?.action && ACTION_LABELS[consent.action]) || 'access your browser'
	);

	let targetLabel = $derived.by(() => {
		const target = consent?.title || consent?.url;
		if (target) return target;
		if (consent?.tabId !== undefined) return `tab ${consent.tabId}`;
		return '';
	});

	let rawInput = $derived(
		toolCall.input && typeof toolCall.input === 'object'
			? (toolCall.input as Record<string, unknown>)
			: {}
	);

	let inputSummary = $derived.by(() => {
		const parts: string[] = [];
		if (typeof rawInput.action === 'string' && rawInput.action !== 'read')
			parts.push(`action: ${rawInput.action}`);
		if (rawInput.ref !== undefined) parts.push(`ref ${rawInput.ref}`);
		if (typeof rawInput.selector === 'string') parts.push(`selector: ${rawInput.selector}`);
		if (typeof rawInput.text === 'string' && rawInput.text)
			parts.push(`text: "${rawInput.text.slice(0, 60)}"`);
		return parts.join(' · ');
	});

	async function submit(next: BrowserConsentDecision) {
		if (!active || disabled || isSubmitting || !consent) return;
		submitError = '';
		isSubmitting = true;
		try {
			await onsubmit?.(next);
		} catch (error) {
			submitError = error instanceof Error ? error.message : 'Failed to submit';
		} finally {
			isSubmitting = false;
		}
	}
</script>

<div
	class="consent-card"
	class:is-active={active}
	class:is-allowed={decision === 'once' || decision === 'conversation'}
	class:is-denied={decision === 'deny'}
>
	<div class="consent-header">
		<div class="header-icon">
			<ShieldCheck size={16} />
		</div>
		<div class="header-text">
			<div class="header-title-row">
				<span class="header-title">
					{#if active}
						Browser access needed
					{:else if decision === 'deny'}
						Browser access denied
					{:else if decision}
						Browser access allowed
					{:else}
						Browser access
					{/if}
				</span>
				<span class="header-status-badge {active ? 'running' : decision ? 'completed' : 'failed'}">
					{#if active}
						<span class="pulse-dot"></span> Waiting for your answer
					{:else if decision === 'conversation'}
						Allowed for this chat
					{:else if decision === 'once'}
						Allowed once
					{:else if decision === 'deny'}
						Denied
					{:else}
						Expired
					{/if}
				</span>
			</div>
			<p class="header-sub">
				{#if active}
					Mimin wants to {actionLabel}{targetLabel ? ` — ${targetLabel}` : ''}. Choose how long this
					is allowed.
				{:else if decision === 'conversation'}
					Mimin may {actionLabel} in this chat without asking again.
				{:else if decision === 'once'}
					Mimin was allowed to {actionLabel} one time.
				{:else if decision === 'deny'}
					You declined this browser access request.
				{:else}
					This request ended before you answered.
				{/if}
			</p>
		</div>
	</div>

	{#if active}
		<div class="consent-body">
			<div class="target-row">
				<Globe size={13} />
				<span class="target-text">{targetLabel || 'Your browser tabs'}</span>
			</div>
			{#if inputSummary}
				<p class="input-summary">{inputSummary}</p>
			{/if}
			{#if submitError}
				<div class="submit-error" role="alert">{submitError}</div>
			{/if}
			<div class="consent-actions">
				<button
					type="button"
					class="btn btn-deny"
					disabled={disabled || isSubmitting}
					onclick={() => submit('deny')}
				>
					<X size={13} /> Deny
				</button>
				<button
					type="button"
					class="btn btn-once"
					disabled={disabled || isSubmitting}
					onclick={() => submit('once')}
				>
					Allow just once
				</button>
				<button
					type="button"
					class="btn btn-conversation"
					disabled={disabled || isSubmitting}
					onclick={() => submit('conversation')}
				>
					<Check size={13} /> Allow for this conversation
				</button>
			</div>
		</div>
	{:else if decision !== 'deny' && summary}
		<div class="consent-result">
			<span class="result-label">Result</span>
			<span class="result-text">{summary}</span>
		</div>
	{/if}
</div>

<style>
	.consent-card {
		display: flex;
		flex-direction: column;
		gap: 10px;
		margin: 8px 0;
		padding: 12px 14px;
		background: var(--surface-subtle);
		border: 1px solid var(--border-strong);
		border-radius: 9px;
		transition:
			border-color 0.2s ease,
			box-shadow 0.2s ease;
	}

	.consent-card.is-active {
		border-color: color-mix(in srgb, var(--status-working-dot) 45%, transparent);
		background: color-mix(in srgb, var(--surface-3) 30%, var(--surface-subtle));
		box-shadow: 0 4px 16px var(--shadow-soft);
	}

	.consent-card.is-allowed {
		border-color: color-mix(in srgb, var(--status-ok-dot) 35%, transparent);
	}

	.consent-card.is-denied {
		border-color: color-mix(in srgb, var(--danger-bg) 35%, transparent);
	}

	.consent-header {
		display: flex;
		align-items: flex-start;
		gap: 10px;
	}

	.header-icon {
		display: flex;
		align-items: center;
		justify-content: center;
		width: 26px;
		height: 26px;
		border-radius: 5px;
		background: var(--surface-3);
		color: var(--text-dim);
		flex-shrink: 0;
		margin-top: 1px;
	}

	.is-active .header-icon {
		background: color-mix(in srgb, var(--status-working-dot) 18%, transparent);
		color: var(--status-working-text);
	}

	.is-allowed .header-icon {
		background: color-mix(in srgb, var(--status-ok-dot) 15%, transparent);
		color: var(--status-ok-text);
	}

	.header-text {
		display: flex;
		flex-direction: column;
		gap: 2px;
		flex: 1;
		min-width: 0;
	}

	.header-title-row {
		display: flex;
		align-items: center;
		justify-content: space-between;
		gap: 8px;
		flex-wrap: wrap;
	}

	.header-title {
		font-size: var(--text-sm, 13px);
		font-weight: 600;
		color: var(--text-strong);
	}

	.header-status-badge {
		display: inline-flex;
		align-items: center;
		gap: 4px;
		font-size: 0.6875rem;
		font-weight: 500;
		padding: 2px 7px;
		border-radius: 4px;
		background: var(--surface-3);
		color: var(--text-muted);
		border: 1px solid var(--border);
	}

	.header-status-badge.running {
		color: var(--status-working-text);
		background: color-mix(in srgb, var(--status-working-dot) 15%, transparent);
		border-color: color-mix(in srgb, var(--status-working-dot) 30%, transparent);
	}

	.header-status-badge.completed {
		color: var(--status-ok-text);
		background: color-mix(in srgb, var(--status-ok-dot) 15%, transparent);
		border-color: color-mix(in srgb, var(--status-ok-dot) 30%, transparent);
	}

	.header-status-badge.failed {
		color: var(--text-muted);
	}

	.pulse-dot {
		display: inline-block;
		width: 6px;
		height: 6px;
		border-radius: 50%;
		background: currentColor;
		animation: pulse 1.5s infinite ease-in-out;
	}

	@keyframes pulse {
		0%,
		100% {
			opacity: 1;
			transform: scale(1);
		}
		50% {
			opacity: 0.4;
			transform: scale(0.85);
		}
	}

	.header-sub {
		margin: 0;
		font-size: var(--text-xs, 12px);
		color: var(--text-muted);
		line-height: 1.35;
	}

	.consent-body {
		display: flex;
		flex-direction: column;
		gap: 8px;
		padding: 8px 10px;
		border-radius: 6px;
		background: var(--surface);
		border: 1px solid var(--border);
	}

	.target-row {
		display: flex;
		align-items: center;
		gap: 6px;
		font-size: var(--text-xs, 12px);
		color: var(--text-strong);
		word-break: break-all;
	}

	.target-text {
		min-width: 0;
	}

	.input-summary {
		margin: 0;
		font-size: 11px;
		color: var(--text-muted);
		word-break: break-word;
	}

	.consent-actions {
		display: flex;
		align-items: center;
		justify-content: flex-end;
		gap: 8px;
		flex-wrap: wrap;
	}

	.btn {
		display: inline-flex;
		align-items: center;
		gap: 5px;
		padding: 6px 12px;
		border-radius: 6px;
		font-size: var(--text-xs, 12px);
		font-weight: 500;
		cursor: pointer;
		border: 1px solid var(--border);
		background: transparent;
		color: var(--text-muted);
		transition:
			background 0.15s ease,
			border-color 0.15s ease,
			color 0.15s ease,
			opacity 0.15s ease;
	}

	.btn:hover:not(:disabled) {
		color: var(--text-strong);
		background: var(--surface-hover);
		border-color: var(--border-strong);
	}

	.btn-conversation {
		border-color: var(--accent-bg);
		background: var(--accent-bg);
		color: var(--accent-fg);
	}

	.btn-conversation:hover:not(:disabled) {
		background: var(--accent-bg-hover);
		border-color: var(--accent-bg-hover);
		color: var(--accent-fg);
	}

	.btn-deny:hover:not(:disabled) {
		color: var(--danger-text);
		border-color: color-mix(in srgb, var(--danger-bg) 40%, transparent);
		background: transparent;
	}

	.btn:disabled {
		opacity: 0.5;
		cursor: not-allowed;
	}

	.consent-result {
		display: flex;
		align-items: center;
		gap: 6px;
		font-size: 11px;
		color: var(--text-muted);
	}

	.result-label {
		font-weight: 500;
		color: var(--text-dim);
	}

	.submit-error {
		font-size: 11px;
		color: var(--danger-text);
	}
</style>
