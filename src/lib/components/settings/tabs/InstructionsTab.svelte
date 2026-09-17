<script lang="ts">
	import { onMount } from 'svelte';
	import { Check, FileText, Loader2, RotateCcw } from '@lucide/svelte';
	import { Button } from '$lib/components/ui/button/index.js';
	import { Card } from '$lib/components/ui/card/index.js';
	import PageHeader from '$lib/components/PageHeader.svelte';

	const MAX_LENGTH = 10000;

	let instructions = $state('');
	let savedInstructions = $state('');
	let loading = $state(true);
	let saving = $state(false);
	let notification = $state<{ type: 'success' | 'error'; message: string } | null>(null);
	let changed = $derived(instructions !== savedInstructions);

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

<div class="tab-content">
	<PageHeader
		title="Custom instructions"
		subtitle="Tell Mimin how you want it to respond across all of your conversations."
	>
		{#snippet icon()}<FileText size={20} />{/snippet}
	</PageHeader>

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
		<div class="scope-strip" aria-label="Instruction priority">
			<div><span>1</span><small>Mimin defaults</small></div>
			<i aria-hidden="true"></i>
			<div class="current"><span>2</span><small>Your instructions</small></div>
			<i aria-hidden="true"></i>
			<div><span>3</span><small>Project context</small></div>
		</div>

		<Card class="p-[20px] max-[760px]:p-[var(--space-4)]" shadow="soft">
			<form
				onsubmit={(event) => {
					event.preventDefault();
					saveInstructions();
				}}
			>
				<div class="field-heading">
					<div>
						<label for="custom-instructions">How should Mimin behave?</label>
						<p>Describe your preferred tone, format, working style, or standing context.</p>
					</div>
					<span class:near-limit={instructions.length > MAX_LENGTH * 0.9}
						>{instructions.length.toLocaleString()} / {MAX_LENGTH.toLocaleString()}</span
					>
				</div>
				<textarea
					id="custom-instructions"
					bind:value={instructions}
					maxlength={MAX_LENGTH}
					rows="12"
					placeholder="For example: Be concise and direct. Lead with the answer, explain technical terms in plain language, and use bullet points for multi-step guidance."
					spellcheck="true"></textarea>
				<p class="privacy-note">
					These instructions are added to new responses in every chat. Project instructions can add
					more specific guidance when you work inside a project.
				</p>
				<div class="form-actions">
					{#if savedInstructions}
						<Button
							variant="destructive"
							type="button"
							onclick={clearInstructions}
							disabled={saving}><RotateCcw size={15} /> Clear</Button
						>
					{/if}
					<span class="save-state" aria-live="polite"
						>{changed ? 'Unsaved changes' : 'Up to date'}</span
					>
					<Button type="submit" variant="default" class="ml-auto" disabled={saving || !changed}>
						{#if saving}<span class="spin"><Loader2 size={16} /></span> Saving...{:else}<Check
								size={16}
							/> Save instructions{/if}
					</Button>
				</div>
			</form>
		</Card>
	{/if}
</div>

<style>
	.tab-content {
		padding: 28px var(--space-6) var(--space-7);
	}
	.empty-state {
		text-align: center;
		color: var(--text-dim);
		font-size: var(--text-body-md);
		line-height: var(--text-body-md--line-height);
		letter-spacing: var(--text-body-md--letter-spacing);
		padding: 40px 0;
	}
	.field-heading p,
	.privacy-note {
		margin: 0;
		color: var(--text-muted);
		font-size: var(--text-body-md);
		line-height: var(--text-body-md--line-height);
		letter-spacing: var(--text-body-md--letter-spacing);
	}
	.notification {
		margin-top: 20px;
		padding: 11px 13px;
		color: var(--status-ok-text);
		background: color-mix(in srgb, var(--status-ok-dot) 8%, var(--surface));
		border: 1px solid color-mix(in srgb, var(--status-ok-dot) 24%, var(--border));
		border-radius: var(--radius-lg);
		font-size: var(--text-body-md);
		line-height: var(--text-body-md--line-height);
		letter-spacing: var(--text-body-md--letter-spacing);
	}
	.notification.error {
		color: var(--danger-text);
		background: color-mix(in srgb, var(--danger-text) 8%, var(--surface));
		border-color: color-mix(in srgb, var(--danger-text) 24%, var(--border));
	}
	.scope-strip {
		display: grid;
		grid-template-columns: auto 1fr auto 1fr auto;
		align-items: center;
		gap: var(--space-3);
		margin: var(--space-5) 0 13px;
		padding: var(--space-3) 14px;
		background: var(--surface-2);
		border: 1px solid var(--border);
		border-radius: var(--radius-lg);
	}
	.scope-strip div {
		display: flex;
		align-items: center;
		gap: 7px;
		color: var(--text-muted);
	}
	.scope-strip span {
		display: grid;
		place-items: center;
		width: 20px;
		height: 20px;
		border: 1px solid var(--border-strong);
		border-radius: 50%;
		font-size: var(--text-label-sm);
		font-style: normal;
		line-height: var(--text-label-sm--line-height);
		letter-spacing: var(--text-label-sm--letter-spacing);
		font-weight: 500;
	}
	.scope-strip .current {
		color: var(--text-strong);
		font-weight: 500;
	}
	.scope-strip .current span {
		color: var(--accent-fg);
		background: var(--accent-bg);
		border-color: var(--accent-bg);
	}
	.scope-strip small {
		font-size: var(--text-body-sm);
		line-height: var(--text-body-sm--line-height);
		letter-spacing: var(--text-body-sm--letter-spacing);
		white-space: nowrap;
	}
	.scope-strip i {
		height: 1px;
		background: var(--border-strong);
	}
	.field-heading {
		display: flex;
		align-items: flex-start;
		justify-content: space-between;
		gap: 20px;
		margin-bottom: var(--space-3);
	}
	.field-heading label {
		display: block;
		margin-bottom: 3px;
		color: var(--text-strong);
		font-size: var(--text-body-lg);
		line-height: var(--text-body-lg--line-height);
		letter-spacing: var(--text-body-lg--letter-spacing);
		font-weight: 500;
	}
	.field-heading > span {
		flex: 0 0 auto;
		color: var(--text-faint);
		font-size: var(--text-body-sm);
		line-height: var(--text-body-sm--line-height);
		letter-spacing: var(--text-body-sm--letter-spacing);
		font-variant-numeric: tabular-nums;
	}
	.field-heading > span.near-limit {
		color: var(--danger-text);
	}
	textarea {
		display: block;
		width: 100%;
		min-height: 230px;
		resize: vertical;
		padding: 14px 15px;
		color: var(--text-body);
		background: var(--surface-subtle);
		border: 1px solid var(--input-border);
		border-radius: var(--radius-lg);
		font-family: var(--font-body);
		font-size: var(--text-body-lg);
		line-height: var(--text-body-lg--line-height);
		letter-spacing: var(--text-body-lg--letter-spacing);
	}
	textarea:focus {
		border-color: var(--focus);
	}
	.privacy-note {
		margin-top: 10px;
	}
	.form-actions {
		display: flex;
		align-items: center;
		gap: 10px;
		margin-top: 20px;
		padding-top: 17px;
		border-top: 1px solid var(--border);
	}
	.save-state {
		color: var(--text-faint);
		font-size: var(--text-body-sm);
		line-height: var(--text-body-sm--line-height);
		letter-spacing: var(--text-body-sm--letter-spacing);
	}
	.spin {
		animation: spin 0.8s linear infinite;
	}
	@media (prefers-reduced-motion: reduce) {
		.spin {
			animation: none;
		}
	}
	@media (max-width: 760px) {
		.tab-content {
			padding: 20px var(--space-4) var(--space-7);
		}
		.scope-strip {
			grid-template-columns: 1fr;
			gap: var(--space-2);
		}
		.scope-strip i {
			display: none;
		}
		.field-heading {
			gap: 10px;
		}
		.form-actions {
			flex-wrap: wrap;
		}
		.save-state {
			order: -1;
			width: 100%;
		}
	}
</style>
