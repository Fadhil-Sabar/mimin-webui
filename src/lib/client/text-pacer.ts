type MotionWindow = Pick<
	Window,
	'requestAnimationFrame' | 'cancelAnimationFrame' | 'performance' | 'matchMedia'
>;

/** Spread bursty network chunks over frames, without delaying history or losing the final tail. */
export function createTextPacer(
	onUpdate: (text: string, pending: boolean) => void,
	view: MotionWindow = window
) {
	let displayed = '';
	let target = '';
	let streaming = false;
	let frame: number | undefined;
	let lastTime = 0;
	let destroyed = false;
	const reduced = () => view.matchMedia('(prefers-reduced-motion: reduce)').matches;

	function cancel() {
		if (frame !== undefined) view.cancelAnimationFrame(frame);
		frame = undefined;
	}

	function step(now: number) {
		frame = undefined;
		if (destroyed) return;
		const elapsed = Math.min(32, Math.max(1, now - lastTime));
		lastTime = now;
		const remaining = target.length - displayed.length;
		// Catch up faster when the provider sends a large chunk, with a short, bounded tail.
		const count = Math.min(
			Math.ceil((elapsed * Math.max(240, remaining / 0.09)) / 1000),
			Math.max(48, Math.ceil(remaining / 10))
		);
		let end = reduced() ? target.length : Math.min(target.length, displayed.length + count);
		const last = target.charCodeAt(end - 1);
		if (end < target.length && last >= 0xd800 && last <= 0xdbff) end++;
		displayed = target.slice(0, end);
		const pending = displayed.length < target.length;
		onUpdate(displayed, pending);
		if (pending) frame = view.requestAnimationFrame(step);
	}

	return {
		set(text: string, live: boolean) {
			if (destroyed) return;
			const pace = live || streaming || frame !== undefined;
			streaming = live;
			target = text;
			if (!pace || reduced() || !text.startsWith(displayed)) {
				cancel();
				displayed = text;
				onUpdate(displayed, false);
				return;
			}
			if (displayed === target) return;
			onUpdate(displayed, true);
			if (frame === undefined) {
				lastTime = view.performance.now();
				frame = view.requestAnimationFrame(step);
			}
		},
		destroy() {
			destroyed = true;
			cancel();
		}
	};
}
