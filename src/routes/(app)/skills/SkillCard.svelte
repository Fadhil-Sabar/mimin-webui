<script lang="ts">
	import { FileText, FolderKanban, Plus, Sparkles, Trash2, WandSparkles } from '@lucide/svelte';
	import { Button } from '$lib/components/ui/button/index.js';
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
</script>

<article class="skill-card">
	<div class="card-top">
		<span class="card-icon"><WandSparkles size={18} /></span>
		<span class="scope-badge" class:project={Boolean(skill.projectId)}
			>{#if skill.projectId}<FolderKanban size={12} />{:else}<Sparkles
					size={12}
				/>{/if}{scopeLabel}</span
		>
	</div>
	<h2>{skill.name}</h2>
	<p class="skill-description">{skill.description || 'No description yet.'}</p>
	<div class="card-footer">
		<div class="card-meta">
			<span
				>{skill.enabledTools.length}
				{skill.enabledTools.length === 1 ? 'tool' : 'tools'}</span
			>
			<span>·</span>
			<span
				>{skill.triggerPhrases.length} trigger {skill.triggerPhrases.length === 1
					? 'phrase'
					: 'phrases'}</span
			>
		</div>
		{#if skill.triggerPhrases.length > 0}<div class="trigger-preview">
				“{skill.triggerPhrases[0]}”{#if skill.triggerPhrases.length > 1}<span
						>+{skill.triggerPhrases.length - 1}</span
					>{/if}
			</div>{/if}
		<span class="updated">Updated {formatDate(skill.updatedAt, 'long')}</span>
	</div>
	<div class="card-actions">
		<Button variant="outline" size="sm" class="card-edit-button" onclick={onedit}
			><FileText size={14} /> Edit</Button
		><button
			class="icon-action"
			onclick={onduplicate}
			aria-label={`Duplicate ${skill.name}`}
			title="Duplicate"><Plus size={16} /></button
		><button
			class="icon-action danger"
			onclick={ondelete}
			aria-label={`Delete ${skill.name}`}
			title="Delete"><Trash2 size={15} /></button
		>
	</div>
</article>

<style>
	.skill-card {
		min-height: 220px;
		padding: 18px;
		text-align: left;
		border: 1px solid var(--border);
		border-radius: 10px;
		background: var(--surface);
		transition: var(--duration-short4) var(--ease-standard);
		text-decoration: none;
		color: inherit;
		display: flex;
		flex-direction: column;
	}
	.skill-card:hover {
		border-color: var(--text-dim);
		box-shadow: 0 8px 22px var(--shadow-soft);
		transform: translateY(-2px);
	}
	.card-top {
		display: flex;
		align-items: center;
		justify-content: space-between;
		gap: 8px;
	}
	.card-icon {
		display: grid;
		place-items: center;
		width: 36px;
		height: 36px;
		border-radius: 8px;
		background: var(--surface-2);
		border: 1px solid var(--border);
		color: var(--text-strong);
	}
	.scope-badge {
		display: inline-flex;
		align-items: center;
		gap: 5px;
		padding: 3px 8px;
		border-radius: 4px;
		background: var(--surface-2);
		border: 1px solid var(--border);
		color: var(--text-muted);
		font-size: var(--text-body-sm);
		line-height: var(--text-body-sm--line-height);
		letter-spacing: var(--text-body-sm--letter-spacing);
		font-weight: 500;
		white-space: nowrap;
	}
	.scope-badge.project {
		color: var(--status-working-text);
		border-color: color-mix(in srgb, var(--status-working-text) 25%, var(--border));
	}
	.skill-card h2 {
		margin: 14px 0 6px;
		font-family: var(--font-body);
		font-size: var(--text-body-lg);
		line-height: var(--text-body-lg--line-height);
		letter-spacing: var(--text-body-lg--letter-spacing);
		font-weight: 500;
		color: var(--text-strong);
	}
	.skill-description {
		margin: 0 0 14px;
		font-size: var(--text-body-md);
		line-height: var(--text-body-md--line-height);
		letter-spacing: var(--text-body-md--letter-spacing);
		color: var(--text-muted);
		display: -webkit-box;
		-webkit-line-clamp: 2;
		line-clamp: 2;
		-webkit-box-orient: vertical;
		overflow: hidden;
	}
	.card-footer {
		display: flex;
		flex-direction: column;
		gap: 4px;
		font-size: var(--text-body-sm);
		line-height: var(--text-body-sm--line-height);
		letter-spacing: var(--text-body-sm--letter-spacing);
		color: var(--text-dim);
	}
	.card-meta {
		display: flex;
		align-items: center;
		gap: 6px;
		color: var(--text-dim);
		font-size: var(--text-body-sm);
		line-height: var(--text-body-sm--line-height);
		letter-spacing: var(--text-body-sm--letter-spacing);
	}
	.trigger-preview {
		display: flex;
		align-items: center;
		gap: 7px;
		min-width: 0;
		overflow: hidden;
		color: var(--text-body);
		font-size: var(--text-body-sm);
		line-height: var(--text-body-sm--line-height);
		letter-spacing: var(--text-body-sm--letter-spacing);
		font-style: italic;
		white-space: nowrap;
		text-overflow: ellipsis;
	}
	.trigger-preview span {
		flex: 0 0 auto;
		color: var(--text-faint);
		font-style: normal;
	}
	.updated {
		color: var(--text-dim);
		font-size: var(--text-body-sm);
		line-height: var(--text-body-sm--line-height);
		letter-spacing: var(--text-body-sm--letter-spacing);
	}
	.card-actions {
		display: flex;
		align-items: center;
		gap: 6px;
		margin-top: auto;
		padding-top: 14px;
		border-top: 1px solid var(--border);
	}
	.card-actions :global(.card-edit-button) {
		font-size: var(--text-body-sm);
		line-height: var(--text-body-sm--line-height);
		letter-spacing: var(--text-body-sm--letter-spacing);
	}
	.icon-action {
		display: grid;
		place-items: center;
		width: 32px;
		height: 32px;
		padding: 0;
		color: var(--text-muted);
		background: transparent;
		border: 1px solid var(--border);
		border-radius: 5px;
		transition: var(--duration-short3) var(--ease-standard);
	}
	.icon-action + .icon-action {
		margin-left: 0;
	}
	.icon-action:hover {
		color: var(--text-strong);
		background: var(--surface-hover);
	}
	.icon-action.danger:hover {
		color: var(--danger-text);
		background: color-mix(in srgb, var(--danger-text) 10%, transparent);
	}
</style>
