import { cubicOut } from 'svelte/easing';
import { slide } from 'svelte/transition';

/** Live tool rows expand into the transcript; loaded history stays still. */
export function liveSlide(node: Element, { enabled = true } = {}) {
	const reduced = node.ownerDocument.defaultView?.matchMedia?.(
		'(prefers-reduced-motion: reduce)'
	).matches;
	return slide(node, { duration: enabled && !reduced ? 280 : 0, easing: cubicOut });
}
