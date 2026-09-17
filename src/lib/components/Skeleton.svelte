<script lang="ts">
	/**
	 * A shimmering placeholder for content that has not arrived yet.
	 *
	 * Presentational only: it is `aria-hidden`, because a bare rectangle says nothing.
	 * The region that owns the placeholders should carry `role="status"` and a label
	 * naming what is loading, so the wait is announced once rather than once per bar.
	 *
	 * The fill, the sweep and the reduced-motion fallback all live in the global
	 * `.skeleton` class in layout.css, next to `.shimmer-text`, so the two loading
	 * treatments share one keyframe and one place to tune.
	 */
	type Props = {
		/** Any CSS length. Defaults to filling the container. */
		width?: string;
		height?: string;
		radius?: string;
		class?: string;
	};

	let {
		width = '100%',
		height = 'var(--text-body-md--line-height)',
		radius = 'var(--radius-sm)',
		class: className = ''
	}: Props = $props();
</script>

<span
	class="skeleton {className}"
	style:width
	style:height
	style:border-radius={radius}
	aria-hidden="true"
></span>
