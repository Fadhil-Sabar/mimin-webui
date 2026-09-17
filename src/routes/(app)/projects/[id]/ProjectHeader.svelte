<script lang="ts">
	import { Bot, MessageSquare, Pencil, Trash2 } from '@lucide/svelte';
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

<section class="hero">
	<div>
		<div class="title-row">
			<div class="project-symbol"><Bot size={22} /></div>
			<div>
				<h1>{project.name}</h1>
				<p>{project.description || 'No description yet.'}</p>
			</div>
		</div>
	</div>
	<div class="hero-actions">
		<Button variant="default" onclick={onstartchat}><MessageSquare size={15} /> Start chat</Button>
		<Button variant="outline" onclick={onedit}><Pencil size={15} /> Edit</Button>
		<Button variant="destructive" onclick={ondelete} aria-label="Delete project"
			><Trash2 size={15} /></Button
		>
	</div>
</section>
<div class="stats">
	<div class="stat-item">
		<strong>{fileTotal}</strong><span>Knowledge files</span>
	</div>
	<div class="stat-item">
		<strong>{conversationTotal}</strong><span>Conversations</span>
	</div>
	<div class="stat-item">
		<strong>{formatDate(project.updatedAt)}</strong><span>Last updated</span>
	</div>
	<div class="context {extractionSummary.tone}">
		<span class="status-dot"></span><span>{extractionSummary.label}</span>
	</div>
</div>

<style>
	.hero {
		display: flex;
		align-items: flex-start;
		justify-content: space-between;
		gap: var(--space-5);
		padding-bottom: var(--space-5);
		border-bottom: 1px solid var(--border);
	}
	.title-row {
		display: flex;
		align-items: flex-start;
		gap: 14px;
	}
	.project-symbol {
		display: grid;
		place-items: center;
		width: 42px;
		height: 42px;
		flex: 0 0 42px;
		color: var(--text-muted);
		background: var(--surface-2);
		border: 1px solid var(--border);
		border-radius: var(--radius-xl);
	}
	.hero h1 {
		margin: 0;
		font-family: var(--font-body);
		font-size: var(--text-headline-md);
		line-height: var(--text-headline-md--line-height);
		letter-spacing: var(--text-headline-md--letter-spacing);
		color: var(--text-strong);
	}
	.hero p {
		max-width: 580px;
		margin: 6px 0 0;
		color: var(--text-muted);
		font-size: var(--text-body-md);
		line-height: var(--text-body-md--line-height);
		letter-spacing: var(--text-body-md--letter-spacing);
	}
	.hero-actions {
		display: flex;
		gap: var(--space-2);
		flex: 0 0 auto;
	}
	.stats {
		display: flex;
		align-items: center;
		gap: var(--space-6);
		padding: var(--space-4) 0;
		border-bottom: 1px solid var(--border);
	}
	.stat-item {
		display: flex;
		flex-direction: column;
		gap: 2px;
	}
	.stats strong {
		display: block;
		font-size: var(--text-title-lg);
		line-height: var(--text-title-lg--line-height);
		letter-spacing: var(--text-title-lg--letter-spacing);
		font-weight: 500;
		color: var(--text-strong);
		font-variant-numeric: tabular-nums;
	}
	.stats span {
		display: block;
		color: var(--text-muted);
		font-size: var(--text-body-sm);
		line-height: var(--text-body-sm--line-height);
		letter-spacing: var(--text-body-sm--letter-spacing);
		font-weight: 400;
	}
	.stats .context {
		display: flex;
		align-items: center;
		gap: 7px;
		margin-left: auto;
		font-size: var(--text-body-sm);
		line-height: var(--text-body-sm--line-height);
		letter-spacing: var(--text-body-sm--letter-spacing);
		font-weight: 500;
	}
	.status-dot {
		width: 7px;
		height: 7px;
		flex: 0 0 7px;
		background: var(--status-ok-dot);
		border-radius: 50%;
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
	@media (max-width: 760px) {
		.hero {
			display: block;
		}
		.hero-actions {
			margin-top: 20px;
			flex-wrap: wrap;
		}
		.stats {
			gap: 20px;
			flex-wrap: wrap;
		}
		.stats .context {
			width: 100%;
			margin-left: 0;
		}
	}
</style>
