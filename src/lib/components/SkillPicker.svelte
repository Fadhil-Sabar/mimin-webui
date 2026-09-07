<script lang="ts">
	import { tick } from 'svelte';
	import { resolve } from '$app/paths';
	import { Sparkles, ChevronDown, Search, Settings } from '@lucide/svelte';
	import type { SkillSummary } from '$lib/skills';

	type Props = {
		skills: SkillSummary[];
		activeId?: string | null;
		activeSkillId?: string | null;
		disabled?: boolean;
		loading?: boolean;
		ontoggle?: (id: string, enabled: boolean) => void | Promise<void>;
		onselect?: (id: string | null) => void | Promise<void>;
	};

	let {
		skills,
		activeId = null,
		activeSkillId = null,
		disabled = false,
		loading = false,
		ontoggle,
		onselect
	}: Props = $props();

	let open = $state(false);
	let query = $state('');
	let root = $state<HTMLDivElement>();
	let trigger = $state<HTMLButtonElement>();
	let searchInput = $state<HTMLInputElement>();

	let placement = $state<'top' | 'bottom'>('top');
	let maxHeight = $state<string | undefined>(undefined);

	let currentActiveId = $derived(activeSkillId ?? activeId ?? null);
	let enabledCount = $derived(currentActiveId ? 1 : 0);

	let filtered = $derived(
		skills.filter((skill) => {
			const q = query.trim().toLowerCase();
			if (!q) return true;
			return `${skill.name} ${skill.description ?? ''}`.toLowerCase().includes(q);
		})
	);

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

	async function toggle() {
		if (disabled || loading) return;
		open = !open;
		if (open) {
			updatePlacement();
			query = '';
			await tick();
			updatePlacement();
			if (skills.length > 3) {
				searchInput?.focus();
			}
		}
	}

	function close() {
		open = false;
		query = '';
		trigger?.focus();
	}

	function handleToggle(id: string) {
		const willEnable = currentActiveId !== id;
		if (ontoggle) {
			void ontoggle(id, willEnable);
		} else if (onselect) {
			void onselect(willEnable ? id : null);
		}
	}

	function handleKeydown(event: KeyboardEvent) {
		if (event.key === 'Escape' && open) {
			close();
		}
	}
</script>

<svelte:window
	onclick={(event) => {
		if (open && event.target instanceof Node && !root?.contains(event.target)) close();
	}}
	onkeydown={handleKeydown}
/>

<div class="skill-picker" bind:this={root}>
	<button
		type="button"
		class="skill-trigger"
		bind:this={trigger}
		disabled={disabled || loading}
		aria-haspopup="dialog"
		aria-expanded={open}
		onclick={toggle}
	>
		<Sparkles size={15} aria-hidden="true" />
		<span class="skill-trigger-label">
			Skills{#if enabledCount > 0}
				<span class="skill-count-badge">{enabledCount}</span>
			{/if}
		</span>
		<ChevronDown size={13} class={open ? 'rotated' : undefined} aria-hidden="true" />
	</button>

	{#if open}
		<button
			type="button"
			class="picker-backdrop"
			onclick={close}
			aria-label="Close skills menu"
			tabindex="-1"
		></button>

		<div
			class="skill-menu"
			class:placement-bottom={placement === 'bottom'}
			style:max-height={maxHeight}
			role="dialog"
			aria-modal="true"
			aria-label="Agent skills"
			tabindex="-1"
		>
			<div class="skill-menu-header">
				<span class="skill-menu-title">Skills</span>
				<span class="skill-menu-subtitle">{enabledCount} active</span>
			</div>

			{#if skills.length > 3}
				<div class="skill-search">
					<Search size={14} aria-hidden="true" />
					<input
						bind:this={searchInput}
						bind:value={query}
						type="text"
						placeholder="Search skills..."
						aria-label="Search skills"
						autocomplete="off"
					/>
				</div>
			{/if}

			<div class="skill-list">
				{#each [true, false] as project (project)}
					{@const group = filtered.filter((s) => Boolean(s.projectId) === project)}
					{#if group.length}
						<div class="skill-group-label">{project ? 'Project skills' : 'Personal skills'}</div>
						{#each group as skill (skill.id)}
							{@const isEnabled = skill.id === currentActiveId}
							<div
								class="skill-item"
								class:active={isEnabled}
								onclick={() => handleToggle(skill.id)}
								role="button"
								tabindex="0"
								onkeydown={(e) => (e.key === 'Enter' || e.key === ' ') && handleToggle(skill.id)}
							>
								<div class="skill-info">
									<div class="skill-name-row">
										<strong>{skill.name}</strong>
										{#if skill.projectId}
											<span class="skill-scope-badge">Project</span>
										{/if}
									</div>
									{#if skill.description}
										<p class="skill-desc">{skill.description}</p>
									{/if}
								</div>
								<div class="skill-switch" class:checked={isEnabled} aria-hidden="true">
									<div class="skill-switch-handle"></div>
								</div>
							</div>
						{/each}
					{/if}
				{/each}

				{#if skills.length === 0}
					<div class="skill-empty">No skills available</div>
				{:else if filtered.length === 0}
					<div class="skill-empty">No skills match "{query}"</div>
				{/if}
			</div>

			<div class="skill-menu-footer">
				<a href={resolve('/skills')} class="manage-link" onclick={close}>
					<Settings size={13} aria-hidden="true" />
					<span>Manage skills</span>
				</a>
			</div>
		</div>
	{/if}
</div>

<style>
	.skill-picker {
		position: relative;
		min-width: 0;
	}

	.skill-trigger {
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

	.skill-trigger:hover:not(:disabled) {
		color: var(--text-strong);
		border-color: var(--text-faint);
	}

	.skill-trigger:disabled {
		opacity: 0.72;
		cursor: not-allowed;
	}

	.skill-trigger-label {
		display: inline-flex;
		align-items: center;
		gap: 6px;
		white-space: nowrap;
	}

	.skill-count-badge {
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

	.skill-trigger :global(svg:last-child) {
		flex: 0 0 auto;
		color: var(--text-faint);
		transition: transform 0.18s ease;
	}

	.skill-trigger :global(svg:last-child.rotated) {
		transform: rotate(180deg);
	}

	.skill-menu {
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

	.skill-menu.placement-bottom {
		bottom: auto;
		top: calc(100% + 8px);
	}

	.skill-menu-header {
		display: flex;
		align-items: center;
		justify-content: space-between;
		padding: 6px 8px 8px;
		border-bottom: 1px solid var(--border);
		margin-bottom: 4px;
	}

	.skill-menu-title {
		font-size: var(--text-xs);
		font-weight: 600;
		letter-spacing: 0.04em;
		text-transform: uppercase;
		color: var(--text-muted);
	}

	.skill-menu-subtitle {
		font-size: var(--text-xs);
		color: var(--text-muted);
	}

	.skill-search {
		display: flex;
		align-items: center;
		gap: 7px;
		padding: 6px 8px;
		margin-top: 2px;
		margin-bottom: 4px;
		border: 1px solid var(--border);
		border-radius: 6px;
		background: var(--surface-subtle);
		color: var(--text-dim);
		flex-shrink: 0;
		transition: border-color 0.15s ease;
	}

	.skill-search:focus-within {
		border-color: var(--focus, #3b82f6);
	}

	.skill-search input {
		flex: 1;
		min-width: 0;
		border: 0;
		outline: 0;
		background: transparent;
		font: inherit;
		font-size: var(--text-sm);
		color: var(--text-body);
	}

	.skill-search input::placeholder {
		color: var(--text-dim);
	}

	.skill-list {
		display: flex;
		flex-direction: column;
		gap: 2px;
	}

	.skill-group-label {
		padding: 6px 8px 3px;
		margin-top: 4px;
		color: var(--text-muted);
		font-size: var(--text-xs);
		font-weight: 600;
		letter-spacing: 0.04em;
		text-transform: uppercase;
	}

	.skill-group-label:first-child {
		margin-top: 0;
	}

	.skill-item {
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

	.skill-item:hover {
		background: var(--surface-hover);
	}

	.skill-info {
		display: flex;
		flex-direction: column;
		gap: 2px;
		min-width: 0;
		flex: 1;
	}

	.skill-name-row {
		display: flex;
		align-items: center;
		gap: 6px;
		flex-wrap: wrap;
	}

	.skill-name-row strong {
		font-size: var(--text-sm);
		font-weight: 500;
		color: var(--text);
	}

	.skill-desc {
		margin: 0;
		font-size: var(--text-xs);
		color: var(--text-dim);
		line-height: 1.35;
	}

	.skill-scope-badge {
		display: inline-flex;
		align-items: center;
		font-size: 10px;
		font-weight: 600;
		text-transform: uppercase;
		letter-spacing: 0.03em;
		padding: 1px 5px;
		border-radius: 4px;
		background: var(--surface-3);
		color: var(--text-dim);
		border: 1px solid var(--border);
		line-height: 1.2;
	}

	.skill-switch {
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

	.skill-switch.checked {
		background: var(--accent-bg);
		border-color: var(--accent-bg);
	}

	.skill-switch-handle {
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

	.skill-switch.checked .skill-switch-handle {
		transform: translateX(14px);
	}

	.skill-empty {
		padding: 16px 8px;
		text-align: center;
		color: var(--text-dim);
		font-size: var(--text-sm);
	}

	.skill-menu-footer {
		padding-top: 6px;
		margin-top: 6px;
		border-top: 1px solid var(--border);
		flex-shrink: 0;
	}

	.manage-link {
		display: flex;
		align-items: center;
		gap: 6px;
		padding: 6px 8px;
		border-radius: 6px;
		color: var(--text-muted);
		font-size: var(--text-xs);
		font-weight: 500;
		text-decoration: none;
		transition: 0.15s ease;
	}

	.manage-link:hover {
		color: var(--text-strong);
		background: var(--surface-hover);
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

		.skill-trigger {
			min-height: 34px;
			padding: 5px 8px;
			font-size: var(--text-xs);
		}

		.skill-menu {
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
