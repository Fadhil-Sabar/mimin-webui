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
		background: var(--surface-3, #333);
		border: 1px solid var(--border);
		transition:
			background-color 0.2s ease,
			border-color 0.2s ease;
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
		background: #ffffff;
		box-shadow: 0 1px 3px rgba(0, 0, 0, 0.25);
		transition: transform 0.2s ease;
	}
	.switch-indicator.checked .switch-indicator-handle {
		transform: translateX(14px);
	}
</style>
