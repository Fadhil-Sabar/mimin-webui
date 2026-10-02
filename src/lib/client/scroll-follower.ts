/** One damped frame loop follows a growing transcript without restarting smooth scrolls. */
export function createScrollFollower(element: HTMLElement, isPinned: () => boolean) {
	let frame = 0;
	let lastTime = 0;
	let active = false;
	let destroyed = false;
	const view = element.ownerDocument.defaultView!;
	const reduced = () => view.matchMedia('(prefers-reduced-motion: reduce)').matches;

	function cancel() {
		if (frame) view.cancelAnimationFrame(frame);
		frame = 0;
		active = false;
	}

	function step(now: number) {
		frame = 0;
		if (destroyed || !isPinned()) {
			active = false;
			return;
		}
		const target = Math.max(0, element.scrollHeight - element.clientHeight);
		const distance = target - element.scrollTop;
		const elapsed = Math.min(40, Math.max(1, now - lastTime));
		lastTime = now;
		if (reduced() || Math.abs(distance) < 1) {
			element.scrollTop = target;
			active = false;
			return;
		}
		element.scrollTop += distance * (1 - Math.exp(-elapsed / 85));
		frame = view.requestAnimationFrame(step);
	}

	return {
		get active() {
			return active;
		},
		request(immediate = false) {
			if (destroyed || !isPinned()) return;
			if (immediate || reduced()) {
				cancel();
				element.scrollTop = Math.max(0, element.scrollHeight - element.clientHeight);
				return;
			}
			if (frame) return;
			active = true;
			lastTime = view.performance.now();
			frame = view.requestAnimationFrame(step);
		},
		cancel,
		destroy() {
			destroyed = true;
			cancel();
		}
	};
}
