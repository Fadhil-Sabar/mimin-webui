<script lang="ts">
	import { Check, ChevronDown, Bot } from '@lucide/svelte';

	export type ModelOption = {
		id: string;
		provider: string;
		name: string;
		configured: boolean;
		userConfigured: boolean;
	};

	type Props = {
		models: ModelOption[];
		value: string;
		loading?: boolean;
		disabled?: boolean;
		placeholder?: string;
		onselect?: (value: string) => void | Promise<void>;
	};

	let {
		models,
		value,
		loading = false,
		disabled = false,
		placeholder = 'Pick a model',
		onselect
	}: Props = $props();

	let open = $state(false);
	let root: HTMLDivElement | undefined;
	let trigger: HTMLButtonElement | undefined;

	const providerNames: Record<string, string> = {
		openai: 'OpenAI',
		anthropic: 'Anthropic',
		google: 'Google'
	};

	let selected = $derived(models.find((model) => modelRef(model) === value));
	let selectedLabel = $derived(selected?.name ?? (value ? modelId(value) : placeholder));
	let groups = $derived.by(() => {
		const grouped = new Map<string, ModelOption[]>();
		for (const model of models) {
			const current = grouped.get(model.provider) ?? [];
			current.push(model);
			grouped.set(model.provider, current);
		}
		return [...grouped.entries()].map(([provider, providerModels]) => ({
			provider,
			label: providerNames[provider] ?? provider,
			models: providerModels
		}));
	});

	function modelRef(model: ModelOption) {
		return `${model.provider}/${model.id}`;
	}

	function modelId(modelRefValue: string) {
		return modelRefValue.split('/').slice(1).join('/') || modelRefValue;
	}

	function toggle() {
		if (disabled || loading || models.length === 0) return;
		open = !open;
	}

	function choose(model: ModelOption) {
		open = false;
		void onselect?.(modelRef(model));
	}

	function closeOnOutsideClick(event: MouseEvent) {
		if (!open || !root) return;
		if (event.target instanceof Node && !root.contains(event.target)) open = false;
	}

	function handleKeydown(event: KeyboardEvent) {
		if (event.key === 'Escape' && open) {
			open = false;
			trigger?.focus();
		}
	}
</script>

<svelte:window onclick={closeOnOutsideClick} onkeydown={handleKeydown} />

<div class="model-picker" bind:this={root}>
	<button
		type="button"
		class="model-trigger"
		disabled={disabled || loading || models.length === 0}
		aria-haspopup="listbox"
		aria-expanded={open}
		onclick={toggle}
		bind:this={trigger}
	>
		<Bot size={15} aria-hidden="true" />
		<span class="model-trigger-label">{loading ? 'Loading models...' : selectedLabel}</span>
		<ChevronDown size={13} class={open ? 'rotated' : undefined} aria-hidden="true" />
	</button>

	{#if open}
		<div class="model-menu" role="listbox" aria-label="Available models">
			{#each groups as group (group.provider)}
				<div class="model-group">
					<div class="model-group-label">{group.label}</div>
					{#each group.models as model (modelRef(model))}
						{@const ref = modelRef(model)}
						<button
							type="button"
							class="model-option"
							class:selected={ref === value}
							role="option"
							aria-selected={ref === value}
							onclick={() => choose(model)}
						>
							<span class="model-option-copy">
								<strong>{model.name}</strong>
								<small>{model.id}</small>
							</span>
							{#if model.userConfigured}
								<span class="model-badge">Your key</span>
							{:else if model.configured}
								<span class="model-badge">Server key</span>
							{/if}
							{#if ref === value}<Check size={14} aria-hidden="true" />{/if}
						</button>
					{/each}
				</div>
			{/each}
		</div>
	{/if}
</div>

<style>
	.model-picker {
		position: relative;
		min-width: 0;
	}
	.model-trigger {
		display: inline-flex;
		align-items: center;
		gap: 6px;
		min-height: 38px;
		min-width: 0;
		max-width: 260px;
		border: 1px solid var(--border);
		border-radius: 6px;
		background: var(--surface-subtle);
		padding: 7px 9px;
		color: var(--text-muted);
		font-size: var(--text-sm);
		transition: 0.18s ease;
	}
	.model-trigger:hover:not(:disabled) {
		color: var(--text-strong);
		border-color: var(--text-faint);
	}
	.model-trigger:disabled {
		opacity: 0.72;
	}
	.model-trigger-label {
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
	}
	.model-trigger :global(svg:last-child) {
		flex: 0 0 auto;
		color: var(--text-faint);
		transition: transform 0.18s ease;
	}
	.model-trigger :global(svg:last-child.rotated) {
		transform: rotate(180deg);
	}
	.model-menu {
		position: absolute;
		bottom: calc(100% + 8px);
		left: 0;
		z-index: 20;
		width: min(360px, calc(100vw - 36px));
		max-height: min(420px, 58vh);
		overflow-y: auto;
		padding: 6px;
		border: 1px solid var(--border-strong);
		border-radius: 9px;
		background: var(--surface);
		box-shadow: 0 14px 32px var(--shadow);
	}
	.model-group + .model-group {
		margin-top: 5px;
		padding-top: 5px;
		border-top: 1px solid var(--border);
	}
	.model-group-label {
		padding: 6px 8px 5px;
		color: var(--text-dim);
		font-size: var(--text-xs);
		font-weight: 600;
		letter-spacing: 0.08em;
		text-transform: uppercase;
	}
	.model-option {
		display: flex;
		align-items: center;
		gap: 8px;
		width: 100%;
		border: 0;
		border-radius: 6px;
		background: transparent;
		padding: 8px;
		color: var(--text-body);
		text-align: left;
	}
	.model-option:hover,
	.model-option.selected {
		background: var(--surface-hover);
	}
	.model-option.selected {
		color: var(--text-strong);
	}
	.model-option > :global(svg:last-child) {
		margin-left: auto;
		color: var(--accent-bg);
	}
	.model-option-copy {
		display: grid;
		min-width: 0;
		gap: 2px;
	}
	.model-option-copy strong,
	.model-option-copy small {
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
	}
	.model-option-copy strong {
		font-size: var(--text-sm);
		font-weight: 500;
	}
	.model-option-copy small {
		color: var(--text-dim);
		font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
		font-size: var(--text-xs);
	}
	.model-badge {
		margin-left: auto;
		border: 1px solid color-mix(in srgb, var(--status-ok-dot) 35%, transparent);
		border-radius: 4px;
		padding: 2px 4px;
		color: var(--status-ok-text);
		font-size: 10px;
		white-space: nowrap;
	}
	@media (max-width: 700px) {
		.model-trigger {
			max-width: min(230px, 58vw);
		}
		.model-menu {
			left: auto;
			right: 0;
		}
	}
</style>
