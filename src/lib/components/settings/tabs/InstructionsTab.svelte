<script lang="ts">
	import { onMount } from 'svelte';
	import { Check, ChevronRight, Loader2, Trash2 } from '@lucide/svelte';

	type Props = {
		isDirty?: boolean;
		discard?: () => void;
	};

	// eslint-disable-next-line no-useless-assignment
	let { isDirty = $bindable(false), discard = $bindable() }: Props = $props();

	const MAX_LENGTH = 10000;

	let instructions = $state('');
	let savedInstructions = $state('');
	let loading = $state(true);
	let saving = $state(false);
	let notification = $state<{ type: 'success' | 'error'; message: string } | null>(null);
	let changed = $derived(instructions !== savedInstructions);
	let howItWorksOpen = $state(false);

	$effect(() => {
		isDirty = changed;
	});

	$effect(() => {
		discard = () => {
			instructions = savedInstructions;
		};
	});

	function notify(type: 'success' | 'error', message: string) {
		notification = { type, message };
		setTimeout(() => {
			if (notification?.message === message) notification = null;
		}, 4000);
	}

	async function loadInstructions() {
		try {
			const response = await fetch('/api/settings/instructions');
			const body = await response.json();
			if (!response.ok) throw new Error(body.error?.message ?? 'Could not load instructions');
			instructions = body.instructions ?? '';
			savedInstructions = instructions;
		} catch (error) {
			notify('error', error instanceof Error ? error.message : 'Could not load instructions');
		} finally {
			loading = false;
		}
	}

	async function saveInstructions() {
		const pendingInstructions = instructions;
		saving = true;
		try {
			const response = await fetch('/api/settings/instructions', {
				method: 'PUT',
				headers: { 'content-type': 'application/json' },
				body: JSON.stringify({ instructions: pendingInstructions })
			});
			const body = await response.json();
			if (!response.ok) throw new Error(body.error?.message ?? 'Could not save instructions');
			const normalizedInstructions = body.instructions ?? '';
			savedInstructions = normalizedInstructions;
			if (instructions === pendingInstructions) instructions = normalizedInstructions;
			notify('success', normalizedInstructions ? 'Instructions saved' : 'Instructions cleared');
		} catch (error) {
			notify('error', error instanceof Error ? error.message : 'Could not save instructions');
		} finally {
			saving = false;
		}
	}

	async function clearInstructions() {
		if (!confirm('Clear your custom instructions?')) return;
		const pendingInstructions = instructions;
		saving = true;
		try {
			const response = await fetch('/api/settings/instructions', { method: 'DELETE' });
			const body = await response.json();
			if (!response.ok) throw new Error(body.error?.message ?? 'Could not clear instructions');
			savedInstructions = '';
			if (instructions === pendingInstructions) instructions = '';
			notify('success', 'Instructions cleared');
		} catch (error) {
			notify('error', error instanceof Error ? error.message : 'Could not clear instructions');
		} finally {
			saving = false;
		}
	}

	onMount(loadInstructions);
</script>

<div class="tab-pane">
	<div class="view-header">
		<h1 class="view-title">Custom instructions</h1>
		<p class="view-subtitle">Set the tone for all your conversations.</p>
	</div>

	{#if notification}
		<div
			class="notification"
			class:error={notification.type === 'error'}
			role={notification.type === 'error' ? 'alert' : 'status'}
		>
			{notification.message}
		</div>
	{/if}

	{#if loading}
		<div class="empty-state" role="status">Loading your instructions...</div>
	{:else}
		<form
			class="instructions-form"
			onsubmit={(e) => {
				e.preventDefault();
				saveInstructions();
			}}
		>
			<div class="field-label-row">
				<label for="instructions-textarea">How should Mimin respond?</label>
			</div>

			<div class="textarea-card">
				<textarea
					id="instructions-textarea"
					bind:value={instructions}
					maxlength={MAX_LENGTH}
					rows="10"
					placeholder="don't use emoji if not necessary. don't use dash em. use proper punctuation like dot, commas, etc"
					spellcheck="true"></textarea>
				<div class="char-count" class:near-limit={instructions.length > MAX_LENGTH * 0.9}>
					{instructions.length.toLocaleString()} / {MAX_LENGTH.toLocaleString()}
				</div>
			</div>

			<p class="footnote-text">Used in every chat. Projects can add specific guidance.</p>

			<div class="disclosure-card">
				<button
					type="button"
					class="disclosure-toggle"
					onclick={() => (howItWorksOpen = !howItWorksOpen)}
					aria-expanded={howItWorksOpen}
				>
					<ChevronRight size={15} class={howItWorksOpen ? 'chevron open' : 'chevron'} />
					<span>How instructions work</span>
				</button>
				{#if howItWorksOpen}
					<div class="disclosure-content">
						<div class="precedence-item">
							<span class="step-num">1</span>
							<div class="step-info">
								<strong>Mimin defaults</strong>
								<p>Core personality, safety guidelines, and base capabilities.</p>
							</div>
						</div>
						<div class="precedence-item active">
							<span class="step-num">2</span>
							<div class="step-info">
								<strong>Your instructions</strong>
								<p>Applied to every conversation you start in this workspace.</p>
							</div>
						</div>
						<div class="precedence-item">
							<span class="step-num">3</span>
							<div class="step-info">
								<strong>Project context</strong>
								<p>Specific project instructions add guidance when working in a project.</p>
							</div>
						</div>
					</div>
				{/if}
			</div>

			<div class="form-actions">
				<div class="left-actions">
					{#if savedInstructions || instructions}
						<button
							type="button"
							class="clear-button"
							onclick={clearInstructions}
							disabled={saving}
						>
							<Trash2 size={14} />
							<span>Clear</span>
						</button>
						<span class="separator">•</span>
					{/if}
					<span class="save-state">
						{#if changed}
							<span class="unsaved">Unsaved changes</span>
						{:else}
							<Check size={14} class="check-icon" />
							<span>Saved</span>
						{/if}
					</span>
				</div>

				<button type="submit" class="save-button" disabled={saving || !changed}>
					{#if saving}
						<Loader2 size={15} class="spin" />
						<span>Saving...</span>
					{:else}
						<span>Save instructions</span>
					{/if}
				</button>
			</div>
		</form>
	{/if}
</div>

<style>
	.tab-pane {
		padding: 28px 32px 36px;
		color: #ececee;
		font-family: var(--font-body);
	}
	.view-header {
		margin-bottom: 24px;
		padding-right: 40px;
	}
	.view-title {
		margin: 0;
		font-size: 22px;
		font-weight: 600;
		color: #ececee;
		letter-spacing: -0.01em;
	}
	.view-subtitle {
		margin: 4px 0 0;
		font-size: 13px;
		color: #a1a1aa;
	}
	.notification {
		margin-bottom: 16px;
		padding: 10px 14px;
		background: #1d271f;
		border: 1px solid #28442d;
		border-radius: 10px;
		color: #4ade80;
		font-size: 13px;
	}
	.notification.error {
		background: #2b1a19;
		border-color: #4d2321;
		color: #f87171;
	}
	.empty-state {
		text-align: center;
		color: #71717a;
		font-size: 13px;
		padding: 48px 0;
	}
	.instructions-form {
		display: flex;
		flex-direction: column;
		gap: 12px;
	}
	.field-label-row label {
		font-size: 13px;
		font-weight: 500;
		color: #ececee;
	}
	.textarea-card {
		display: flex;
		flex-direction: column;
		background: #151517;
		border: 1px solid #2c2c30;
		border-radius: 14px;
		padding: 14px 16px;
		transition: border-color var(--duration-short2) var(--ease-standard);
	}
	.textarea-card:focus-within {
		border-color: #3f3f45;
	}
	.textarea-card textarea {
		width: 100%;
		min-height: 250px;
		border: 0;
		background: transparent;
		color: #ececee;
		font-family: var(--font-body);
		font-size: 13.5px;
		line-height: 1.6;
		resize: vertical;
		outline: none;
		padding: 0;
	}
	.textarea-card textarea::placeholder {
		color: #52525b;
	}
	.char-count {
		align-self: flex-end;
		margin-top: 8px;
		font-size: 11px;
		color: #71717a;
		font-variant-numeric: tabular-nums;
	}
	.char-count.near-limit {
		color: #f87171;
	}
	.footnote-text {
		margin: 0;
		font-size: 12px;
		color: #71717a;
	}
	.disclosure-card {
		margin-top: 8px;
	}
	.disclosure-toggle {
		display: flex;
		align-items: center;
		gap: 6px;
		background: transparent;
		border: 0;
		color: #ececee;
		font-size: 13px;
		font-weight: 500;
		cursor: pointer;
		padding: 4px 0;
	}
	:global(.chevron) {
		transition: transform var(--duration-short2) var(--ease-standard);
		color: #71717a;
	}
	:global(.chevron.open) {
		transform: rotate(90deg);
	}
	.disclosure-content {
		display: flex;
		flex-direction: column;
		gap: 8px;
		margin-top: 10px;
		padding: 12px 14px;
		background: #18181b;
		border: 1px solid #2c2c30;
		border-radius: 10px;
	}
	.precedence-item {
		display: flex;
		align-items: flex-start;
		gap: 10px;
		padding: 6px 8px;
		border-radius: 8px;
	}
	.precedence-item.active {
		background: #202024;
	}
	.step-num {
		display: flex;
		align-items: center;
		justify-content: center;
		width: 20px;
		height: 20px;
		border-radius: 50%;
		background: #27272b;
		border: 1px solid #34343a;
		font-size: 11px;
		font-weight: 600;
		color: #ececee;
		flex-shrink: 0;
	}
	.precedence-item.active .step-num {
		background: #f4f4f5;
		color: #18181b;
		border-color: #f4f4f5;
	}
	.step-info strong {
		display: block;
		font-size: 12px;
		font-weight: 500;
		color: #ececee;
	}
	.step-info p {
		margin: 1px 0 0;
		font-size: 11px;
		color: #71717a;
	}
	.form-actions {
		display: flex;
		align-items: center;
		justify-content: space-between;
		gap: 16px;
		margin-top: 24px;
		padding-top: 18px;
		border-top: 1px solid #242428;
	}
	.left-actions {
		display: flex;
		align-items: center;
		gap: 10px;
	}
	.clear-button {
		display: inline-flex;
		align-items: center;
		gap: 6px;
		background: transparent;
		border: 0;
		color: #a1a1aa;
		font-size: 13px;
		cursor: pointer;
		padding: 0;
		transition: color var(--duration-short2) var(--ease-standard);
	}
	.clear-button:hover:not(:disabled) {
		color: #ececee;
	}
	.clear-button:disabled {
		opacity: 0.5;
		cursor: not-allowed;
	}
	.separator {
		color: #3f3f45;
	}
	.save-state {
		display: inline-flex;
		align-items: center;
		gap: 5px;
		font-size: 12px;
		color: #71717a;
	}
	:global(.check-icon) {
		color: #4ade80;
	}
	.unsaved {
		color: #a1a1aa;
	}
	.save-button {
		display: inline-flex;
		align-items: center;
		gap: 8px;
		height: 38px;
		padding: 0 18px;
		background: #f4f4f5;
		border: 0;
		border-radius: 10px;
		color: #18181b;
		font-size: 13px;
		font-weight: 500;
		cursor: pointer;
		transition: background-color var(--duration-short2) var(--ease-standard);
	}
	.save-button:hover:not(:disabled) {
		background: #e4e4e7;
	}
	.save-button:disabled {
		opacity: 0.45;
		cursor: not-allowed;
	}
	:global(.spin) {
		animation: spin 0.8s linear infinite;
	}
	@keyframes spin {
		from {
			transform: rotate(0deg);
		}
		to {
			transform: rotate(360deg);
		}
	}
	@media (max-width: 760px) {
		.tab-pane {
			padding: 16px;
		}
		.view-header {
			padding-right: 0;
		}
		.form-actions {
			flex-wrap: wrap;
		}
		.save-button {
			width: 100%;
			justify-content: center;
		}
	}
</style>
