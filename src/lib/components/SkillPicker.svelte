<script lang="ts">
	import { resolve } from '$app/paths';
	import { Sparkles, ChevronDown, Search, Settings } from '@lucide/svelte';
	import type { SkillSummary } from '$lib/skills';
	import * as Popover from '$lib/components/ui/popover/index.js';
	import * as Sheet from '$lib/components/ui/sheet/index.js';
	import SwitchIndicator from '$lib/components/SwitchIndicator.svelte';

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
	let searchInput = $state<HTMLInputElement>();
	let menu = $state<HTMLElement | null>(null);
	let isMobile = $state(false);

	let currentActiveId = $derived(activeSkillId ?? activeId ?? null);
	let enabledCount = $derived(currentActiveId ? 1 : 0);

	let filtered = $derived(
		skills.filter((skill) => {
			const q = query.trim().toLowerCase();
			if (!q) return true;
			return `${skill.name} ${skill.description ?? ''}`.toLowerCase().includes(q);
		})
	);

	$effect(() => {
		const mediaQuery = window.matchMedia('(max-width: 700px)');
		isMobile = mediaQuery.matches;
		const onChange = (event: MediaQueryListEvent) => (isMobile = event.matches);
		mediaQuery.addEventListener('change', onChange);
		return () => mediaQuery.removeEventListener('change', onChange);
	});

	function focusFirst() {
		if (skills.length > 3) {
			searchInput?.focus();
			return;
		}
		const first = menu?.querySelector<HTMLElement>(
			'button, a, input, [tabindex]:not([tabindex="-1"])'
		);
		(first ?? menu)?.focus();
	}

	function handleOpenAutoFocus(event: Event) {
		event.preventDefault();
		focusFirst();
	}

	function handleOpenChange(next: boolean) {
		open = next;
		if (!next) query = '';
	}

	function handleToggle(id: string) {
		const willEnable = currentActiveId !== id;
		if (ontoggle) {
			void ontoggle(id, willEnable);
		} else if (onselect) {
			void onselect(willEnable ? id : null);
		}
	}
</script>

{#snippet pickerBody()}
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
					<button
						type="button"
						class="skill-item"
						class:active={isEnabled}
						onclick={() => handleToggle(skill.id)}
						onkeydown={(event) => event.key === ' ' && event.preventDefault()}
						aria-pressed={isEnabled}
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
						<SwitchIndicator checked={isEnabled} />
					</button>
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
		<a
			href={resolve('/skills')}
			class="manage-link"
			onclick={() => {
				open = false;
			}}
		>
			<Settings size={13} aria-hidden="true" />
			<span>Manage skills</span>
		</a>
	</div>
{/snippet}

{#if isMobile}
	<Sheet.Root bind:open onOpenChange={handleOpenChange}>
		<Sheet.Trigger class="skill-trigger" disabled={disabled || loading} aria-haspopup="dialog">
			<Sparkles size={15} aria-hidden="true" />
			<span class="skill-trigger-label">
				Skills{#if enabledCount > 0}
					<span class="skill-count-badge">{enabledCount}</span>
				{/if}
			</span>
			<ChevronDown size={13} class={open ? 'rotated' : undefined} aria-hidden="true" />
		</Sheet.Trigger>
		<Sheet.Content
			bind:ref={menu}
			side="bottom"
			showCloseButton={false}
			class="skill-menu"
			role="dialog"
			aria-modal="true"
			aria-label="Agent skills"
			tabindex={-1}
		>
			{@render pickerBody()}
		</Sheet.Content>
	</Sheet.Root>
{:else}
	<Popover.Root bind:open onOpenChange={handleOpenChange}>
		<Popover.Trigger class="skill-trigger" disabled={disabled || loading} aria-haspopup="dialog">
			<Sparkles size={15} aria-hidden="true" />
			<span class="skill-trigger-label">
				Skills{#if enabledCount > 0}
					<span class="skill-count-badge">{enabledCount}</span>
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
			class="skill-menu max-h-[min(420px,58vh)] w-[min(320px,calc(100vw-36px))] gap-0 overflow-y-auto rounded-[9px] border border-[var(--border-strong)] p-1.5 shadow-[0_14px_32px_var(--shadow)] ring-0"
			role="dialog"
			aria-modal="true"
			aria-label="Agent skills"
			tabindex={-1}
			onOpenAutoFocus={handleOpenAutoFocus}
		>
			{@render pickerBody()}
		</Popover.Content>
	</Popover.Root>
{/if}

<style>
	:global(.skill-trigger) {
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
		transition: var(--duration-short4) var(--ease-standard);
	}

	:global(.skill-trigger:hover:not(:disabled)) {
		color: var(--text-strong);
		border-color: var(--text-faint);
	}

	:global(.skill-trigger:disabled) {
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
		font-size: var(--text-body-sm);
		line-height: var(--text-body-sm--line-height);
		letter-spacing: var(--text-body-sm--letter-spacing);
		font-weight: 500;
	}

	:global(.skill-trigger svg:last-child) {
		flex: 0 0 auto;
		color: var(--text-faint);
		transition: transform var(--duration-short4) var(--ease-standard);
	}

	:global(.skill-trigger svg:last-child.rotated) {
		transform: rotate(180deg);
	}

	:global(.skill-menu) {
		padding: 6px;
		overflow-y: auto;
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
		font-size: var(--text-body-sm);
		line-height: var(--text-body-sm--line-height);
		letter-spacing: var(--text-body-sm--letter-spacing);
		font-weight: 500;
		text-transform: uppercase;
		color: var(--text-muted);
	}

	.skill-menu-subtitle {
		font-size: var(--text-body-sm);
		line-height: var(--text-body-sm--line-height);
		letter-spacing: var(--text-body-sm--letter-spacing);
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
		transition: border-color var(--duration-short3) var(--ease-standard);
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
		font-size: var(--text-body-md);
		line-height: var(--text-body-md--line-height);
		letter-spacing: var(--text-body-md--letter-spacing);
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
		font-size: var(--text-body-sm);
		line-height: var(--text-body-sm--line-height);
		letter-spacing: var(--text-body-sm--letter-spacing);
		font-weight: 500;
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
		transition: var(--duration-short3) var(--ease-standard);
		background: transparent;
		user-select: none;
		width: 100%;
		border: 0;
		font: inherit;
		color: inherit;
		text-align: left;
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
		font-size: var(--text-body-md);
		line-height: var(--text-body-md--line-height);
		letter-spacing: var(--text-body-md--letter-spacing);
		font-weight: 500;
		color: var(--text);
	}

	.skill-desc {
		margin: 0;
		font-size: var(--text-body-sm);
		line-height: var(--text-body-sm--line-height);
		letter-spacing: var(--text-body-sm--letter-spacing);
		color: var(--text-dim);
	}

	.skill-scope-badge {
		display: inline-flex;
		align-items: center;
		font-size: var(--text-label-sm);
		line-height: var(--text-label-sm--line-height);
		letter-spacing: var(--text-label-sm--letter-spacing);
		font-weight: 500;
		text-transform: uppercase;
		padding: 1px 5px;
		border-radius: 4px;
		background: var(--surface-3);
		color: var(--text-dim);
		border: 1px solid var(--border);
	}

	.skill-empty {
		padding: 16px 8px;
		text-align: center;
		color: var(--text-dim);
		font-size: var(--text-body-md);
		line-height: var(--text-body-md--line-height);
		letter-spacing: var(--text-body-md--letter-spacing);
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
		font-size: var(--text-body-sm);
		line-height: var(--text-body-sm--line-height);
		letter-spacing: var(--text-body-sm--letter-spacing);
		font-weight: 500;
		text-decoration: none;
		transition: var(--duration-short3) var(--ease-standard);
	}

	.manage-link:hover {
		color: var(--text-strong);
		background: var(--surface-hover);
	}

	@media (max-width: 700px) {
		:global(.skill-trigger) {
			min-height: 34px;
			padding: 5px 8px;
			font-size: var(--text-body-sm);
			line-height: var(--text-body-sm--line-height);
			letter-spacing: var(--text-body-sm--letter-spacing);
		}

		:global(.skill-menu) {
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
