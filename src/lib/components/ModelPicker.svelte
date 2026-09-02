<script lang="ts">
	import { Check, ChevronDown, Bot, Search } from '@lucide/svelte';
	import { SvelteMap } from 'svelte/reactivity';
	import { tick } from 'svelte';

	export type ThinkingLevel = 'off' | 'minimal' | 'low' | 'medium' | 'high' | 'xhigh' | 'max';

	export type ModelOption = {
		id: string;
		provider: string;
		name: string;
		configured: boolean;
		userConfigured: boolean;
		capabilities?: {
			vision: boolean;
			tools: boolean;
			reasoning: boolean;
			thinkingLevels?: ThinkingLevel[];
		};
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
	let search = $state('');
	let root = $state<HTMLDivElement | undefined>();
	let trigger = $state<HTMLButtonElement | undefined>();
	let searchInput = $state<HTMLInputElement | undefined>();

	const providerNames: Record<string, string> = {
		openai: 'OpenAI',
		anthropic: 'Anthropic',
		google: 'Google'
	};

	let selected = $derived(models.find((model) => modelRef(model) === value));
	let selectedLabel = $derived(selected?.name ?? (value ? modelId(value) : placeholder));
	let groups = $derived.by(() => {
		const grouped = new SvelteMap<string, ModelOption[]>();
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
	let filteredGroups = $derived.by(() => {
		const q = search.trim().toLowerCase();
		if (!q) return groups;
		return groups
			.map((group) => ({
				...group,
				models: group.models.filter(
					(m) =>
						m.name.toLowerCase().includes(q) ||
						m.id.toLowerCase().includes(q) ||
						group.label.toLowerCase().includes(q)
				)
			}))
			.filter((group) => group.models.length > 0);
	});

	let flatModels = $derived(filteredGroups.flatMap((group) => group.models));
	let highlightedIndex = $state(0);
	let listElement = $state<HTMLDivElement | undefined>();

	let placement = $state<'top' | 'bottom'>('top');
	let maxHeight = $state<string | undefined>(undefined);

	function modelRef(model: ModelOption) {
		return `${model.provider}/${model.id}`;
	}

	function modelId(modelRefValue: string) {
		return modelRefValue.split('/').slice(1).join('/') || modelRefValue;
	}

	function scrollHighlightedIntoView(idx: number) {
		tick().then(() => {
			const el = listElement?.querySelector<HTMLElement>(`[data-model-idx="${idx}"]`);
			el?.scrollIntoView({ block: 'nearest' });
		});
	}

	$effect(() => {
		void search;
		highlightedIndex = 0;
	});

	function updatePlacement() {
		if (!trigger) return;
		const rect = trigger.getBoundingClientRect();
		const spaceAbove = rect.top;
		const spaceBelow = window.innerHeight - rect.bottom;
		if (spaceAbove < 320 && spaceBelow > spaceAbove) {
			placement = 'bottom';
			maxHeight = `${Math.max(160, Math.min(420, spaceBelow - 20))}px`;
		} else {
			placement = 'top';
			maxHeight = `${Math.max(160, Math.min(420, spaceAbove - 20))}px`;
		}
	}

	function toggle() {
		if (disabled || loading || models.length === 0) return;
		open = !open;
		if (open) {
			updatePlacement();
			search = '';
			const currentIdx = flatModels.findIndex((m) => modelRef(m) === value);
			highlightedIndex = currentIdx >= 0 ? currentIdx : 0;
			tick().then(() => {
				updatePlacement();
				searchInput?.focus();
				scrollHighlightedIntoView(highlightedIndex);
			});
		}
	}

	function choose(model: ModelOption) {
		open = false;
		search = '';
		void onselect?.(modelRef(model));
	}

	function closeOnOutsideClick(event: MouseEvent) {
		if (!open || !root) return;
		if (event.target instanceof Node && !root.contains(event.target)) {
			open = false;
			search = '';
		}
	}

	function handleKeydown(event: KeyboardEvent) {
		if (event.key === 'Escape' && open) {
			open = false;
			search = '';
			trigger?.focus();
		}
	}

	function handleMenuKeydown(event: KeyboardEvent) {
		if (!open || flatModels.length === 0) return;

		if (event.key === 'ArrowDown') {
			event.preventDefault();
			highlightedIndex = (highlightedIndex + 1) % flatModels.length;
			scrollHighlightedIntoView(highlightedIndex);
		} else if (event.key === 'ArrowUp') {
			event.preventDefault();
			highlightedIndex = (highlightedIndex - 1 + flatModels.length) % flatModels.length;
			scrollHighlightedIntoView(highlightedIndex);
		} else if (event.key === 'Enter') {
			event.preventDefault();
			const target = flatModels[highlightedIndex];
			if (target) {
				choose(target);
			}
		} else if (event.key === 'Escape') {
			event.preventDefault();
			open = false;
			search = '';
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
		onkeydown={(e) => {
			if (!open && (e.key === 'ArrowDown' || e.key === 'ArrowUp')) {
				e.preventDefault();
				toggle();
			}
		}}
		bind:this={trigger}
	>
		<Bot size={15} aria-hidden="true" />
		<span class="model-trigger-label">{loading ? 'Loading models...' : selectedLabel}</span>
		<ChevronDown size={13} class={open ? 'rotated' : undefined} aria-hidden="true" />
	</button>

	{#if open}
		<button
			type="button"
			class="picker-backdrop"
			onclick={() => {
				open = false;
				search = '';
			}}
			aria-label="Close menu"
			tabindex="-1"
		></button>
		<div
			class="model-menu"
			class:placement-bottom={placement === 'bottom'}
			style:max-height={maxHeight}
			role="listbox"
			aria-label="Available models"
			tabindex="-1"
			onkeydown={handleMenuKeydown}
		>
			<div class="model-list" bind:this={listElement}>
				{#each filteredGroups as group (group.provider)}
					<div class="model-group">
						<div class="model-group-label">{group.label}</div>
						{#each group.models as model (modelRef(model))}
							{@const ref = modelRef(model)}
							{@const modelIdx = flatModels.indexOf(model)}
							{@const isHighlighted = modelIdx === highlightedIndex}
							<button
								type="button"
								class="model-option"
								class:selected={ref === value}
								class:highlighted={isHighlighted}
								role="option"
								aria-selected={ref === value}
								data-model-idx={modelIdx}
								onclick={() => choose(model)}
								onmousemove={() => {
									highlightedIndex = modelIdx;
								}}
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
				{#if filteredGroups.length === 0}
					<div class="model-no-results">No models match "{search}"</div>
				{/if}
			</div>
			<div class="model-search">
				<Search size={14} aria-hidden="true" />
				<input
					bind:this={searchInput}
					bind:value={search}
					type="text"
					placeholder="Search models..."
					aria-label="Search models"
					autocomplete="off"
				/>
			</div>
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
		display: flex;
		flex-direction: column;
		padding: 6px;
		border: 1px solid var(--border-strong);
		border-radius: 9px;
		background: var(--surface);
		box-shadow: 0 14px 32px var(--shadow);
	}
	.model-menu.placement-bottom {
		bottom: auto;
		top: calc(100% + 8px);
	}
	.model-list {
		flex: 1 1 auto;
		min-height: 0;
		overflow-y: auto;
		padding-bottom: 2px;
	}
	.model-search {
		display: flex;
		align-items: center;
		gap: 7px;
		padding: 6px 8px;
		margin-top: 6px;
		margin-bottom: 0;
		border: 1px solid var(--border);
		border-radius: 6px;
		background: var(--surface-subtle);
		color: var(--text-dim);
		flex-shrink: 0;
	}
	.model-search input {
		flex: 1;
		min-width: 0;
		border: 0;
		outline: 0;
		background: transparent;
		font: inherit;
		font-size: var(--text-sm);
		color: var(--text-body);
	}
	.model-search input::placeholder {
		color: var(--text-dim);
	}
	.model-no-results {
		padding: 16px 8px;
		text-align: center;
		color: var(--text-dim);
		font-size: var(--text-sm);
	}
	.model-group + .model-group {
		margin-top: 5px;
		padding-top: 5px;
		border-top: 1px solid var(--border);
	}
	.model-group-label {
		padding: 6px 8px 5px;
		color: var(--text-muted);
		font-size: var(--text-xs);
		font-weight: 600;
		letter-spacing: 0.04em;
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
	.model-option.highlighted,
	.model-option.selected {
		background: var(--surface-hover);
	}
	.model-option.highlighted,
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
		padding: 2px 5px;
		color: var(--status-ok-text);
		font-size: var(--text-xs);
		line-height: 1.2;
		white-space: nowrap;
	}
	.picker-backdrop {
		display: none;
	}
	@media (max-width: 700px) {
		.picker-backdrop {
			display: block;
			position: fixed;
			inset: 0;
			background: var(--overlay);
			backdrop-filter: blur(2px);
			-webkit-backdrop-filter: blur(2px);
			z-index: 65;
			border: 0;
			padding: 0;
			margin: 0;
			cursor: pointer;
		}
		.model-trigger {
			min-height: 34px;
			padding: 5px 8px;
			font-size: var(--text-xs);
			max-width: min(190px, 45vw);
		}
		.model-menu {
			position: fixed;
			top: auto;
			bottom: calc(env(safe-area-inset-bottom, 0px) + 16px);
			left: 12px;
			right: 12px;
			width: auto;
			max-width: calc(100vw - 24px);
			max-height: min(460px, 75dvh) !important;
			z-index: 70;
			border-radius: 12px;
			box-shadow: 0 16px 48px var(--shadow);
		}
	}
</style>
