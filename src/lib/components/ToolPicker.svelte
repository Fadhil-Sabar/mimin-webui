<script lang="ts">
	import { resolve } from '$app/paths';
	import { ChevronDown, Wrench } from '@lucide/svelte';
	import * as Popover from '$lib/components/ui/popover/index.js';
	import * as Sheet from '$lib/components/ui/sheet/index.js';
	import SwitchIndicator from '$lib/components/SwitchIndicator.svelte';
	import { settingsModal } from '$lib/client/settings-modal.svelte';

	export type ToolOption = {
		name: string;
		label: string;
		description: string;
		category?: string;
		enabled?: boolean;
		projectOnly?: boolean;
		readOnly?: boolean;
		settingHint?: string;
		settingHref?: string;
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
	let isMobile = $state(false);
	let menu = $state<HTMLElement | null>(null);

	let enabledCount = $derived(
		tools.filter((tool) =>
			tool.readOnly ? Boolean(tool.enabled) : enabledTools.includes(tool.name)
		).length
	);

	$effect(() => {
		const query = window.matchMedia('(max-width: 700px)');
		isMobile = query.matches;
		const onChange = (event: MediaQueryListEvent) => (isMobile = event.matches);
		query.addEventListener('change', onChange);
		return () => query.removeEventListener('change', onChange);
	});

	function focusFirst() {
		const first = menu?.querySelector<HTMLElement>(
			'button, a, input, [tabindex]:not([tabindex="-1"])'
		);
		(first ?? menu)?.focus();
	}

	function handleOpenAutoFocus(event: Event) {
		event.preventDefault();
		focusFirst();
	}

	function toggleTool(name: string) {
		const target = tools.find((tool) => tool.name === name);
		if (target?.readOnly) return;
		const isCurrentlyEnabled = enabledTools.includes(name);
		void ontoggle?.(name, !isCurrentlyEnabled);
	}
</script>

{#snippet pickerBody()}
	<div class="tool-menu-header">
		<span class="tool-menu-title">Agent Tools</span>
		<span class="tool-menu-subtitle">{enabledCount} active</span>
	</div>
	<div class="tool-list">
		{#each tools as tool (tool.name)}
			{@const isReadOnly = Boolean(tool.readOnly)}
			{@const isEnabled = isReadOnly ? Boolean(tool.enabled) : enabledTools.includes(tool.name)}
			{#if isReadOnly}
				<div class="tool-item readonly" class:active={isEnabled}>
					<div class="tool-info">
						<div class="tool-name-row">
							<strong>{tool.label}</strong>
							<span class="tool-status-badge" class:enabled={isEnabled}>
								{isEnabled ? 'Enabled' : 'Disabled'}
							</span>
						</div>
						<p class="tool-desc">{tool.description}</p>
						<p class="tool-settings-info">
							Can only be configured in <a
								href="#settings-browser-extension"
								onclick={(e) => {
									e.preventDefault();
									e.stopPropagation();
									open = false;
									settingsModal.show(
										tool.settingHref === '/settings/web-search' ? 'web-search' : 'browser-extension'
									);
								}}
							>
								Settings &rsaquo; Browser Extension
							</a>
						</p>
					</div>
					<SwitchIndicator
						checked={isEnabled}
						readonly
						title="Can only be configured in Settings"
					/>
				</div>
			{:else}
				<button
					type="button"
					class="tool-item"
					class:active={isEnabled}
					onclick={() => toggleTool(tool.name)}
					onkeydown={(event) => event.key === ' ' && event.preventDefault()}
					aria-pressed={isEnabled}
				>
					<div class="tool-info">
						<div class="tool-name-row">
							<strong>{tool.label}</strong>
						</div>
						<p class="tool-desc">{tool.description}</p>
					</div>
					<SwitchIndicator checked={isEnabled} />
				</button>
			{/if}
		{/each}
		{#if tools.length === 0}
			<div class="tool-empty">No tools available</div>
		{/if}
	</div>
{/snippet}

{#if isMobile}
	<Sheet.Root bind:open>
		<Sheet.Trigger class="tool-trigger" disabled={disabled || loading} aria-haspopup="dialog">
			<Wrench size={15} aria-hidden="true" />
			<span class="tool-trigger-label">
				Tools{#if enabledCount > 0}
					<span class="tool-count-badge">{enabledCount}</span>
				{/if}
			</span>
			<ChevronDown size={13} class={open ? 'rotated' : undefined} aria-hidden="true" />
		</Sheet.Trigger>
		<Sheet.Content
			bind:ref={menu}
			side="bottom"
			showCloseButton={false}
			class="tool-menu"
			role="dialog"
			aria-modal="true"
			aria-label="Available tools"
			tabindex={-1}
		>
			{@render pickerBody()}
		</Sheet.Content>
	</Sheet.Root>
{:else}
	<Popover.Root bind:open>
		<Popover.Trigger class="tool-trigger" disabled={disabled || loading} aria-haspopup="dialog">
			<Wrench size={15} aria-hidden="true" />
			<span class="tool-trigger-label">
				Tools{#if enabledCount > 0}
					<span class="tool-count-badge">{enabledCount}</span>
				{/if}
			</span>
			<ChevronDown size={13} class={open ? 'rotated' : undefined} aria-hidden="true" />
		</Popover.Trigger>
		<Popover.Content
			bind:ref={menu}
			side="top"
			sideOffset={8}
			avoidCollisions
			trapFocus
			class="tool-menu max-h-[min(420px,58vh)] w-[min(320px,calc(100vw-36px))] gap-0 overflow-y-auto rounded-[9px] border border-[var(--border-strong)] p-1.5 shadow-[0_14px_32px_var(--shadow)] ring-0"
			role="dialog"
			aria-modal="true"
			aria-label="Available tools"
			tabindex={-1}
			onOpenAutoFocus={handleOpenAutoFocus}
		>
			{@render pickerBody()}
		</Popover.Content>
	</Popover.Root>
{/if}

<style>
	:global(.tool-trigger) {
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
		font-size: var(--text-body-md);
		line-height: var(--text-body-md--line-height);
		letter-spacing: var(--text-body-md--letter-spacing);
		cursor: pointer;
		transition: 0.18s ease;
	}
	:global(.tool-trigger:hover:not(:disabled)) {
		color: var(--text-strong);
		border-color: var(--text-faint);
	}
	:global(.tool-trigger:disabled) {
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
		font-size: var(--text-body-sm);
		line-height: var(--text-body-sm--line-height);
		letter-spacing: var(--text-body-sm--letter-spacing);
		font-weight: 500;
	}
	:global(.tool-trigger svg:last-child) {
		flex: 0 0 auto;
		color: var(--text-faint);
		transition: transform 0.18s ease;
	}
	:global(.tool-trigger svg:last-child.rotated) {
		transform: rotate(180deg);
	}
	:global(.tool-menu) {
		padding: 6px;
		overflow-y: auto;
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
		font-size: var(--text-body-sm);
		line-height: var(--text-body-sm--line-height);
		letter-spacing: var(--text-body-sm--letter-spacing);
		font-weight: 500;
		text-transform: uppercase;
		color: var(--text-muted);
	}
	.tool-menu-subtitle {
		font-size: var(--text-body-sm);
		line-height: var(--text-body-sm--line-height);
		letter-spacing: var(--text-body-sm--letter-spacing);
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
		width: 100%;
		border: 0;
		font: inherit;
		color: inherit;
		text-align: left;
	}
	.tool-item:hover {
		background: var(--surface-hover);
	}
	.tool-item.readonly {
		cursor: default;
	}
	.tool-item.readonly:hover {
		background: transparent;
	}
	.tool-info {
		display: flex;
		flex-direction: column;
		gap: 2px;
		min-width: 0;
		flex: 1;
	}
	.tool-name-row {
		display: flex;
		align-items: center;
		gap: 6px;
		flex-wrap: wrap;
	}
	.tool-name-row strong {
		font-size: var(--text-body-md);
		line-height: var(--text-body-md--line-height);
		letter-spacing: var(--text-body-md--letter-spacing);
		font-weight: 500;
		color: var(--text);
	}
	.tool-status-badge {
		display: inline-flex;
		align-items: center;
		font-size: var(--text-label-sm);
		line-height: var(--text-label-sm--line-height);
		letter-spacing: var(--text-label-sm--letter-spacing);
		font-weight: 500;
		text-transform: uppercase;
		padding: 1px 6px;
		border-radius: 4px;
		background: var(--surface-3);
		color: var(--text-dim);
		border: 1px solid var(--border);
	}
	.tool-status-badge.enabled {
		background: rgba(34, 197, 94, 0.12);
		color: var(--status-ok-text, #22c55e);
		border-color: rgba(34, 197, 94, 0.25);
	}
	.tool-desc {
		margin: 0;
		font-size: var(--text-body-sm);
		line-height: var(--text-body-sm--line-height);
		letter-spacing: var(--text-body-sm--letter-spacing);
		color: var(--text-dim);
	}
	.tool-settings-info {
		margin: 3px 0 0;
		font-size: var(--text-body-sm);
		line-height: var(--text-body-sm--line-height);
		letter-spacing: var(--text-body-sm--letter-spacing);
		color: var(--text-muted);
	}
	.tool-settings-info a {
		color: var(--text-strong);
		text-decoration: underline;
		text-underline-offset: 2px;
		transition: color 0.15s ease;
	}
	.tool-settings-info a:hover {
		color: var(--focus, #3b82f6);
	}
	.tool-empty {
		padding: 16px 8px;
		text-align: center;
		color: var(--text-dim);
		font-size: var(--text-body-md);
		line-height: var(--text-body-md--line-height);
		letter-spacing: var(--text-body-md--letter-spacing);
	}
	@media (max-width: 700px) {
		:global(.tool-trigger) {
			min-height: 34px;
			padding: 5px 8px;
			font-size: var(--text-body-sm);
			line-height: var(--text-body-sm--line-height);
			letter-spacing: var(--text-body-sm--letter-spacing);
		}
		:global(.tool-menu) {
			top: auto;
			left: 12px;
			right: 12px;
			bottom: calc(env(safe-area-inset-bottom, 0px) + 16px);
			width: auto;
			max-width: calc(100vw - 24px);
			max-height: min(460px, 75dvh);
			border: 1px solid var(--border-strong);
			border-radius: 12px;
			box-shadow: 0 16px 48px var(--shadow);
		}
	}
</style>
