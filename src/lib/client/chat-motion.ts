import { expand } from './motion';

/** Live tool rows expand into the transcript; loaded history stays still. */
export function liveSlide(node: Element, { enabled = true } = {}) {
	return expand(node, { enabled });
}
