<script lang="ts">
	import { Check, Copy, Edit3, Plus, Trash2, X } from '@lucide/svelte';
	import type { StyleGuideline } from '$lib/canvas';

	type Props = {
		guideline: StyleGuideline;
		onupdate: (guideline: StyleGuideline) => Promise<void>;
		onclose?: () => void;
	};

	let { guideline, onupdate, onclose }: Props = $props();

	let isEditing = $state(false);
	let saving = $state(false);
	let copied = $state(false);

	let editDirection = $state('');
	let editRules = $state<string[]>([]);
	let editAvoidances = $state<string[]>([]);
	let editTokensRaw = $state('');
	let jsonError = $state('');

	function startEdit() {
		editDirection = guideline.direction;
		editRules = [...guideline.rules];
		editAvoidances = [...guideline.avoidances];
		editTokensRaw = JSON.stringify(guideline.tokens, null, 2);
		jsonError = '';
		isEditing = true;
	}

	function cancelEdit() {
		isEditing = false;
		jsonError = '';
	}

	function addRule() {
		editRules = [...editRules, ''];
	}

	function removeRule(index: number) {
		editRules = editRules.filter((_, i) => i !== index);
	}

	function addAvoidance() {
		editAvoidances = [...editAvoidances, ''];
	}

	function removeAvoidance(index: number) {
		editAvoidances = editAvoidances.filter((_, i) => i !== index);
	}

	async function saveChanges() {
		let parsedTokens: typeof guideline.tokens;
		try {
			parsedTokens = JSON.parse(editTokensRaw);
			jsonError = '';
		} catch {
			jsonError = 'Invalid JSON for tokens';
			return;
		}

		saving = true;
		try {
			await onupdate({
				direction: editDirection.trim(),
				rules: editRules.map((r) => r.trim()).filter(Boolean),
				avoidances: editAvoidances.map((a) => a.trim()).filter(Boolean),
				tokens: parsedTokens
			});
			isEditing = false;
		} finally {
			saving = false;
		}
	}

	function copyAsJson() {
		navigator.clipboard.writeText(JSON.stringify(guideline, null, 2));
		copied = true;
		setTimeout(() => (copied = false), 1500);
	}
</script>

<div class="guideline-panel">
	<div class="panel-header">
		<div>
			<h3 class="panel-title">Style Guideline</h3>
			<p class="panel-desc">Design rules, tokens, and direction for scenes</p>
		</div>
		<div class="header-actions">
			<button class="icon-btn" onclick={copyAsJson} title="Copy Guideline JSON">
				{#if copied}<Check size={14} />{:else}<Copy size={14} />{/if}
			</button>
			{#if !isEditing}
				<button class="button small" onclick={startEdit}>
					<Edit3 size={13} /> Edit
				</button>
			{:else}
				<button class="button small primary" onclick={saveChanges} disabled={saving}>
					<Check size={13} />
					{saving ? 'Saving...' : 'Save'}
				</button>
				<button class="button small" onclick={cancelEdit} disabled={saving}>
					<X size={13} /> Cancel
				</button>
			{/if}
			{#if onclose}
				<button class="icon-btn" onclick={onclose} title="Close Panel">
					<X size={14} />
				</button>
			{/if}
		</div>
	</div>

	<div class="panel-body">
		{#if isEditing}
			<!-- Edit Mode -->
			<div class="section">
				<label class="field-label" for="direction-input">Design Direction</label>
				<textarea
					id="direction-input"
					class="text-input"
					rows={3}
					bind:value={editDirection}
					placeholder="Aesthetic tone, intent, and high-level principles..."></textarea>
			</div>

			<div class="section">
				<div class="section-title-row">
					<span class="field-label">Design Rules (Must-Dos)</span>
					<button type="button" class="text-btn" onclick={addRule}
						><Plus size={12} /> Add Rule</button
					>
				</div>
				{#each editRules, i (i)}
					<div class="list-item-row">
						<input
							type="text"
							class="text-input row-input"
							bind:value={editRules[i]}
							placeholder="Rule description..."
							aria-label="Rule {i + 1}"
						/>
						<button
							type="button"
							class="icon-btn danger"
							onclick={() => removeRule(i)}
							title="Remove Rule"
						>
							<Trash2 size={13} />
						</button>
					</div>
				{/each}
			</div>

			<div class="section">
				<div class="section-title-row">
					<span class="field-label">Avoidances (Must-Nots)</span>
					<button type="button" class="text-btn" onclick={addAvoidance}
						><Plus size={12} /> Add</button
					>
				</div>
				{#each editAvoidances, i (i)}
					<div class="list-item-row">
						<input
							type="text"
							class="text-input row-input"
							bind:value={editAvoidances[i]}
							placeholder="What to avoid..."
							aria-label="Avoidance {i + 1}"
						/>
						<button
							type="button"
							class="icon-btn danger"
							onclick={() => removeAvoidance(i)}
							title="Remove Avoidance"
						>
							<Trash2 size={13} />
						</button>
					</div>
				{/each}
			</div>

			<div class="section">
				<label class="field-label" for="tokens-input">Design Tokens (JSON)</label>
				{#if jsonError}
					<p class="error-text">{jsonError}</p>
				{/if}
				<textarea
					id="tokens-input"
					class="code-input"
					rows={10}
					bind:value={editTokensRaw}
					placeholder="Tokens object (colors, typography, spacing, radii)..."></textarea>
			</div>
		{:else}
			<!-- View Mode -->
			<div class="section">
				<h4 class="section-title">Aesthetic Direction</h4>
				<div class="direction-card">
					<p class="direction-text">
						{guideline.direction || 'No high-level aesthetic direction set.'}
					</p>
				</div>
			</div>

			<div class="section">
				<h4 class="section-title">Design Rules</h4>
				{#if guideline.rules.length === 0}
					<p class="empty-hint">No rules specified.</p>
				{:else}
					<div class="guideline-items">
						{#each guideline.rules as rule, i (i)}
							<div class="guideline-item">
								<span class="rule-bullet"></span>
								<span class="item-text">{rule}</span>
							</div>
						{/each}
					</div>
				{/if}
			</div>

			<div class="section">
				<h4 class="section-title">Avoidances</h4>
				{#if guideline.avoidances.length === 0}
					<p class="empty-hint">No avoidances specified.</p>
				{:else}
					<div class="guideline-items">
						{#each guideline.avoidances as avoidance, i (i)}
							<div class="guideline-item">
								<span class="avoidance-bullet"></span>
								<span class="item-text">{avoidance}</span>
							</div>
						{/each}
					</div>
				{/if}
			</div>

			<div class="section">
				<h4 class="section-title">Design Tokens</h4>
				{#if guideline.tokens.colors}
					<div class="color-palette">
						{#each Object.entries(guideline.tokens.colors) as [name, val] (name)}
							{#if val}
								<div class="color-chip" title="{name}: {val}">
									<span class="color-swatch" style:background-color={val}></span>
									<span class="color-name">{name}</span>
									<span class="color-hex">{val}</span>
								</div>
							{/if}
						{/each}
					</div>
				{/if}

				<details class="token-details">
					<summary class="token-summary">View Full Token Specification</summary>
					<pre class="token-code">{JSON.stringify(guideline.tokens, null, 2)}</pre>
				</details>
			</div>
		{/if}
	</div>
</div>

<style>
	.guideline-panel {
		background: var(--surface);
		display: flex;
		flex-direction: column;
		height: 100%;
		overflow: hidden;
	}

	.panel-header {
		padding: 12px 16px;
		border-bottom: 1px solid var(--border);
		display: flex;
		align-items: center;
		justify-content: space-between;
		gap: 12px;
		background: var(--bg);
	}

	.panel-title {
		margin: 0;
		font-size: var(--text-sm);
		font-weight: 600;
		color: var(--text-strong);
	}

	.panel-desc {
		margin: 2px 0 0;
		font-size: var(--text-xs);
		color: var(--text-muted);
	}

	.header-actions {
		display: flex;
		align-items: center;
		gap: 6px;
	}

	.panel-body {
		padding: 16px;
		overflow-y: auto;
		flex: 1;
		display: flex;
		flex-direction: column;
		gap: 18px;
	}

	.section {
		display: flex;
		flex-direction: column;
		gap: 8px;
	}

	.section-title {
		margin: 0;
		font-size: var(--text-xs);
		font-weight: 600;
		text-transform: uppercase;
		letter-spacing: 0.04em;
		color: var(--text-muted);
	}

	.section-title-row {
		display: flex;
		align-items: center;
		justify-content: space-between;
	}

	.direction-card {
		background: var(--surface-subtle);
		border: 1px solid var(--border);
		border-radius: 6px;
		padding: 10px 12px;
	}

	.direction-text {
		margin: 0;
		font-size: var(--text-sm);
		line-height: 1.5;
		color: var(--text-body);
	}

	.guideline-items {
		display: flex;
		flex-direction: column;
		gap: 6px;
	}

	.guideline-item {
		display: flex;
		align-items: flex-start;
		gap: 8px;
		font-size: var(--text-sm);
		line-height: 1.45;
		color: var(--text-body);
	}

	.rule-bullet {
		width: 5px;
		height: 5px;
		border-radius: 50%;
		background: var(--text-dim);
		flex-shrink: 0;
		margin-top: 7px;
	}

	.avoidance-bullet {
		width: 5px;
		height: 5px;
		border-radius: 50%;
		background: var(--danger-text);
		flex-shrink: 0;
		margin-top: 7px;
	}

	.item-text {
		flex: 1;
		min-width: 0;
	}

	.color-palette {
		display: grid;
		grid-template-columns: repeat(auto-fill, minmax(125px, 1fr));
		gap: 6px;
	}

	.color-chip {
		display: flex;
		align-items: center;
		gap: 7px;
		padding: 5px 8px;
		background: var(--surface-subtle);
		border: 1px solid var(--border);
		border-radius: 5px;
	}

	.color-swatch {
		width: 14px;
		height: 14px;
		border-radius: 3px;
		border: 1px solid color-mix(in srgb, var(--border-strong) 60%, transparent);
		flex-shrink: 0;
	}

	.color-name {
		font-size: var(--text-xs);
		font-weight: 500;
		color: var(--text-strong);
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
	}

	.color-hex {
		margin-left: auto;
		font-size: 10px;
		font-family: ui-monospace, SFMono-Regular, monospace;
		color: var(--text-dim);
	}

	.token-details {
		margin-top: 4px;
	}

	.token-summary {
		cursor: pointer;
		font-size: var(--text-xs);
		color: var(--text-muted);
		font-weight: 500;
		user-select: none;
		transition: color 0.14s ease;
	}

	.token-summary:hover {
		color: var(--text-strong);
	}

	.token-code {
		margin-top: 8px;
		background: var(--surface-2);
		border: 1px solid var(--border);
		padding: 10px;
		border-radius: 6px;
		overflow-x: auto;
		font-family: ui-monospace, SFMono-Regular, monospace;
		font-size: 11px;
		color: var(--text-body);
		line-height: 1.4;
		max-height: 220px;
	}

	.field-label {
		font-size: var(--text-xs);
		font-weight: 600;
		color: var(--text-strong);
	}

	.text-input,
	.code-input {
		width: 100%;
		border: 1px solid var(--input-border);
		border-radius: 6px;
		padding: 7px 9px;
		font-size: var(--text-sm);
		background: var(--surface);
		color: var(--text);
	}

	.text-input:focus,
	.code-input:focus {
		border-color: var(--border-strong);
		outline: 2px solid var(--focus);
		outline-offset: 1px;
	}

	.code-input {
		font-family: ui-monospace, SFMono-Regular, monospace;
		font-size: 12px;
	}

	.list-item-row {
		display: flex;
		align-items: center;
		gap: 6px;
		margin-bottom: 4px;
	}

	.row-input {
		flex: 1;
	}

	.text-btn {
		background: none;
		border: none;
		color: var(--text-muted);
		font-size: var(--text-xs);
		font-weight: 500;
		cursor: pointer;
		display: inline-flex;
		align-items: center;
		gap: 4px;
		padding: 2px 4px;
		border-radius: 4px;
		transition: color 0.14s ease;
	}

	.text-btn:hover {
		color: var(--text-strong);
	}

	.icon-btn {
		display: grid;
		place-items: center;
		width: 28px;
		height: 28px;
		background: transparent;
		border: 1px solid var(--border);
		border-radius: 6px;
		padding: 0;
		cursor: pointer;
		color: var(--text-muted);
		transition:
			color 0.14s ease,
			background 0.14s ease,
			border-color 0.14s ease;
	}

	.icon-btn:hover {
		background: var(--surface-hover);
		color: var(--text-strong);
		border-color: var(--border-strong);
	}

	.icon-btn.danger:hover {
		color: var(--danger-text);
		border-color: var(--danger-text);
		background: color-mix(in srgb, var(--danger-text) 10%, transparent);
	}

	.error-text {
		margin: 0;
		font-size: var(--text-xs);
		color: var(--danger-text);
	}

	.empty-hint {
		margin: 0;
		font-size: var(--text-xs);
		color: var(--text-dim);
	}
</style>
