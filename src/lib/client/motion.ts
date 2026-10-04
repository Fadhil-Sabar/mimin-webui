import { cubicIn, cubicOut } from 'svelte/easing';
import { fly, slide, type FlyParams, type SlideParams } from 'svelte/transition';

type Direction = { direction: 'in' | 'out' | 'both' };
type MotionOptions = { enabled?: boolean };

export function prefersReducedMotion(node: Element): boolean {
	return !!node.ownerDocument.defaultView?.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
}

/** Small entrances and faster exits, without changing the element's layout. */
export function reveal(
	node: Element,
	{ enabled = true, y = 8, ...params }: FlyParams & MotionOptions = {},
	{ direction = 'in' }: Direction = { direction: 'in' }
) {
	const exiting = direction === 'out';
	const reduced = !enabled || prefersReducedMotion(node);
	return fly(node, {
		y,
		duration: exiting ? 140 : 250,
		easing: exiting ? cubicIn : cubicOut,
		...params,
		...(reduced ? { duration: 0, delay: 0 } : {})
	});
}

/** Expand real content; skip both animation and staggering for reduced motion. */
export function expand(
	node: Element,
	{ enabled = true, ...params }: SlideParams & MotionOptions = {},
	{ direction = 'in' }: Direction = { direction: 'in' }
) {
	const reduced = !enabled || prefersReducedMotion(node);
	return slide(node, {
		duration: direction === 'out' ? 180 : 280,
		easing: cubicOut,
		...params,
		...(reduced ? { duration: 0, delay: 0 } : {})
	});
}
