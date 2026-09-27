<script lang="ts">
	import {
		ChevronLeft,
		Folder,
		MessageSquare,
		MoreHorizontal,
		Pencil,
		Trash2
	} from '@lucide/svelte';
	import { resolve } from '$app/paths';
	import { Button } from '$lib/components/ui/button/index.js';
	import { formatDate } from '$lib/format';
	import type { ExtractionSummary, Project } from './project-types';

	let {
		project,
		fileTotal,
		conversationTotal,
		extractionSummary,
		onstartchat,
		onedit,
		ondelete
	}: {
		project: Project;
		fileTotal: number;
		conversationTotal: number;
		extractionSummary: ExtractionSummary;
		onstartchat: () => void;
		onedit: () => void;
		ondelete: () => void;
	} = $props();
</script>

<section class="hero" aria-labelledby="project-title">
	<a class="back-link" href={resolve('/projects')}>
		<ChevronLeft size={15} aria-hidden="true" />
		<span>Projects</span>
	</a>
	<div class="hero-row">
		<div class="project-symbol" aria-hidden="true"><Folder size={22} /></div>
		<div class="hero-copy">
			<h1 id="project-title">{project.name}</h1>
			<p>{project.description || 'No description yet.'}</p>
			<div class="project-meta" aria-label="Project status">
				<span class={`context ${extractionSummary.tone}`}>
					<span class="status-dot"></span>
					{extractionSummary.label}
				</span>
				<span class="updated">Updated {formatDate(project.updatedAt)}</span>
				<span class="sr-only">{fileTotal} knowledge files, {conversationTotal} conversations</span>
			</div>
		</div>
		<div class="hero-actions">
			<Button variant="default" onclick={onstartchat}><MessageSquare size={15} /> Start chat</Button
			>
			<details class="action-menu">
				<summary class="more-button" aria-label="More project actions" title="More project actions">
					<MoreHorizontal size={18} aria-hidden="true" />
				</summary>
				<div class="menu-panel" role="menu">
					<button type="button" role="menuitem" onclick={onedit}>
						<Pencil size={15} aria-hidden="true" /> Edit project
					</button>
					<button class="destructive" type="button" role="menuitem" onclick={ondelete}>
						<Trash2 size={15} aria-hidden="true" /> Delete project
					</button>
				</div>
			</details>
		</div>
	</div>
</section>

<style>
	.hero {
		padding-bottom: 4px;
	}
	.back-link {
		display: inline-flex;
		align-items: center;
		gap: 4px;
		margin-bottom: 18px;
		color: var(--text-dim);
		font-size: var(--text-body-sm);
		line-height: var(--text-body-sm--line-height);
		text-decoration: none;
		transition: color var(--duration-short3) var(--ease-standard);
	}
	.back-link:hover {
		color: var(--text-strong);
	}
	.hero-row {
		display: flex;
		align-items: flex-start;
		gap: 14px;
	}
	.project-symbol {
		display: grid;
		place-items: center;
		width: 44px;
		height: 44px;
		flex: 0 0 44px;
		color: var(--text-body);
		background: var(--surface);
		border: 1px solid var(--border);
		border-radius: 13px;
	}
	.hero-copy {
		min-width: 0;
		flex: 1;
	}
	.hero h1 {
		margin: -2px 0 0;
		font-family: var(--font-body);
		font-size: clamp(1.7rem, 2.8vw, 2.25rem);
		line-height: 1.12;
		letter-spacing: -0.02em;
		color: var(--text-strong);
		font-weight: 500;
	}
	.hero p {
		max-width: 660px;
		margin: 8px 0 0;
		color: var(--text-muted);
		font-size: var(--text-body-md);
		line-height: 1.55;
	}
	.project-meta {
		display: flex;
		align-items: center;
		gap: 14px;
		margin-top: 14px;
		color: var(--text-dim);
		font-size: var(--text-body-sm);
		line-height: var(--text-body-sm--line-height);
	}
	.context {
		display: inline-flex;
		align-items: center;
		gap: 7px;
		color: var(--status-ok-text);
	}
	.status-dot {
		width: 7px;
		height: 7px;
		flex: 0 0 7px;
		border-radius: 50%;
		background: var(--status-ok-dot);
	}
	.context.danger {
		color: var(--danger-text);
	}
	.context.danger .status-dot {
		background: var(--danger-text);
	}
	.context.working {
		color: var(--status-working-text);
	}
	.context.working .status-dot {
		background: var(--status-working-dot);
	}
	.context.muted {
		color: var(--text-dim);
	}
	.context.muted .status-dot {
		background: var(--text-faint);
	}
	.hero-actions {
		display: flex;
		align-items: center;
		gap: var(--space-2);
		flex: 0 0 auto;
	}
	.more-button {
		display: grid;
		place-items: center;
		width: 38px;
		height: 38px;
		border: 1px solid var(--border);
		border-radius: 10px;
		color: var(--text-muted);
		background: var(--surface);
		cursor: pointer;
		list-style: none;
		transition:
			color var(--duration-short3) var(--ease-standard),
			background var(--duration-short3) var(--ease-standard),
			border-color var(--duration-short3) var(--ease-standard);
	}
	.more-button::-webkit-details-marker {
		display: none;
	}
	.more-button:hover,
	.action-menu[open] .more-button {
		border-color: var(--border-strong);
		color: var(--text-strong);
		background: var(--surface-hover);
	}
	.menu-panel {
		position: absolute;
		z-index: 4;
		right: 0;
		margin-top: 7px;
		min-width: 170px;
		padding: 5px;
		background: var(--surface);
		border: 1px solid var(--border-strong);
		border-radius: 11px;
		box-shadow: 0 14px 30px var(--shadow);
	}
	.action-menu {
		position: relative;
	}
	.menu-panel button {
		display: flex;
		align-items: center;
		gap: 9px;
		width: 100%;
		padding: 8px 9px;
		border: 0;
		border-radius: 7px;
		color: var(--text-body);
		background: transparent;
		font-size: var(--text-body-sm);
		text-align: left;
	}
	.menu-panel button:hover {
		background: var(--surface-hover);
		color: var(--text-strong);
	}
	.menu-panel button.destructive {
		color: var(--danger-text);
	}
	.sr-only {
		position: absolute;
		width: 1px;
		height: 1px;
		padding: 0;
		margin: -1px;
		overflow: hidden;
		clip: rect(0, 0, 0, 0);
		white-space: nowrap;
		border: 0;
	}
	@media (max-width: 760px) {
		.hero-row {
			flex-wrap: wrap;
		}
		.hero-copy {
			flex-basis: calc(100% - 58px);
		}
		.hero-actions {
			width: 100%;
			padding-left: 58px;
		}
		.hero-actions :global(button:first-child) {
			flex: 1;
		}
	}
</style>
