<script lang="ts">
	import { CircleQuestionMark, Check, Send } from '@lucide/svelte';

	export type QuestionOption = {
		label: string;
		description?: string;
	};

	export type QuestionItem = {
		id?: string;
		question: string;
		options?: Array<string | QuestionOption>;
		isMultiSelect?: boolean;
	};

	export type QuestionAnswer = {
		questionIndex?: number;
		question?: string;
		selected?: string[];
		custom?: string;
	};

	type ToolCall = {
		input?: unknown;
		output?: unknown;
		status: 'pending' | 'running' | 'completed' | 'failed' | string;
		[key: string]: unknown;
	};

	type Props = {
		toolCall: ToolCall;
		active?: boolean;
		disabled?: boolean;
		onsubmit?: (data: { answers: QuestionAnswer[]; skipped?: boolean }) => Promise<void> | void;
	};

	let { toolCall, active = false, disabled = false, onsubmit }: Props = $props();

	let rawInput = $derived(
		toolCall.input && typeof toolCall.input === 'object'
			? (toolCall.input as Record<string, unknown>)
			: {}
	);

	let questions = $derived<QuestionItem[]>(
		Array.isArray(rawInput.questions)
			? (rawInput.questions as QuestionItem[])
			: typeof rawInput.question === 'string'
				? [
						{
							question: rawInput.question,
							options: Array.isArray(rawInput.options)
								? (rawInput.options as Array<string | QuestionOption>)
								: undefined,
							isMultiSelect: Boolean(rawInput.isMultiSelect || rawInput.is_multi_select)
						}
					]
				: []
	);

	let rawOutput = $derived(
		toolCall.output && typeof toolCall.output === 'object'
			? (toolCall.output as Record<string, unknown>)
			: {}
	);

	let outputDetails = $derived(
		rawOutput.details && typeof rawOutput.details === 'object'
			? (rawOutput.details as Record<string, unknown>)
			: undefined
	);

	let completedAnswers = $derived<QuestionAnswer[]>(
		outputDetails && Array.isArray(outputDetails.answers)
			? (outputDetails.answers as QuestionAnswer[])
			: []
	);

	let isSkipped = $derived(Boolean(outputDetails?.skipped));

	// State for user selections when active
	let selections = $state<Record<number, string[]>>({});
	let customTexts = $state<Record<number, string>>({});
	let isSubmitting = $state(false);
	let submitError = $state('');

	function normalizeOption(option: string | QuestionOption): QuestionOption {
		if (typeof option === 'string') {
			return { label: option };
		}
		return option;
	}

	function isOptionSelected(questionIdx: number, optionLabel: string): boolean {
		return (selections[questionIdx] || []).includes(optionLabel);
	}

	function toggleOption(questionIdx: number, optionLabel: string, isMultiSelect = false) {
		if (!active || disabled || isSubmitting) return;
		const current = selections[questionIdx] || [];
		if (isMultiSelect) {
			if (current.includes(optionLabel)) {
				selections[questionIdx] = current.filter((item) => item !== optionLabel);
			} else {
				selections[questionIdx] = [...current, optionLabel];
			}
		} else {
			if (current.includes(optionLabel)) {
				selections[questionIdx] = [];
			} else {
				selections[questionIdx] = [optionLabel];
			}
		}
	}

	let hasAnyInput = $derived(() => {
		for (let i = 0; i < questions.length; i++) {
			if (
				(selections[i] && selections[i].length > 0) ||
				(customTexts[i] && customTexts[i].trim())
			) {
				return true;
			}
		}
		return false;
	});

	async function handleSubmit(skipped = false) {
		if (!active || disabled || isSubmitting) return;
		submitError = '';
		isSubmitting = true;
		try {
			const answers: QuestionAnswer[] = questions.map((q, idx) => ({
				questionIndex: idx,
				question: q.question,
				selected: selections[idx] || [],
				custom: customTexts[idx]?.trim() || undefined
			}));

			await onsubmit?.({ answers, skipped });
		} catch (err) {
			submitError = err instanceof Error ? err.message : 'Failed to submit response';
		} finally {
			isSubmitting = false;
		}
	}
</script>

<div
	class="question-card"
	class:is-active={active}
	class:is-completed={toolCall.status === 'completed'}
	class:is-failed={toolCall.status === 'failed'}
>
	<div class="question-header">
		<div class="header-icon">
			<CircleQuestionMark size={16} />
		</div>
		<div class="header-text">
			<div class="header-title-row">
				<span class="header-title">
					{#if active}
						Clarification Needed
					{:else if toolCall.status === 'completed'}
						{#if isSkipped}
							Question Skipped
						{:else}
							Question Answered
						{/if}
					{:else}
						Question Prompt
					{/if}
				</span>
				<span class="header-status-badge {toolCall.status}">
					{#if active}
						<span class="pulse-dot"></span> Waiting for input
					{:else if toolCall.status === 'completed'}
						<Check size={11} /> {isSkipped ? 'Skipped' : 'Answered'}
					{:else}
						Expired
					{/if}
				</span>
			</div>
			<p class="header-sub">
				{#if active}
					The agent needs more details to proceed with your request.
				{:else if toolCall.status === 'completed'}
					Your response was provided to the agent.
				{:else}
					This question request has expired or was canceled.
				{/if}
			</p>
		</div>
	</div>

	<div class="question-body">
		{#if questions.length === 0}
			<p class="empty-notice">No questions specified in prompt.</p>
		{:else}
			{#each questions as q, qIdx (q.question + qIdx)}
				<div class="question-item">
					<div class="question-label">
						{#if questions.length > 1}
							<span class="q-number">{qIdx + 1}.</span>
						{/if}
						<span class="q-text">{q.question}</span>
						{#if q.isMultiSelect}
							<span class="multi-tag">Multi-select</span>
						{/if}
					</div>

					{#if active}
						<!-- Active state: Interactive choices -->
						{#if q.options && q.options.length > 0}
							<div class="options-grid">
								{#each q.options as opt, optIdx (typeof opt === 'string' ? opt : opt.label + optIdx)}
									{@const option = normalizeOption(opt)}
									{@const selected = isOptionSelected(qIdx, option.label)}
									<button
										type="button"
										class="option-pill"
										class:selected
										disabled={disabled || isSubmitting}
										onclick={() => toggleOption(qIdx, option.label, q.isMultiSelect)}
									>
										<div class="option-check">
											{#if selected}
												<Check size={12} />
											{/if}
										</div>
										<div class="option-content">
											<span class="option-label">{option.label}</span>
											{#if option.description}
												<span class="option-desc">{option.description}</span>
											{/if}
										</div>
									</button>
								{/each}
							</div>
						{/if}

						<div class="custom-input-wrapper">
							<input
								type="text"
								class="custom-input"
								placeholder={q.options?.length
									? 'Or provide a custom note / alternative...'
									: 'Type your answer here...'}
								bind:value={customTexts[qIdx]}
								disabled={disabled || isSubmitting}
								onkeydown={(e) => {
									if (e.key === 'Enter' && !e.shiftKey) {
										e.preventDefault();
										void handleSubmit(false);
									}
								}}
							/>
						</div>
					{:else if toolCall.status === 'completed'}
						<!-- Completed state: Show user selections -->
						{@const answer = completedAnswers.find(
							(a) => a.questionIndex === qIdx || a.question === q.question
						)}
						<div class="completed-summary">
							{#if isSkipped}
								<span class="skipped-tag">Skipped</span>
							{:else if answer && ((answer.selected && answer.selected.length > 0) || answer.custom)}
								{#if answer.selected && answer.selected.length > 0}
									<div class="selected-pills">
										{#each answer.selected as sel, selIdx (sel + selIdx)}
											<span class="selected-pill">
												<Check size={11} />
												{sel}
											</span>
										{/each}
									</div>
								{/if}
								{#if answer.custom}
									<div class="completed-custom-note">
										<span class="note-label">Custom note:</span> "{answer.custom}"
									</div>
								{/if}
							{:else}
								<span class="no-answer-tag">No answer provided</span>
							{/if}
						</div>
					{:else}
						<!-- Failed/expired state -->
						<div class="expired-summary">
							<span class="expired-tag">Question expired</span>
						</div>
					{/if}
				</div>
			{/each}
		{/if}
	</div>

	{#if active}
		<div class="question-footer">
			{#if submitError}
				<div class="submit-error" role="alert">{submitError}</div>
			{/if}
			<div class="footer-actions">
				<button
					type="button"
					class="btn-skip"
					disabled={disabled || isSubmitting}
					onclick={() => handleSubmit(true)}
				>
					Skip
				</button>
				<button
					type="button"
					class="btn-submit"
					disabled={disabled || isSubmitting || !hasAnyInput()}
					onclick={() => handleSubmit(false)}
				>
					<Send size={13} />
					<span>{isSubmitting ? 'Submitting...' : 'Submit Response'}</span>
				</button>
			</div>
		</div>
	{/if}
</div>

<style>
	.question-card {
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

	.question-card.is-active {
		border-color: color-mix(in srgb, var(--status-working-dot) 45%, transparent);
		background: color-mix(in srgb, var(--surface-3) 30%, var(--surface-subtle));
		box-shadow: 0 4px 16px var(--shadow-soft);
	}

	.question-header {
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
		color: var(--danger-text);
		background: color-mix(in srgb, var(--danger-bg) 15%, transparent);
		border-color: color-mix(in srgb, var(--danger-bg) 30%, transparent);
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

	.question-body {
		display: flex;
		flex-direction: column;
		gap: 10px;
		margin-top: 4px;
	}

	.question-item {
		display: flex;
		flex-direction: column;
		gap: 8px;
		padding: 8px 10px;
		border-radius: 6px;
		background: var(--surface);
		border: 1px solid var(--border);
	}

	.question-label {
		display: flex;
		align-items: center;
		gap: 6px;
		flex-wrap: wrap;
		font-size: var(--text-sm, 13px);
		font-weight: 500;
		color: var(--text-strong);
	}

	.q-number {
		color: var(--text-muted);
		font-weight: 600;
	}

	.multi-tag {
		font-size: 10px;
		font-weight: 500;
		text-transform: uppercase;
		letter-spacing: 0.04em;
		padding: 1px 5px;
		border-radius: 4px;
		background: var(--surface-3);
		color: var(--text-dim);
	}

	.options-grid {
		display: grid;
		grid-template-columns: repeat(auto-fill, minmax(200px, 1fr));
		gap: 8px;
		margin-top: 2px;
	}

	.option-pill {
		display: flex;
		align-items: flex-start;
		gap: 8px;
		padding: 8px 10px;
		border-radius: 6px;
		border: 1px solid var(--border);
		background: var(--surface-subtle);
		color: var(--text-body);
		text-align: left;
		cursor: pointer;
		transition:
			background 0.15s ease,
			border-color 0.15s ease,
			color 0.15s ease;
	}

	.option-pill:hover:not(:disabled) {
		border-color: var(--border-strong);
		background: var(--surface-hover);
		color: var(--text-strong);
	}

	.option-pill.selected {
		border-color: var(--accent-bg);
		background: color-mix(in srgb, var(--accent-bg) 8%, var(--surface));
		color: var(--text-strong);
	}

	.option-check {
		display: flex;
		align-items: center;
		justify-content: center;
		width: 16px;
		height: 16px;
		border-radius: 4px;
		border: 1px solid var(--border-strong);
		background: var(--surface);
		color: var(--text-muted);
		flex-shrink: 0;
		margin-top: 1px;
		transition:
			background 0.15s ease,
			border-color 0.15s ease,
			color 0.15s ease;
	}

	.option-pill.selected .option-check {
		background: var(--accent-bg);
		border-color: var(--accent-bg);
		color: var(--accent-fg);
	}

	.option-content {
		display: flex;
		flex-direction: column;
		gap: 2px;
		min-width: 0;
	}

	.option-label {
		font-size: var(--text-xs, 12px);
		font-weight: 500;
		color: var(--text-strong);
		line-height: 1.3;
	}

	.option-desc {
		font-size: 11px;
		color: var(--text-muted);
		line-height: 1.25;
	}

	.custom-input-wrapper {
		margin-top: 2px;
	}

	.custom-input {
		width: 100%;
		padding: 7px 10px;
		border-radius: 6px;
		border: 1px solid var(--border);
		background: var(--surface);
		color: var(--text);
		font-size: var(--text-xs, 12px);
		outline: none;
		transition: border-color 0.15s ease;
	}

	.custom-input:focus {
		border-color: var(--border-strong);
		outline: 2px solid var(--focus);
		outline-offset: 1px;
	}

	.completed-summary {
		display: flex;
		flex-direction: column;
		gap: 6px;
	}

	.selected-pills {
		display: flex;
		flex-wrap: wrap;
		gap: 6px;
	}

	.selected-pill {
		display: inline-flex;
		align-items: center;
		gap: 4px;
		font-size: 11px;
		font-weight: 500;
		padding: 2px 7px;
		border-radius: 4px;
		background: color-mix(in srgb, var(--status-ok-dot) 15%, transparent);
		color: var(--status-ok-text);
		border: 1px solid color-mix(in srgb, var(--status-ok-dot) 30%, transparent);
	}

	.completed-custom-note {
		font-size: 11px;
		color: var(--text-muted);
		font-style: italic;
	}

	.note-label {
		font-style: normal;
		font-weight: 500;
		color: var(--text-dim);
	}

	.skipped-tag,
	.no-answer-tag,
	.expired-tag {
		font-size: 11px;
		color: var(--text-muted);
		font-style: italic;
	}

	.question-footer {
		display: flex;
		flex-direction: column;
		gap: 8px;
		margin-top: 4px;
		padding-top: 8px;
		border-top: 1px solid var(--border);
	}

	.footer-actions {
		display: flex;
		align-items: center;
		justify-content: flex-end;
		gap: 8px;
	}

	.btn-skip {
		padding: 6px 12px;
		border-radius: 6px;
		border: 1px solid var(--border);
		background: transparent;
		color: var(--text-muted);
		font-size: var(--text-xs, 12px);
		cursor: pointer;
		transition:
			background 0.15s ease,
			color 0.15s ease,
			border-color 0.15s ease;
	}

	.btn-skip:hover:not(:disabled) {
		color: var(--text-strong);
		background: var(--surface-hover);
		border-color: var(--border-strong);
	}

	.btn-submit {
		display: inline-flex;
		align-items: center;
		gap: 6px;
		padding: 6px 14px;
		border-radius: 6px;
		border: 1px solid var(--accent-bg);
		background: var(--accent-bg);
		color: var(--accent-fg);
		font-size: var(--text-xs, 12px);
		font-weight: 500;
		cursor: pointer;
		transition:
			background 0.15s ease,
			border-color 0.15s ease,
			opacity 0.15s ease;
	}

	.btn-submit:hover:not(:disabled) {
		background: var(--accent-bg-hover);
		border-color: var(--accent-bg-hover);
		color: var(--accent-fg);
	}

	.btn-submit:disabled,
	.btn-skip:disabled {
		opacity: 0.5;
		cursor: not-allowed;
	}

	.submit-error {
		font-size: 11px;
		color: var(--danger-text);
	}

	.empty-notice {
		font-size: var(--text-xs, 12px);
		color: var(--text-muted);
		margin: 0;
	}
</style>
