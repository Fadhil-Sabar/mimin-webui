<script lang="ts">
	import { tick } from 'svelte';
	import { ChevronDown, Wrench } from '@lucide/svelte';

	export type ToolOption = {
		name: string;
		label: string;
		description: string;
		category?: string;
		enabled?: boolean;
		projectOnly?: boolean;
	};

	type Props = {
		tools: ToolOption[];
		enabledTools: string[];
		loading?: boolean;
		disabled?: boolean;
		ontoggle?: (name: string, enabled: boolean) => void | Promise<void>;
	};

	let { tools, enabledTools, loading = false, disabled = false, ontoggle }: Props = $props();

	let open = $state(false);
	let root = $state<HTMLDivElement | undefined>();
	let trigger = $state<HTMLButtonElement | undefined>();
	let placement = $state<'top' | 'bottom'>('top');
	let maxHeight = $state<string | undefined>(undefined);

	let enabledCount = $derived(enabledTools.length);

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
		if (disabled || loading) return;
		open = !open;
		if (open) {
			updatePlacement();
			tick().then(updatePlacement);
		}
	}

	function toggleTool(name: string) {
		const isCurrentlyEnabled = enabledTools.includes(name);
		void ontoggle?.(name, !isCurrentlyEnabled);
	}

	function closeOnOutsideClick(event: MouseEvent) {
		if (!open || !root) return;
		if (event.target instanceof Node && !root.contains(event.target)) {
			open = false;
		}
	}

	function handleKeydown(event: KeyboardEvent) {
		if (event.key === 'Escape' && open) {
			open = false;
			trigger?.focus();
		}
	}
</script>

<svelte:window onclick={closeOnOutsideClick} onkeydown={handleKeydown} />

<div class="tool-picker" bind:this={root}>
	<button
		type="button"
		class="tool-trigger"
		disabled={disabled || loading}
		aria-haspopup="dialog"
		aria-expanded={open}
		onclick={toggle}
		bind:this={trigger}
	>
		<Wrench size={15} aria-hidden="true" />
		<span class="tool-trigger-label">
			Tools{#if enabledCount > 0}
				<span class="tool-count-badge">{enabledCount}</span>
			{/if}
		</span>
		<ChevronDown size={13} class={open ? 'rotated' : undefined} aria-hidden="true" />
	</button>

	{#if open}
		<button
			type="button"
			class="picker-backdrop"
			onclick={() => {
				open = false;
			}}
			aria-label="Close tools menu"
			tabindex="-1"
		></button>
		<div
			class="tool-menu"
			class:placement-bottom={placement === 'bottom'}
			style:max-height={maxHeight}
			role="dialog"
			aria-label="Available tools"
		>
			<div class="tool-menu-header">
				<span class="tool-menu-title">Agent Tools</span>
				<span class="tool-menu-subtitle">{enabledCount} active</span>
			</div>
			<div class="tool-list">
				{#each tools as tool (tool.name)}
					{@const isEnabled = enabledTools.includes(tool.name)}
					<div
						class="tool-item"
						class:active={isEnabled}
						onclick={() => toggleTool(tool.name)}
						role="button"
						tabindex="0"
						onkeydown={(e) => (e.key === 'Enter' || e.key === ' ') && toggleTool(tool.name)}
					>
						<div class="tool-info">
							<div class="tool-name-row">
								<strong>{tool.label}</strong>
							</div>
							<p class="tool-desc">{tool.description}</p>
						</div>
						<div class="tool-switch" class:checked={isEnabled} aria-hidden="true">
							<div class="tool-switch-handle"></div>
						</div>
					</div>
				{/each}
				{#if tools.length === 0}
					<div class="tool-empty">No tools available</div>
				{/if}
			</div>
		</div>
	{/if}
</div>

<style>
	.tool-picker {
		position: relative;
		min-width: 0;
	}
	.tool-trigger {
		display: inline-flex;
		align-items: center;
		gap: 6px;
		min-height: 38px;
		min-width: 0;
		border: 1px solid var(--border);
		border-radius: 6px;
		background: var(--surface-subtle);
		padding: 7px 11px;
		color: var(--text-muted);
		font-size: var(--text-sm);
		cursor: pointer;
		transition: 0.18s ease;
	}
	.tool-trigger:hover:not(:disabled) {
		color: var(--text-strong);
		border-color: var(--text-faint);
	}
	.tool-trigger:disabled {
		opacity: 0.72;
		cursor: not-allowed;
	}
	.tool-trigger-label {
		display: inline-flex;
		align-items: center;
		gap: 6px;
		white-space: nowrap;
	}
	.tool-count-badge {
		display: inline-flex;
		align-items: center;
		justify-content: center;
		min-width: 17px;
		height: 17px;
		padding: 0 4px;
		border-radius: 9px;
		background: var(--accent-bg);
		color: var(--accent-fg);
		font-size: var(--text-xs);
		font-weight: 600;
		line-height: 1;
	}
	.tool-trigger :global(svg:last-child) {
		flex: 0 0 auto;
		color: var(--text-faint);
		transition: transform 0.18s ease;
	}
	.tool-trigger :global(svg:last-child.rotated) {
		transform: rotate(180deg);
	}
	.tool-menu {
		position: absolute;
		bottom: calc(100% + 8px);
		left: 0;
		z-index: 20;
		width: min(320px, calc(100vw - 36px));
		max-height: min(420px, 58vh);
		overflow-y: auto;
		padding: 6px;
		border: 1px solid var(--border-strong);
		border-radius: 9px;
		background: var(--surface);
		box-shadow: 0 14px 32px var(--shadow);
	}
	.tool-menu.placement-bottom {
		bottom: auto;
		top: calc(100% + 8px);
	}
	.tool-menu-header {
		display: flex;
		align-items: center;
		justify-content: space-between;
		padding: 6px 8px 8px;
		border-bottom: 1px solid var(--border);
		margin-bottom: 4px;
	}
	.tool-menu-title {
		font-size: var(--text-xs);
		font-weight: 600;
		letter-spacing: 0.04em;
		text-transform: uppercase;
		color: var(--text-muted);
	}
	.tool-menu-subtitle {
		font-size: var(--text-xs);
		color: var(--text-muted);
	}
	.tool-list {
		display: flex;
		flex-direction: column;
		gap: 2px;
	}
	.tool-item {
		display: flex;
		align-items: center;
		justify-content: space-between;
		gap: 12px;
		padding: 8px 10px;
		border-radius: 6px;
		cursor: pointer;
		transition: 0.15s ease;
		background: transparent;
		user-select: none;
	}
	.tool-item:hover {
		background: var(--surface-hover);
	}
	.tool-info {
		display: flex;
		flex-direction: column;
		gap: 2px;
		min-width: 0;
		flex: 1;
	}
	.tool-name-row strong {
		font-size: var(--text-sm);
		font-weight: 500;
		color: var(--text);
	}
	.tool-desc {
		margin: 0;
		font-size: var(--text-xs);
		color: var(--text-dim);
		line-height: 1.35;
	}
	.tool-switch {
		position: relative;
		width: 34px;
		height: 20px;
		border-radius: 10px;
		background: var(--surface-3, #333);
		border: 1px solid var(--border);
		transition:
			background-color 0.2s ease,
			border-color 0.2s ease;
		flex-shrink: 0;
	}
	.tool-switch.checked {
		background: var(--accent-bg);
		border-color: var(--accent-bg);
	}
	.tool-switch-handle {
		position: absolute;
		top: 2px;
		left: 2px;
		width: 14px;
		height: 14px;
		border-radius: 50%;
		background: #ffffff;
		box-shadow: 0 1px 3px rgba(0, 0, 0, 0.25);
		transition: transform 0.2s ease;
	}
	.tool-switch.checked .tool-switch-handle {
		transform: translateX(14px);
	}
	.tool-empty {
		padding: 16px 8px;
		text-align: center;
		color: var(--text-dim);
		font-size: var(--text-sm);
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
		.tool-trigger {
			min-height: 34px;
			padding: 5px 8px;
			font-size: var(--text-xs);
		}
		.tool-menu {
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
