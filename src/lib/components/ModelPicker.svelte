<script lang="ts">
	import { Check, ChevronDown, Bot, Brain, Search } from '@lucide/svelte';
	import { SvelteMap } from 'svelte/reactivity';
	import { tick } from 'svelte';
	import * as Popover from '$lib/components/ui/popover/index.js';
	import * as Sheet from '$lib/components/ui/sheet/index.js';
	import { modelRef } from '$lib/format';

	export type ThinkingLevel = 'off' | 'minimal' | 'low' | 'medium' | 'high' | 'xhigh' | 'max';

	export type ModelOption = {
		id: string;
		provider: string;
		providerName?: string;
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
		thinkingLevels?: ThinkingLevel[];
		thinkingLevel?: string;
		onselect?: (value: string) => void | Promise<void>;
		onselectthinkinglevel?: (level: string) => void | Promise<void>;
	};

	let {
		models,
		value,
		loading = false,
		disabled = false,
		placeholder = 'Pick a model',
		thinkingLevels = [],
		thinkingLevel = 'off',
		onselect,
		onselectthinkinglevel
	}: Props = $props();

	let open = $state(false);
	let search = $state('');
	let searchInput = $state<HTMLInputElement | undefined>();
	let isMobile = $state(false);
	let listElement = $state<HTMLDivElement | undefined>();
	let highlightedIndex = $state(0);
	let previewIndex = $state(0);
	let thinkingSlider = $state<HTMLInputElement | undefined>();

	const providerNames: Record<string, string> = {
		openai: 'OpenAI',
		anthropic: 'Anthropic',
		google: 'Google'
	};

	let selected = $derived(models.find((model) => modelRef(model) === value));
	let selectedLabel = $derived(selected?.name ?? (value ? modelId(value) : placeholder));
	let triggerDisabled = $derived(disabled || loading || models.length === 0);
	let showThinking = $derived(
		!!onselectthinkinglevel && !!selected && thinkingLevels.some((level) => level !== 'off')
	);
	let effectiveThinkingLevel = $derived(thinkingLevels[previewIndex] ?? thinkingLevel);
	let triggerTitle = $derived(
		showThinking
			? `${selectedLabel} · Thinking ${thinkingLabel(effectiveThinkingLevel)}`
			: selectedLabel
	);

	let groups = $derived.by(() => {
		const grouped = new SvelteMap<string, ModelOption[]>();
		for (const model of models) {
			const current = grouped.get(model.provider) ?? [];
			current.push(model);
			grouped.set(model.provider, current);
		}
		return [...grouped.entries()].map(([provider, providerModels]) => ({
			provider,
			label:
				providerModels.find((m) => m.providerName)?.providerName ??
				providerNames[provider] ??
				(provider.startsWith('custom_') ? 'Custom Provider' : provider),
			models: providerModels
		}));
	});

	function fuzzyMatch(text: string, query: string): number | null {
		const lower = text.toLowerCase();
		// Fast path: exact substring match gets highest score
		if (lower.includes(query)) return 10000 - lower.indexOf(query);

		let score = 0;
		let qi = 0;
		let prevMatchIdx = -2;
		for (let i = 0; i < lower.length && qi < query.length; i++) {
			if (lower[i] === query[qi]) {
				score += 1;
				// Consecutive character bonus
				if (i === prevMatchIdx + 1) score += 5;
				// Start-of-word bonus (after separator or at position 0)
				if (i === 0 || /[\s\-_./]/.test(lower[i - 1])) score += 3;
				prevMatchIdx = i;
				qi++;
			}
		}
		// All query chars must be found in order
		return qi === query.length ? score : null;
	}

	function bestFuzzyScore(model: ModelOption, query: string, groupLabel: string): number | null {
		const scores = [
			fuzzyMatch(model.name, query),
			fuzzyMatch(model.id, query),
			fuzzyMatch(model.providerName ?? '', query),
			fuzzyMatch(groupLabel, query)
		].filter((s): s is number => s !== null);
		return scores.length > 0 ? Math.max(...scores) : null;
	}

	let filteredGroups = $derived.by(() => {
		const q = search.trim().toLowerCase();
		if (!q) return groups;
		return groups
			.map((group) => {
				const scored = group.models
					.map((m) => ({ model: m, score: bestFuzzyScore(m, q, group.label) }))
					.filter((entry): entry is { model: ModelOption; score: number } => entry.score !== null)
					.sort((a, b) => b.score - a.score);
				return { ...group, models: scored.map((s) => s.model) };
			})
			.filter((group) => group.models.length > 0);
	});

	let flatModels = $derived(filteredGroups.flatMap((group) => group.models));

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

	$effect(() => {
		const query = window.matchMedia('(max-width: 700px)');
		isMobile = query.matches;
		const onChange = (event: MediaQueryListEvent) => (isMobile = event.matches);
		query.addEventListener('change', onChange);
		return () => query.removeEventListener('change', onChange);
	});

	function syncPreviewIndex() {
		const index = thinkingLevels.indexOf(thinkingLevel as ThinkingLevel);
		previewIndex = index >= 0 ? index : 0;
	}

	$effect(() => {
		void thinkingLevel;
		void value;
		void thinkingLevels;
		syncPreviewIndex();
	});

	function handleOpenChange(next: boolean) {
		open = next;
		if (next) {
			search = '';
			const currentIdx = flatModels.findIndex((m) => modelRef(m) === value);
			highlightedIndex = currentIdx >= 0 ? currentIdx : 0;
			scrollHighlightedIntoView(highlightedIndex);
		} else {
			search = '';
			syncPreviewIndex();
		}
	}

	function handleOpenAutoFocus(event: Event) {
		event.preventDefault();
		searchInput?.focus();
	}

	function choose(model: ModelOption) {
		if (triggerDisabled) return;
		// Keep the composer picker open so thinking can be adjusted after the model saves.
		// Model-only callers, such as the home page, retain their close-on-select behavior.
		if (!onselectthinkinglevel) {
			open = false;
			search = '';
		}
		void onselect?.(modelRef(model));
	}

	function thinkingLabel(level: string) {
		return level === 'xhigh' ? 'Extra high' : `${level[0]?.toUpperCase() ?? ''}${level.slice(1)}`;
	}

	async function commitThinkingLevel() {
		if (triggerDisabled || !showThinking) return;
		const level = thinkingLevels[previewIndex];
		if (!level || level === thinkingLevel) return;
		const slider = thinkingSlider;
		const restoreFocus = document.activeElement === slider;
		await onselectthinkinglevel?.(level);
		await tick();
		// Saving disables the focused input. Resume keyboard adjustment without stealing focus.
		if (
			restoreFocus &&
			open &&
			!triggerDisabled &&
			thinkingSlider === slider &&
			document.activeElement === document.body
		)
			slider?.focus({ preventScroll: true });
	}

	function handleMenuKeydown(event: KeyboardEvent) {
		if (
			!open ||
			triggerDisabled ||
			flatModels.length === 0 ||
			(event.target instanceof HTMLInputElement && event.target.type === 'range')
		)
			return;

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
		}
	}
</script>

{#snippet pickerBody()}
	<div
		class="model-list"
		bind:this={listElement}
		role="listbox"
		aria-label="Available models"
		tabindex={-1}
		onkeydown={handleMenuKeydown}
	>
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
						data-model-ref={ref}
						disabled={triggerDisabled}
						onclick={() => choose(model)}
						onfocus={() => (highlightedIndex = modelIdx)}
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
			onkeydown={handleMenuKeydown}
		/>
	</div>
	{#if showThinking}
		<div class="model-thinking">
			<div class="model-thinking-heading">
				<div class="model-thinking-label"><Brain size={14} aria-hidden="true" />Thinking</div>
				<span class="model-thinking-value">{thinkingLabel(effectiveThinkingLevel)}</span>
			</div>
			<div class="model-thinking-rail">
				<div
					class="model-thinking-fill"
					style:--thinking-progress={thinkingLevels.length > 1
						? previewIndex / (thinkingLevels.length - 1)
						: 0}
				></div>
				<div class="model-thinking-stops" aria-hidden="true">
					{#each thinkingLevels as level, index (level)}
						<span
							class="model-thinking-stop"
							class:filled={index <= previewIndex}
							data-level={level}
							data-filled={index <= previewIndex}
						></span>
					{/each}
				</div>
				<input
					class="model-thinking-slider"
					bind:this={thinkingSlider}
					bind:value={previewIndex}
					type="range"
					min="0"
					max={Math.max(0, thinkingLevels.length - 1)}
					step="1"
					aria-label="Thinking level"
					aria-valuetext={thinkingLabel(effectiveThinkingLevel)}
					disabled={triggerDisabled || thinkingLevels.length === 0}
					onchange={commitThinkingLevel}
				/>
			</div>
		</div>
	{/if}
{/snippet}

{#snippet triggerBody()}
	<Bot size={15} aria-hidden="true" />
	<span class="model-trigger-label">{loading ? 'Loading models...' : selectedLabel}</span>
	{#if showThinking && !loading}
		<span class="model-trigger-thinking">{thinkingLabel(effectiveThinkingLevel)}</span>
	{/if}
	<ChevronDown size={13} class={open ? 'rotated' : undefined} aria-hidden="true" />
{/snippet}

{#if isMobile}
	<Sheet.Root bind:open onOpenChange={handleOpenChange}>
		<Sheet.Trigger class="model-trigger" disabled={triggerDisabled} title={triggerTitle}>
			{@render triggerBody()}
		</Sheet.Trigger>
		<Sheet.Content side="bottom" showCloseButton={false} class="model-menu gap-0 p-1.5">
			<Sheet.Title class="sr-only">Model settings</Sheet.Title>
			<Sheet.Description class="sr-only">Choose a model and its thinking level.</Sheet.Description>
			{@render pickerBody()}
		</Sheet.Content>
	</Sheet.Root>
{:else}
	<Popover.Root bind:open onOpenChange={handleOpenChange}>
		<Popover.Trigger class="model-trigger" disabled={triggerDisabled} title={triggerTitle}>
			{@render triggerBody()}
		</Popover.Trigger>
		<Popover.Content
			side="top"
			sideOffset={8}
			avoidCollisions
			class="model-menu max-h-[min(420px,58vh)] w-[min(360px,calc(100vw-36px))] gap-0 rounded-[9px] border border-[var(--border-strong)] p-1.5 shadow-[0_14px_32px_var(--shadow)] ring-0"
			aria-label="Model settings"
			tabindex={-1}
			onOpenAutoFocus={handleOpenAutoFocus}
		>
			{@render pickerBody()}
		</Popover.Content>
	</Popover.Root>
{/if}

<style>
	:global(.model-trigger) {
		display: inline-flex;
		align-items: center;
		gap: 6px;
		min-height: 38px;
		min-width: 0;
		max-width: 320px;
		border: 1px solid var(--border);
		border-radius: var(--radius-md);
		background: var(--surface-subtle);
		padding: 7px 9px;
		color: var(--text-muted);
		font-size: var(--text-body-md);
		line-height: var(--text-body-md--line-height);
		letter-spacing: var(--text-body-md--letter-spacing);
		transition:
			color var(--duration-short4) var(--ease-standard),
			background var(--duration-short4) var(--ease-standard),
			border-color var(--duration-short4) var(--ease-standard);
	}
	:global(.model-trigger:hover:not(:disabled)) {
		color: var(--text-strong);
		border-color: var(--text-faint);
	}
	:global(.model-trigger:disabled) {
		opacity: 0.72;
	}
	.model-trigger-label {
		min-width: 0;
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
	}
	.model-trigger-thinking {
		flex: 0 0 auto;
		border-left: 1px solid var(--border);
		padding-left: 6px;
		color: var(--text-dim);
		font-size: var(--text-body-sm);
		line-height: var(--text-body-sm--line-height);
		white-space: nowrap;
	}
	:global(.model-trigger svg) {
		flex: 0 0 auto;
	}
	:global(.model-trigger svg:last-child) {
		flex: 0 0 auto;
		color: var(--text-faint);
		transition: transform var(--duration-short4) var(--ease-standard);
	}
	:global(.model-trigger svg:last-child.rotated) {
		transform: rotate(180deg);
	}
	:global(.model-menu) {
		display: flex;
		flex-direction: column;
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
		padding: 6px var(--space-2);
		margin-top: 6px;
		margin-bottom: 0;
		border: 1px solid var(--border);
		border-radius: var(--radius-md);
		background: var(--surface-subtle);
		color: var(--text-dim);
		flex-shrink: 0;
	}
	.model-thinking {
		flex-shrink: 0;
		margin-top: var(--space-2);
		border-top: 1px solid var(--border);
		padding: var(--space-2) 2px 2px;
	}
	.model-thinking-heading {
		display: flex;
		align-items: center;
		justify-content: space-between;
		gap: 8px;
		margin: 0 2px var(--space-2);
	}
	.model-thinking-label {
		display: flex;
		align-items: center;
		gap: 6px;
		color: var(--text-muted);
		font-size: var(--text-body-sm);
		line-height: var(--text-body-sm--line-height);
	}
	.model-thinking-value {
		color: var(--text-muted);
		font-size: var(--text-body-sm);
		font-weight: 500;
		line-height: var(--text-body-sm--line-height);
	}
	.model-thinking-rail {
		position: relative;
		height: 44px;
		border-radius: 999px;
		background: var(--surface-hover);
	}
	.model-thinking-fill {
		position: absolute;
		top: 0;
		left: 0;
		height: 100%;
		width: calc(44px + (100% - 44px) * var(--thinking-progress));
		border-radius: inherit;
		background: var(--text-muted);
		transition: width 180ms var(--ease-standard);
		pointer-events: none;
	}
	.model-thinking-stops {
		position: absolute;
		top: 50%;
		left: 22px;
		right: 22px;
		display: flex;
		justify-content: space-between;
		transform: translateY(-50%);
		pointer-events: none;
	}
	.model-thinking-stop {
		width: 7px;
		height: 7px;
		flex: 0 0 7px;
		margin: 0 -3.5px;
		border-radius: 50%;
		background: var(--text-faint);
	}
	.model-thinking-stop.filled {
		background: color-mix(in srgb, var(--surface) 60%, transparent);
	}
	.model-thinking-slider {
		position: absolute;
		top: 0;
		left: 5px;
		width: calc(100% - 10px);
		height: 44px;
		margin: 0;
		appearance: none;
		-webkit-appearance: none;
		background: transparent;
		cursor: pointer;
	}
	.model-thinking-slider:focus-visible {
		outline: 2px solid var(--focus);
		outline-offset: 2px;
		border-radius: 999px;
	}
	.model-thinking-slider:disabled {
		cursor: not-allowed;
		opacity: 0.72;
	}
	.model-thinking-slider::-webkit-slider-runnable-track {
		height: 44px;
		background: transparent;
	}
	.model-thinking-slider::-moz-range-track {
		height: 44px;
		background: transparent;
	}
	.model-thinking-slider::-webkit-slider-thumb {
		width: 34px;
		height: 34px;
		margin-top: 5px;
		border: 0;
		border-radius: 50%;
		appearance: none;
		-webkit-appearance: none;
		background: var(--surface);
		box-shadow: 0 2px 5px var(--shadow);
	}
	.model-thinking-slider::-moz-range-progress {
		background: transparent;
	}
	.model-thinking-slider::-moz-range-thumb {
		width: 34px;
		height: 34px;
		border: 0;
		border-radius: 50%;
		background: var(--surface);
		box-shadow: 0 2px 5px var(--shadow);
	}
	.model-option:disabled {
		opacity: 0.72;
		cursor: not-allowed;
	}
	.model-search input {
		flex: 1;
		min-width: 0;
		border: 0;
		background: transparent;
		font: inherit;
		font-size: var(--text-body-md);
		line-height: var(--text-body-md--line-height);
		letter-spacing: var(--text-body-md--letter-spacing);
		color: var(--text-body);
	}
	.model-search input::placeholder {
		color: var(--text-dim);
	}
	.model-no-results {
		padding: var(--space-4) var(--space-2);
		text-align: center;
		color: var(--text-dim);
		font-size: var(--text-body-md);
		line-height: var(--text-body-md--line-height);
		letter-spacing: var(--text-body-md--letter-spacing);
	}
	.model-group + .model-group {
		margin-top: 5px;
		padding-top: 5px;
		border-top: 1px solid var(--border);
	}
	.model-group-label {
		padding: 6px var(--space-2) 5px;
		color: var(--text-muted);
		font-size: var(--text-body-sm);
		line-height: var(--text-body-sm--line-height);
		letter-spacing: var(--text-body-sm--letter-spacing);
		font-weight: 500;
		text-transform: uppercase;
	}
	.model-option {
		display: flex;
		align-items: center;
		gap: var(--space-2);
		width: 100%;
		border: 0;
		border-radius: var(--radius-md);
		background: transparent;
		padding: var(--space-2);
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
		font-size: var(--text-body-md);
		line-height: var(--text-body-md--line-height);
		letter-spacing: var(--text-body-md--letter-spacing);
		font-weight: 500;
	}
	.model-option-copy small {
		color: var(--text-dim);
		font-family: var(--font-mono);
		font-size: var(--text-body-sm);
		line-height: var(--text-body-sm--line-height);
		letter-spacing: var(--text-body-sm--letter-spacing);
	}
	.model-badge {
		margin-left: auto;
		border: 1px solid color-mix(in srgb, var(--status-ok-dot) 35%, transparent);
		border-radius: var(--radius-sm);
		padding: 2px 5px;
		color: var(--status-ok-text);
		font-size: var(--text-body-sm);
		line-height: var(--text-body-sm--line-height);
		letter-spacing: var(--text-body-sm--letter-spacing);
		white-space: nowrap;
	}
	@media (prefers-reduced-motion: reduce) {
		.model-thinking-fill {
			transition: none;
		}
	}
	@media (max-width: 760px) {
		:global(.model-trigger) {
			min-height: 34px;
			padding: 5px var(--space-2);
			font-size: var(--text-body-sm);
			line-height: var(--text-body-sm--line-height);
			letter-spacing: var(--text-body-sm--letter-spacing);
			max-width: min(190px, 45vw);
		}
		:global(.model-menu) {
			top: auto;
			left: 12px;
			right: 12px;
			bottom: calc(env(safe-area-inset-bottom, 0px) + 16px);
			width: auto;
			max-width: calc(100vw - 24px);
			max-height: min(460px, 75dvh);
			border: 1px solid var(--border-strong);
			border-radius: var(--radius-xl);
			box-shadow: 0 16px 48px var(--shadow);
		}
	}
</style>
