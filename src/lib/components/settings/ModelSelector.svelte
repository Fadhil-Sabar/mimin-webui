<script lang="ts">
	import { Plus, Search, Trash2, X } from '@lucide/svelte';
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
			<span class="field-title">Models</span>
			<span class="models-count-badge">
				{#if models.length > 0}
					{checkedCount} selected
				{:else}
					auto-retrieved if blank
				{/if}
			</span>
		</div>
		<div class="models-header-actions">
			<button type="button" class="fetch-models-btn" onclick={ondiscover} disabled={discovering}>
				{discovering ? 'Fetching...' : 'Fetch models'}
			</button>
		</div>
	</div>

	{#if textEditMode}
		<div class="text-mode-bar">
			<button type="button" class="text-mode-toggle-btn active" onclick={toggleTextMode}>
				Raw text mode (click to switch to list)
			</button>
		</div>
		<textarea
			class="raw-textarea"
			bind:value={draftModels}
			rows="5"
			placeholder="Leave blank to retrieve automatically, or enter one model ID per line"
		></textarea>
	{:else}
		{#if models.length > 0}
			<div class="models-toolbar">
				<div class="btn-group-selection">
					<button type="button" class="filter-btn" onclick={selectAll} title="Select all models">
						All
					</button>
					<button type="button" class="filter-btn" onclick={selectNone} title="Deselect all models">
						None
					</button>
					<button
						type="button"
						class="filter-btn"
						onclick={reverseSelection}
						title="Invert selection"
					>
						Reverse
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
				<button type="button" class="raw-text-pill" onclick={toggleTextMode}> Raw text </button>
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
				placeholder="Add model manually (e.g. meta-llama/llama-3.3-70b-instruct:free)"
				onkeydown={(e) => e.key === 'Enter' && (e.preventDefault(), addManualModel())}
			/>
			<button
				type="button"
				class="add-model-btn"
				onclick={addManualModel}
				disabled={!manualModelId.trim()}
			>
				<Plus size={14} /> <span>Add</span>
			</button>
		</div>
	{/if}
</div>

<style>
	.models-section {
		margin-top: 16px;
		display: flex;
		flex-direction: column;
		gap: 10px;
	}
	.models-label-row {
		display: flex;
		align-items: center;
		justify-content: space-between;
		gap: 10px;
	}
	.models-title-wrap {
		display: flex;
		align-items: center;
		gap: 8px;
	}
	.field-title {
		font-size: 13px;
		font-weight: 500;
		color: #ececee;
	}
	.models-count-badge {
		font-size: 12px;
		color: #71717a;
	}
	.models-header-actions {
		display: flex;
		align-items: center;
		gap: 6px;
	}
	.fetch-models-btn {
		background: #26262b;
		border: 1px solid #34343a;
		border-radius: 8px;
		color: #ececee;
		font-family: var(--font-body);
		font-size: 12px;
		font-weight: 500;
		padding: 5px 12px;
		cursor: pointer;
		transition:
			background-color var(--duration-short2) var(--ease-standard),
			border-color var(--duration-short2) var(--ease-standard);
	}
	.fetch-models-btn:hover:not(:disabled) {
		background: #2f2f35;
		border-color: #404046;
	}
	.fetch-models-btn:disabled {
		opacity: 0.5;
		cursor: not-allowed;
	}
	.text-mode-bar {
		display: flex;
		margin-bottom: 4px;
	}
	.text-mode-toggle-btn {
		background: transparent;
		border: 0;
		color: #a1a1aa;
		font-size: 12px;
		cursor: pointer;
		text-decoration: underline;
		text-underline-offset: 2px;
	}
	.text-mode-toggle-btn:hover {
		color: #ececee;
	}
	.raw-textarea {
		width: 100%;
		background: #151517;
		border: 1px solid #2c2c30;
		border-radius: 10px;
		color: #ececee;
		font-family: var(--font-mono);
		font-size: 13px;
		padding: 10px 12px;
		outline: none;
		resize: vertical;
	}
	.raw-textarea:focus {
		border-color: #3f3f45;
	}
	.models-toolbar {
		display: flex;
		align-items: center;
		justify-content: space-between;
		gap: 8px;
		flex-wrap: wrap;
	}
	.btn-group-selection {
		display: inline-flex;
		align-items: center;
		background: #1b1b1e;
		border: 1px solid #2c2c30;
		border-radius: 8px;
		overflow: hidden;
	}
	.filter-btn {
		background: transparent;
		border: none;
		border-right: 1px solid #2c2c30;
		color: #a1a1aa;
		font-family: var(--font-body);
		font-size: 12px;
		font-weight: 500;
		padding: 4px 10px;
		cursor: pointer;
		transition:
			background-color var(--duration-short2) var(--ease-standard),
			color var(--duration-short2) var(--ease-standard);
	}
	.filter-btn:last-child {
		border-right: none;
	}
	.filter-btn:hover {
		background: #242428;
		color: #ececee;
	}
	.filter-btn.free-btn {
		color: #4ade80;
	}
	.raw-text-pill {
		background: #1b1b1e;
		border: 1px solid #2c2c30;
		border-radius: 8px;
		color: #a1a1aa;
		font-size: 12px;
		font-weight: 500;
		padding: 4px 10px;
		cursor: pointer;
		transition:
			background-color var(--duration-short2) var(--ease-standard),
			color var(--duration-short2) var(--ease-standard);
	}
	.raw-text-pill:hover {
		background: #242428;
		color: #ececee;
	}
	.models-search-box {
		display: flex;
		align-items: center;
		gap: 6px;
		background: #151517;
		border: 1px solid #2c2c30;
		border-radius: 8px;
		padding: 3px 10px;
		color: #71717a;
		min-width: 140px;
		transition: border-color var(--duration-short2) var(--ease-standard);
	}
	.models-search-box:focus-within {
		border-color: #3f3f45;
	}
	.models-search-box input {
		width: 100%;
		border: none;
		background: transparent;
		color: #ececee;
		font-size: 12px;
		outline: none;
		padding: 0;
	}
	.models-search-box input::placeholder {
		color: #71717a;
	}
	.clear-search-btn {
		background: transparent;
		border: none;
		color: #71717a;
		cursor: pointer;
		padding: 0;
		display: flex;
		align-items: center;
	}
	.clear-search-btn:hover {
		color: #ececee;
	}
	.models-list-box {
		max-height: 240px;
		overflow-y: auto;
		border: 1px solid #2c2c30;
		border-radius: 10px;
		background: #151517;
		display: flex;
		flex-direction: column;
	}
	.model-row {
		display: flex;
		align-items: center;
		gap: 10px;
		padding: 8px 12px;
		border-bottom: 1px solid #202024;
		cursor: pointer;
		transition: background-color var(--duration-short2) var(--ease-standard);
		user-select: none;
	}
	.model-row:last-child {
		border-bottom: none;
	}
	.model-row:hover {
		background: #1c1c20;
	}
	.model-row.unchecked {
		opacity: 0.55;
	}
	.model-row-checkbox {
		width: 15px;
		height: 15px;
		margin: 0;
		cursor: pointer;
		flex-shrink: 0;
		accent-color: #f4f4f5;
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
		gap: 8px;
		flex-wrap: wrap;
	}
	.mono {
		font-family: var(--font-mono);
	}
	.model-row-id {
		font-size: 13px;
		color: #ececee;
		word-break: break-all;
	}
	.model-row-name {
		font-size: 11px;
		color: #71717a;
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
	}
	.model-badge-free {
		font-size: 11px;
		font-weight: 500;
		padding: 1px 6px;
		border-radius: 6px;
		color: #4ade80;
		background: #182c1e;
		border: 1px solid #234a2e;
	}
	.model-badge-meta {
		font-size: 11px;
		padding: 1px 5px;
		border-radius: 4px;
		color: #71717a;
		background: #1f1f23;
		border: 1px solid #2c2c30;
	}
	.model-remove-btn {
		background: transparent;
		border: none;
		color: #71717a;
		cursor: pointer;
		padding: 4px;
		border-radius: 4px;
		opacity: 0;
		transition:
			opacity var(--duration-short2) var(--ease-standard),
			color var(--duration-short2) var(--ease-standard);
		display: flex;
		align-items: center;
	}
	.model-row:hover .model-remove-btn {
		opacity: 0.8;
	}
	.model-remove-btn:hover {
		opacity: 1;
		color: #f87171;
	}
	.models-empty-state {
		border: 1px dashed #2c2c30;
		border-radius: 10px;
		padding: 18px 14px;
		text-align: center;
		background: #151517;
	}
	.models-empty-state p {
		margin: 0;
		font-size: 13px;
		color: #71717a;
	}
	.models-empty-filter {
		padding: 16px;
		text-align: center;
		font-size: 13px;
		color: #71717a;
	}
	.model-add-row {
		display: flex;
		align-items: center;
		gap: 8px;
		margin-top: 4px;
	}
	.model-add-row input {
		flex: 1;
		height: 36px;
		padding: 0 12px;
		background: #151517;
		border: 1px solid #2c2c30;
		border-radius: 8px;
		color: #ececee;
		font-size: 12px;
		outline: none;
		transition: border-color var(--duration-short2) var(--ease-standard);
	}
	.model-add-row input:focus {
		border-color: #3f3f45;
	}
	.model-add-row input::placeholder {
		color: #71717a;
	}
	.add-model-btn {
		display: inline-flex;
		align-items: center;
		gap: 6px;
		height: 36px;
		padding: 0 14px;
		background: #26262b;
		border: 1px solid #34343a;
		border-radius: 8px;
		color: #ececee;
		font-size: 12px;
		font-weight: 500;
		cursor: pointer;
		transition:
			background-color var(--duration-short2) var(--ease-standard),
			border-color var(--duration-short2) var(--ease-standard);
	}
	.add-model-btn:hover:not(:disabled) {
		background: #2f2f35;
		border-color: #404046;
	}
	.add-model-btn:disabled {
		opacity: 0.5;
		cursor: not-allowed;
	}
</style>
