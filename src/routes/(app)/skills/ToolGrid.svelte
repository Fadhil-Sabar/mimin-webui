<script lang="ts">
	import type { Tool } from './skills-types';

	let {
		tools,
		enabledTools,
		projectId,
		ontoggle
	}: {
		tools: Tool[];
		enabledTools: string[];
		projectId: string | null;
		ontoggle: (name: string) => void;
	} = $props();
</script>

<section class="tool-section">
	<div class="section-label-row">
		<div>
			<h3>Tools to make available</h3>
			<p>
				These tools replace the conversation’s configurable selection when the skill is activated.
			</p>
		</div>
		<span>{enabledTools.length} selected</span>
	</div>
	<div class="tool-grid">
		{#each tools as tool (tool.name)}<label
				class="tool-option"
				class:disabled={tool.readOnly || (tool.projectOnly && !projectId)}
				><input
					type="checkbox"
					checked={enabledTools.includes(tool.name)}
					disabled={tool.readOnly || (tool.projectOnly && !projectId)}
					onchange={() => ontoggle(tool.name)}
				/><span class="tool-copy"
					><strong>{tool.label}</strong><small>{tool.description}</small>{#if tool.readOnly}<em
							>{tool.settingHint ?? 'Configure this tool in settings.'}</em
						>{:else if tool.projectOnly && !projectId}<em>Available for project skills.</em
						>{/if}</span
				></label
			>{/each}
	</div>
</section>

<style>
	.tool-section {
		margin-top: 22px;
		padding-top: 18px;
		border-top: 1px solid var(--border);
	}
	.section-label-row {
		display: flex;
		align-items: flex-start;
		justify-content: space-between;
		gap: 15px;
	}
	.section-label-row h3 {
		margin: 0 0 3px;
		color: var(--text-strong);
		font-size: var(--text-body-md);
		line-height: var(--text-body-md--line-height);
		letter-spacing: var(--text-body-md--letter-spacing);
	}
	.section-label-row p {
		margin: 0;
		color: var(--text-muted);
		font-size: var(--text-body-sm);
		line-height: var(--text-body-sm--line-height);
		letter-spacing: var(--text-body-sm--letter-spacing);
	}
	.section-label-row > span {
		flex: 0 0 auto;
		color: var(--text-faint);
		font-size: var(--text-label-sm);
		line-height: var(--text-label-sm--line-height);
		letter-spacing: var(--text-label-sm--letter-spacing);
	}
	.tool-grid {
		display: grid;
		grid-template-columns: 1fr 1fr;
		gap: var(--space-2);
		margin-top: var(--space-3);
	}
	.tool-option {
		display: flex;
		align-items: flex-start;
		gap: 9px;
		min-height: 66px;
		padding: 10px;
		background: var(--surface-subtle);
		border: 1px solid var(--border);
		border-radius: var(--radius-md);
		cursor: pointer;
		transition:
			border-color var(--duration-short3) var(--ease-standard),
			background var(--duration-short3) var(--ease-standard);
	}
	.tool-option:hover:not(.disabled) {
		border-color: var(--border-strong);
		background: var(--surface-2);
	}
	.tool-option.disabled {
		cursor: not-allowed;
		opacity: 0.55;
	}
	.tool-option input {
		flex: 0 0 auto;
		width: 15px;
		height: 15px;
		margin: 2px 0 0;
		accent-color: var(--accent-bg);
	}
	.tool-copy {
		min-width: 0;
	}
	.tool-copy strong,
	.tool-copy small,
	.tool-copy em {
		display: block;
	}
	.tool-copy strong {
		color: var(--text-body);
		font-size: var(--text-body-sm);
		line-height: var(--text-body-sm--line-height);
		letter-spacing: var(--text-body-sm--letter-spacing);
		font-weight: 500;
	}
	.tool-copy small {
		margin-top: 2px;
		color: var(--text-dim);
		font-size: var(--text-label-sm);
		line-height: var(--text-label-sm--line-height);
		letter-spacing: var(--text-label-sm--letter-spacing);
	}
	.tool-copy em {
		margin-top: 3px;
		color: var(--status-working-text);
		font-size: var(--text-label-sm);
		line-height: var(--text-label-sm--line-height);
		letter-spacing: var(--text-label-sm--letter-spacing);
		font-style: normal;
	}
	@media (max-width: 560px) {
		.tool-grid {
			grid-template-columns: 1fr;
		}
	}
</style>
