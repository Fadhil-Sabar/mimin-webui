<script lang="ts">
	/**
	 * Decorative on/off pill. Purely presentational: the surrounding control owns
	 * the semantics (`aria-pressed` on the button), so this stays `aria-hidden` and
	 * must never be nested inside another interactive element as a real control.
	 */
	type Props = {
		checked: boolean;
		readonly?: boolean;
		title?: string;
	};

	let { checked, readonly = false, title }: Props = $props();
</script>

<div class="switch-indicator" class:checked class:readonly aria-hidden="true" {title}>
	<div class="switch-indicator-handle"></div>
</div>

<style>
	.switch-indicator {
		position: relative;
		width: 34px;
		height: 20px;
		border-radius: 10px;
		background: var(--surface-3);
		border: 1px solid var(--border);
		transition:
			background-color var(--duration-short4) var(--ease-standard),
			border-color var(--duration-short4) var(--ease-standard);
		flex-shrink: 0;
	}
	.switch-indicator.checked {
		background: var(--accent-bg);
		border-color: var(--accent-bg);
	}
	.switch-indicator.readonly {
		opacity: 0.55;
		cursor: not-allowed;
	}
	.switch-indicator-handle {
		position: absolute;
		top: 2px;
		left: 2px;
		width: 14px;
		height: 14px;
		border-radius: 50%;
		background: var(--text-dim);
		box-shadow: 0 1px 3px var(--shadow);
		transition:
			transform var(--duration-short4) var(--ease-standard),
			background-color var(--duration-short4) var(--ease-standard);
	}
	.switch-indicator.checked .switch-indicator-handle {
		background: var(--accent-fg);
		transform: translateX(14px);
	}
</style>
