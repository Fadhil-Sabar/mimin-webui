<script lang="ts">
	import { Copy, Ellipsis, Pencil, Trash2, WandSparkles } from '@lucide/svelte';
	import { Button } from '$lib/components/ui/button/index.js';
	import {
		DropdownMenu,
		DropdownMenuContent,
		DropdownMenuItem,
		DropdownMenuTrigger
	} from '$lib/components/ui/dropdown-menu/index.js';
	import { formatDate } from '$lib/format';
	import type { Skill } from './skills-types';

	let {
		skill,
		scopeLabel,
		onedit,
		onduplicate,
		ondelete
	}: {
		skill: Skill;
		scopeLabel: string;
		onedit: () => void;
		onduplicate: () => void;
		ondelete: () => void;
	} = $props();

	let toolCount = $derived(skill.enabledTools.length);
	let triggerCount = $derived(skill.triggerPhrases.length);
</script>

<article class="skill-card">
	<div class="card-top">
		<span class="card-icon"><WandSparkles size={22} aria-hidden="true" /></span>
		<div class="card-top-actions">
			<span class="scope-badge" class:project={Boolean(skill.projectId)}>{scopeLabel}</span>
			<DropdownMenu>
				<DropdownMenuTrigger>
					{#snippet child({ props })}
						<Button
							{...props}
							variant="ghost"
							size="icon-sm"
							class="card-menu-button"
							aria-label={`More actions for ${skill.name}`}
							title="More actions"><Ellipsis size={18} aria-hidden="true" /></Button
						>
					{/snippet}
				</DropdownMenuTrigger>
				<DropdownMenuContent align="end" class="w-44">
					<DropdownMenuItem onSelect={onduplicate}
						><Copy size={15} aria-hidden="true" /> Duplicate</DropdownMenuItem
					>
					<DropdownMenuItem variant="destructive" onSelect={ondelete}
						><Trash2 size={15} aria-hidden="true" /> Delete</DropdownMenuItem
					>
				</DropdownMenuContent>
			</DropdownMenu>
		</div>
	</div>
	<h2 class="card-title md-title-lg">{skill.name}</h2>
	<p class="card-description md-body-lg">{skill.description || 'No description yet.'}</p>
	<div class="card-meta">
		<span>{toolCount} {toolCount === 1 ? 'tool' : 'tools'}</span>
		<span aria-hidden="true">·</span>
		<span>{triggerCount} {triggerCount === 1 ? 'trigger' : 'triggers'}</span>
	</div>
	<div class="card-footer">
		<Button variant="ghost" size="sm" class="card-edit-button" onclick={onedit}
			><Pencil size={15} aria-hidden="true" /> Edit skill</Button
		>
		<span class="updated">{formatDate(skill.updatedAt)}</span>
	</div>
</article>

<style>
	.skill-card {
		display: flex;
		min-height: 16rem;
		flex-direction: column;
		padding: var(--space-5);
		color: inherit;
		text-align: left;
		text-decoration: none;
		background: var(--surface);
		border: 1px solid var(--border);
		border-radius: var(--radius-xl);
		transition:
			border-color var(--duration-short4) var(--ease-standard),
			box-shadow var(--duration-short4) var(--ease-standard);
	}
	.skill-card:hover {
		border-color: var(--text-dim);
		box-shadow: 0 8px 22px var(--shadow-soft);
	}
	.card-top {
		display: flex;
		align-items: flex-start;
		justify-content: space-between;
		gap: var(--space-2);
	}
	.card-icon {
		display: grid;
		place-items: center;
		color: var(--text-body);
	}
	.card-top-actions {
		display: flex;
		align-items: center;
		gap: var(--space-1);
	}
	.scope-badge {
		display: inline-flex;
		align-items: center;
		max-width: 14ch;
		padding: 3px var(--space-2);
		overflow: hidden;
		color: var(--text-muted);
		font-size: var(--text-body-sm);
		line-height: var(--text-body-sm--line-height);
		letter-spacing: var(--text-body-sm--letter-spacing);
		font-weight: 500;
		white-space: nowrap;
		text-overflow: ellipsis;
		background: var(--surface-2);
		border: 1px solid var(--border);
		border-radius: var(--radius-md);
	}
	.scope-badge.project {
		color: var(--status-working-text);
		border-color: color-mix(in srgb, var(--status-working-text) 25%, var(--border));
	}
	:global(.card-menu-button) {
		margin-right: calc(-1 * var(--space-1));
		color: var(--text-dim);
	}
	.card-title {
		margin: var(--space-5) 0 0;
		color: var(--text-strong);
	}
	.card-description {
		display: -webkit-box;
		min-height: 3rem;
		margin: var(--space-2) 0 0;
		overflow: hidden;
		color: var(--text-muted);
		-webkit-box-orient: vertical;
		-webkit-line-clamp: 2;
		line-clamp: 2;
	}
	.card-meta {
		display: flex;
		align-items: center;
		gap: var(--space-2);
		margin-top: var(--space-5);
		color: var(--text-dim);
		font-size: var(--text-body-md);
		line-height: var(--text-body-md--line-height);
		letter-spacing: var(--text-body-md--letter-spacing);
	}
	.card-footer {
		display: flex;
		align-items: center;
		justify-content: space-between;
		gap: var(--space-3);
		margin-top: auto;
		padding-top: var(--space-3);
		border-top: 1px solid var(--border);
	}
	.card-footer :global(.card-edit-button) {
		margin-left: calc(-1 * var(--space-2));
		color: var(--text-body);
	}
	.updated {
		color: var(--text-dim);
		font-size: var(--text-body-md);
		line-height: var(--text-body-md--line-height);
		letter-spacing: var(--text-body-md--letter-spacing);
		white-space: nowrap;
	}
</style>
