<script lang="ts">
	import { LayoutTemplate, Plus, ExternalLink, Calendar, Layers } from '@lucide/svelte';
	import type { CanvasSummary } from '$lib/canvas';
	import { resolve } from '$app/paths';
	import { Button } from '$lib/components/ui/button/index.js';

	type Props = {
		canvases: CanvasSummary[];
		oncreatecanvas: () => void;
	};

	let { canvases, oncreatecanvas }: Props = $props();

	function formatDate(iso: string) {
		try {
			return new Date(iso).toLocaleDateString(undefined, {
				month: 'short',
				day: 'numeric',
				year: 'numeric'
			});
		} catch {
			return iso;
		}
	}
</script>

<section class="project-canvases">
	<div class="section-header">
		<div>
			<div class="header-title-row">
				<LayoutTemplate size={16} />
				<h3>Canvas Workspaces</h3>
				<span class="count-badge">{canvases.length}</span>
			</div>
			<p class="header-desc">
				Visual design workspaces with style guidelines and mockups for this project
			</p>
		</div>
		<Button variant="outline" size="sm" onclick={oncreatecanvas}>
			<Plus size={14} /> New Canvas
		</Button>
	</div>

	{#if canvases.length === 0}
		<div class="empty-canvases">
			<LayoutTemplate size={24} class="empty-icon" />
			<p>No visual canvases created for this project yet.</p>
			<Button variant="default" size="sm" onclick={oncreatecanvas}>Create First Canvas</Button>
		</div>
	{:else}
		<div class="canvases-grid">
			{#each canvases as canvas (canvas.id)}
				<div class="canvas-card">
					<div class="canvas-card-top">
						<span class="canvas-card-badge"><LayoutTemplate size={12} /> Canvas</span>
						<span class="canvas-rev">rev {canvas.revision}</span>
					</div>
					<h4 class="canvas-card-title">{canvas.title}</h4>
					<p class="canvas-card-desc">{canvas.description || 'No description.'}</p>
					<div class="canvas-card-footer">
						<span class="scene-count"
							><Layers size={13} />
							{canvas.sceneCount}
							{canvas.sceneCount === 1 ? 'scene' : 'scenes'}</span
						>
						<span class="canvas-date"><Calendar size={13} /> {formatDate(canvas.updatedAt)}</span>
					</div>
					{#if canvas.conversationId}
						<a
							class="open-canvas-link"
							href={resolve(`/chat?id=${encodeURIComponent(canvas.conversationId)}`)}
						>
							Open in Chat <ExternalLink size={12} />
						</a>
					{/if}
				</div>
			{/each}
		</div>
	{/if}
</section>

<style>
	.project-canvases {
		margin-top: 24px;
		padding: 20px;
		background: var(--surface);
		border: 1px solid var(--border);
		border-radius: 10px;
	}

	.section-header {
		display: flex;
		align-items: flex-start;
		justify-content: space-between;
		gap: 16px;
		margin-bottom: 16px;
	}

	.header-title-row {
		display: flex;
		align-items: center;
		gap: 8px;
		color: var(--text-strong);
	}

	.header-title-row h3 {
		margin: 0;
		font-size: var(--text-base);
		font-weight: 600;
	}

	.count-badge {
		background: var(--surface-2);
		border: 1px solid var(--border);
		font-size: var(--text-xs);
		padding: 1px 6px;
		border-radius: 10px;
		color: var(--text-muted);
	}

	.header-desc {
		margin: 4px 0 0;
		font-size: var(--text-xs);
		color: var(--text-muted);
	}

	.empty-canvases {
		display: flex;
		flex-direction: column;
		align-items: center;
		justify-content: center;
		gap: 10px;
		padding: 32px 16px;
		text-align: center;
		color: var(--text-muted);
		font-size: var(--text-sm);
		border: 1px dashed var(--border);
		border-radius: 8px;
	}

	.canvases-grid {
		display: grid;
		grid-template-columns: repeat(auto-fill, minmax(260px, 1fr));
		gap: 14px;
	}

	.canvas-card {
		background: var(--surface-subtle);
		border: 1px solid var(--border);
		border-radius: 8px;
		padding: 14px;
		display: flex;
		flex-direction: column;
		gap: 8px;
		transition: border-color 0.15s;
	}

	.canvas-card:hover {
		border-color: var(--border-strong);
	}

	.canvas-card-top {
		display: flex;
		align-items: center;
		justify-content: space-between;
	}

	.canvas-card-badge {
		font-size: var(--text-xs);
		font-weight: 500;
		display: inline-flex;
		align-items: center;
		gap: 5px;
		color: var(--text-muted);
	}

	.canvas-rev {
		font-size: var(--text-xs);
		color: var(--text-faint);
		font-variant-numeric: tabular-nums;
	}

	.canvas-card-title {
		margin: 0;
		font-size: var(--text-sm);
		font-weight: 600;
		color: var(--text-strong);
	}

	.canvas-card-desc {
		margin: 0;
		font-size: var(--text-xs);
		color: var(--text-muted);
		line-height: 1.4;
		flex: 1;
	}

	.canvas-card-footer {
		display: flex;
		align-items: center;
		justify-content: space-between;
		font-size: 11px;
		color: var(--text-dim);
		padding-top: 8px;
		border-top: 1px solid var(--border);
	}

	.scene-count,
	.canvas-date {
		display: inline-flex;
		align-items: center;
		gap: 4px;
	}

	.open-canvas-link {
		margin-top: 4px;
		font-size: var(--text-xs);
		font-weight: 500;
		color: var(--text-body);
		text-decoration: none;
		display: inline-flex;
		align-items: center;
		gap: 4px;
		transition: color 0.14s ease;
	}

	.open-canvas-link:hover {
		color: var(--text-strong);
		text-decoration: underline;
	}
</style>
