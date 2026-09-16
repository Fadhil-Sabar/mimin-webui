<script lang="ts">
	import { Bot, MessageSquare, Pencil, Trash2 } from '@lucide/svelte';
	import { Button } from '$lib/components/ui/button/index.js';
	import { formatDate } from './project-format';
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
		gap: 24px;
		padding-bottom: 24px;
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
		border-radius: 10px;
	}
	.hero h1 {
		margin: 0;
		font-family: var(--font-body);
		font-size: var(--text-2xl);
		font-weight: 600;
		line-height: 1.2;
		letter-spacing: -0.025em;
		color: var(--text-strong);
	}
	.hero p {
		max-width: 580px;
		margin: 6px 0 0;
		color: var(--text-muted);
		font-size: var(--text-sm);
		line-height: 1.55;
	}
	.hero-actions {
		display: flex;
		gap: 8px;
		flex: 0 0 auto;
	}
	.stats {
		display: flex;
		align-items: center;
		gap: 32px;
		padding: 16px 0;
		border-bottom: 1px solid var(--border);
	}
	.stat-item {
		display: flex;
		flex-direction: column;
		gap: 2px;
	}
	.stats strong {
		display: block;
		font-size: var(--text-lg);
		font-weight: 600;
		letter-spacing: -0.02em;
		color: var(--text-strong);
		font-variant-numeric: tabular-nums;
		line-height: 1.2;
	}
	.stats span {
		display: block;
		color: var(--text-muted);
		font-size: var(--text-xs);
		font-weight: 450;
		line-height: 1.3;
	}
	.stats .context {
		display: flex;
		align-items: center;
		gap: 7px;
		margin-left: auto;
		font-size: var(--text-xs);
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
