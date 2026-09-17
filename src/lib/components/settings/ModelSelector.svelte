<script lang="ts">
	import { Plus, Search, Trash2, X } from '@lucide/svelte';
	import { Button } from '$lib/components/ui/button/index.js';
	import { isModelFree, type ModelItem } from './provider-types';

	type Props = {
		models: ModelItem[];
		filter: string;
		manualModelId: string;
		textEditMode: boolean;
		draftModels: string;
		discovering: boolean;
		ondiscover: () => void;
		onnotify: (message: string) => void;
	};

	let {
		models = $bindable(),
		filter = $bindable(),
		manualModelId = $bindable(),
		textEditMode = $bindable(),
		draftModels = $bindable(),
		discovering,
		ondiscover,
		onnotify
	}: Props = $props();

	let checkedCount = $derived(models.filter((m) => m.checked).length);
	let totalCount = $derived(models.length);
	let filteredModels = $derived.by(() => {
		const q = filter.trim().toLowerCase();
		if (!q) return models;
		return models.filter((m) => matchesFilter(m, q));
	});

	function matchesFilter(model: ModelItem, query: string) {
		const q = query.toLowerCase();
		return model.id.toLowerCase().includes(q) || (model.name?.toLowerCase().includes(q) ?? false);
	}

	function reverseSelection() {
		const q = filter.trim().toLowerCase();
		models = models.map((m) => {
			if (q && !matchesFilter(m, q)) return m;
			return { ...m, checked: !m.checked };
		});
	}

	function selectAll() {
		const q = filter.trim().toLowerCase();
		models = models.map((m) => {
			if (q && !matchesFilter(m, q)) return m;
			return { ...m, checked: true };
		});
	}

	function selectNone() {
		const q = filter.trim().toLowerCase();
		models = models.map((m) => {
			if (q && !matchesFilter(m, q)) return m;
			return { ...m, checked: false };
		});
	}

	function selectFree() {
		const q = filter.trim().toLowerCase();
		let count = 0;
		models = models.map((m) => {
			if (q && !matchesFilter(m, q)) return m;
			const free = isModelFree(m);
			if (free) count++;
			return { ...m, checked: free };
		});
		if (count === 0) {
			onnotify('No free models found');
		} else {
			onnotify(`Selected ${count} free model${count === 1 ? '' : 's'}`);
		}
	}

	function addManualModel() {
		const trimmed = manualModelId.trim();
		if (!trimmed) return;
		if (models.some((m) => m.id === trimmed)) {
			onnotify('Model ID already in list');
			return;
		}
		models = [
			...models,
			{
				id: trimmed,
				isFree: isModelFree({ id: trimmed }),
				checked: true
			}
		];
		manualModelId = '';
	}

	function removeModel(id: string) {
		models = models.filter((m) => m.id !== id);
	}

	function toggleTextMode() {
		if (textEditMode) {
			const lines = draftModels
				.split(/[\n,]/)
				.map((s) => s.trim())
				.filter(Boolean);
			const existingMap = new Map(models.map((m) => [m.id, m]));
			models = lines.map((id) => {
				const existing = existingMap.get(id);
				return existing
					? { ...existing, checked: true }
					: { id, isFree: isModelFree({ id }), checked: true };
			});
			textEditMode = false;
		} else {
			draftModels = models
				.filter((m) => m.checked)
				.map((m) => m.id)
				.join('\n');
			textEditMode = true;
		}
	}
</script>

<div class="models-section">
	<div class="models-label-row">
		<div class="models-title-wrap">
			<span class="field-title">Model IDs</span>
			{#if models.length > 0}
				<span class="models-count-badge">
					{checkedCount} of {totalCount} shown
				</span>
			{:else}
				<span class="optional">auto-retrieved if blank</span>
			{/if}
		</div>
		<div class="models-header-actions">
			{#if models.length > 0}
				<button type="button" class="text-mode-btn" onclick={toggleTextMode}>
					{textEditMode ? 'Show list' : 'Raw text'}
				</button>
			{/if}
			<button type="button" class="fetch-models-btn" onclick={ondiscover} disabled={discovering}>
				{discovering ? 'Fetching...' : 'Fetch models'}
			</button>
		</div>
	</div>

	{#if textEditMode}
		<textarea
			bind:value={draftModels}
			rows="5"
			placeholder="Leave blank to retrieve automatically, or enter one per line"></textarea>
	{:else}
		{#if models.length > 0}
			<div class="models-toolbar">
				<div class="btn-group-selection">
					<button
						type="button"
						class="filter-btn"
						onclick={reverseSelection}
						title="Invert selection"
					>
						Reverse
					</button>
					<button type="button" class="filter-btn" onclick={selectAll} title="Select all models">
						All
					</button>
					<button type="button" class="filter-btn" onclick={selectNone} title="Deselect all models">
						None
					</button>
					<button
						type="button"
						class="filter-btn free-btn"
						onclick={selectFree}
						title="Select free models"
					>
						Free
					</button>
				</div>
				<div class="models-search-box">
					<Search size={13} />
					<input type="text" bind:value={filter} placeholder="Filter..." />
					{#if filter}
						<button
							type="button"
							class="clear-search-btn"
							onclick={() => (filter = '')}
							title="Clear filter"
						>
							<X size={12} />
						</button>
					{/if}
				</div>
			</div>

			<div class="models-list-box" role="group" aria-label="Available models">
				{#each filteredModels as model (model.id)}
					<label class="model-row" class:unchecked={!model.checked}>
						<input type="checkbox" bind:checked={model.checked} class="model-row-checkbox" />
						<div class="model-row-content">
							<div class="model-row-main">
								<span class="model-row-id mono">{model.id}</span>
								{#if isModelFree(model)}
									<span class="model-badge-free">Free</span>
								{/if}
								{#if model.contextWindow}
									<span class="model-badge-meta">{Math.round(model.contextWindow / 1000)}k</span>
								{/if}
							</div>
							{#if model.name && model.name !== model.id}
								<span class="model-row-name">{model.name}</span>
							{/if}
						</div>
						<button
							type="button"
							class="model-remove-btn"
							onclick={(e) => {
								e.preventDefault();
								e.stopPropagation();
								removeModel(model.id);
							}}
							title="Remove model"
							aria-label="Remove model"
						>
							<Trash2 size={13} />
						</button>
					</label>
				{/each}
				{#if filteredModels.length === 0}
					<div class="models-empty-filter">No models match "{filter}"</div>
				{/if}
			</div>
		{:else}
			<div class="models-empty-state">
				<p>
					No models loaded yet. Click <strong>Fetch models</strong> above to load models from the endpoint,
					or add one below.
				</p>
			</div>
		{/if}

		<div class="model-add-row">
			<input
				type="text"
				bind:value={manualModelId}
				placeholder="Add model ID manually (e.g. meta-llama/llama-3.3-70b-instruct:free)"
				onkeydown={(e) => e.key === 'Enter' && (e.preventDefault(), addManualModel())}
			/>
			<Button
				variant="outline"
				size="sm"
				type="button"
				class="add-model-btn"
				onclick={addManualModel}
				disabled={!manualModelId.trim()}
			>
				<Plus size={14} /> Add
			</Button>
		</div>
	{/if}
</div>

<style>
	.models-section {
		margin-top: var(--space-4);
		display: flex;
		flex-direction: column;
		gap: var(--space-2);
	}
	.models-label-row {
		display: flex;
		align-items: center;
		justify-content: space-between;
		gap: 10px;
		margin-top: var(--space-1);
		margin-bottom: 2px;
	}
	.models-title-wrap {
		display: flex;
		align-items: center;
		gap: var(--space-2);
		flex-wrap: wrap;
	}
	.field-title {
		font-size: var(--text-body-md);
		line-height: var(--text-body-md--line-height);
		letter-spacing: var(--text-body-md--letter-spacing);
		font-weight: 500;
		color: var(--text);
	}
	.models-count-badge {
		font-size: var(--text-body-sm);
		line-height: var(--text-body-sm--line-height);
		letter-spacing: var(--text-body-sm--letter-spacing);
		color: var(--text-muted);
		background: var(--surface-2);
		padding: 2px 7px;
		border-radius: var(--radius-xl);
		border: 1px solid var(--border);
	}
	.optional {
		color: var(--text-faint);
		font-size: var(--text-body-sm);
		line-height: var(--text-body-sm--line-height);
		letter-spacing: var(--text-body-sm--letter-spacing);
		font-weight: 400;
		margin-left: var(--space-1);
	}
	.models-header-actions {
		display: flex;
		align-items: center;
		gap: 6px;
	}
	.text-mode-btn {
		background: transparent;
		border: none;
		color: var(--text-muted);
		font-family: var(--font-body);
		font-size: var(--text-label-sm);
		line-height: var(--text-label-sm--line-height);
		letter-spacing: var(--text-label-sm--letter-spacing);
		font-weight: 500;
		cursor: pointer;
		padding: 3px 6px;
		text-decoration: underline;
		text-underline-offset: 2px;
	}
	.text-mode-btn:hover {
		color: var(--text);
	}
	.fetch-models-btn {
		background: var(--surface-subtle, rgba(255, 255, 255, 0.05));
		border: 1px solid var(--border);
		border-radius: var(--radius-sm);
		color: var(--text-muted);
		font-family: var(--font-body);
		font-size: var(--text-label-sm);
		line-height: var(--text-label-sm--line-height);
		letter-spacing: var(--text-label-sm--letter-spacing);
		font-weight: 500;
		padding: 3px 9px;
		cursor: pointer;
		transition:
			color var(--duration-short3) var(--ease-standard),
			background var(--duration-short3) var(--ease-standard),
			border-color var(--duration-short3) var(--ease-standard);
	}
	.fetch-models-btn:hover:not(:disabled) {
		color: var(--text);
		border-color: var(--text-dim);
	}
	.fetch-models-btn:disabled {
		opacity: 0.5;
		cursor: not-allowed;
	}
	.models-toolbar {
		display: flex;
		align-items: center;
		justify-content: space-between;
		gap: var(--space-2);
		margin-top: var(--space-1);
		flex-wrap: wrap;
	}
	.btn-group-selection {
		display: inline-flex;
		align-items: center;
		background: var(--surface-2);
		border: 1px solid var(--border);
		border-radius: var(--radius-md);
		overflow: hidden;
	}
	.filter-btn {
		background: transparent;
		border: none;
		border-right: 1px solid var(--border);
		color: var(--text-body);
		font-family: var(--font-body);
		font-size: var(--text-label-sm);
		line-height: var(--text-label-sm--line-height);
		letter-spacing: var(--text-label-sm--letter-spacing);
		font-weight: 500;
		padding: 5px 9px;
		cursor: pointer;
		transition:
			background var(--duration-short3) var(--ease-standard),
			color var(--duration-short3) var(--ease-standard);
	}
	.filter-btn:last-child {
		border-right: none;
	}
	.filter-btn:hover {
		background: var(--surface-hover);
		color: var(--text-strong);
	}
	.filter-btn.free-btn {
		color: var(--status-ok-text);
	}
	.filter-btn.free-btn:hover {
		background: color-mix(in srgb, var(--status-ok-dot) 15%, transparent);
	}
	.models-search-box {
		display: flex;
		align-items: center;
		gap: 6px;
		background: var(--surface);
		border: 1px solid var(--input-border);
		border-radius: var(--radius-md);
		padding: 3px var(--space-2);
		flex: 1;
		min-width: 120px;
		max-width: 190px;
		color: var(--text-muted);
	}
	.models-search-box input {
		width: 100%;
		border: none;
		background: transparent;
		color: var(--text);
		font-size: var(--text-body-sm);
		line-height: var(--text-body-sm--line-height);
		letter-spacing: var(--text-body-sm--letter-spacing);
		padding: 0;
		min-height: auto;
		margin: 0;
	}
	.clear-search-btn {
		background: transparent;
		border: none;
		color: var(--text-dim);
		cursor: pointer;
		padding: 0;
		display: flex;
		align-items: center;
	}
	.clear-search-btn:hover {
		color: var(--text);
	}
	.models-list-box {
		max-height: 220px;
		overflow-y: auto;
		border: 1px solid var(--input-border);
		border-radius: var(--radius-md);
		background: var(--surface);
		display: flex;
		flex-direction: column;
	}
	.model-row {
		display: flex;
		align-items: center;
		gap: 9px;
		padding: 7px 10px;
		border-bottom: 1px solid var(--border);
		cursor: pointer;
		transition: background var(--duration-short2) var(--ease-standard);
		user-select: none;
	}
	.model-row:last-child {
		border-bottom: none;
	}
	.model-row:hover {
		background: var(--surface-hover);
	}
	.model-row.unchecked {
		opacity: 0.55;
	}
	.model-row-checkbox {
		width: 15px;
		height: 15px;
		min-height: 15px;
		margin: 0;
		cursor: pointer;
		flex-shrink: 0;
		accent-color: var(--accent-bg);
	}
	.model-row-content {
		flex: 1;
		min-width: 0;
		display: flex;
		flex-direction: column;
		gap: 1px;
	}
	.model-row-main {
		display: flex;
		align-items: center;
		gap: 6px;
		flex-wrap: wrap;
	}
	.mono {
		font-family: var(--font-mono);
		font-size: var(--text-body-sm);
		line-height: var(--text-body-sm--line-height);
		letter-spacing: var(--text-body-sm--letter-spacing);
		color: var(--text-body);
	}
	.model-row-id {
		font-size: var(--text-body-sm);
		line-height: var(--text-body-sm--line-height);
		letter-spacing: var(--text-body-sm--letter-spacing);
		color: var(--text-strong);
		word-break: break-all;
	}
	.model-row-name {
		font-size: var(--text-label-sm);
		line-height: var(--text-label-sm--line-height);
		letter-spacing: var(--text-label-sm--letter-spacing);
		color: var(--text-dim);
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
	}
	.model-badge-free {
		font-size: var(--text-label-sm);
		line-height: var(--text-label-sm--line-height);
		letter-spacing: var(--text-label-sm--letter-spacing);
		font-weight: 500;
		text-transform: uppercase;
		padding: 1px 5px;
		border-radius: var(--radius-sm);
		color: var(--status-ok-text);
		background: color-mix(in srgb, var(--status-ok-dot) 15%, transparent);
		border: 1px solid color-mix(in srgb, var(--status-ok-dot) 30%, transparent);
	}
	.model-badge-meta {
		font-size: var(--text-label-sm);
		line-height: var(--text-label-sm--line-height);
		letter-spacing: var(--text-label-sm--letter-spacing);
		padding: 1px 5px;
		border-radius: var(--radius-sm);
		color: var(--text-dim);
		background: var(--surface-2);
		border: 1px solid var(--border);
	}
	.model-remove-btn {
		background: transparent;
		border: none;
		color: var(--text-dim);
		cursor: pointer;
		padding: var(--space-1);
		border-radius: var(--radius-sm);
		opacity: 0;
		transition:
			opacity var(--duration-short3) var(--ease-standard),
			color var(--duration-short3) var(--ease-standard);
		display: flex;
		align-items: center;
	}
	.model-row:hover .model-remove-btn {
		opacity: 0.8;
	}
	.model-remove-btn:hover {
		opacity: 1;
		color: var(--danger-text);
	}
	.models-empty-state {
		border: 1px dashed var(--border);
		border-radius: var(--radius-md);
		padding: 18px 14px;
		text-align: center;
		background: var(--surface-2);
	}
	.models-empty-state p {
		margin: 0;
		font-size: var(--text-body-sm);
		line-height: var(--text-body-sm--line-height);
		letter-spacing: var(--text-body-sm--letter-spacing);
		color: var(--text-muted);
	}
	.models-empty-filter {
		padding: var(--space-4);
		text-align: center;
		font-size: var(--text-body-sm);
		line-height: var(--text-body-sm--line-height);
		letter-spacing: var(--text-body-sm--letter-spacing);
		color: var(--text-dim);
	}
	.model-add-row {
		display: flex;
		align-items: center;
		gap: 6px;
		margin-top: 2px;
	}
	.model-add-row input {
		flex: 1;
		min-height: 34px;
		padding: 6px 10px;
		font-size: var(--text-body-sm);
		line-height: var(--text-body-sm--line-height);
		letter-spacing: var(--text-body-sm--letter-spacing);
		margin: 0;
	}
	:global(.add-model-btn) {
		font-family: var(--font-body);
		font-size: var(--text-label-sm);
		line-height: var(--text-label-sm--line-height);
		letter-spacing: var(--text-label-sm--letter-spacing);
		font-weight: 500;
	}
</style>
