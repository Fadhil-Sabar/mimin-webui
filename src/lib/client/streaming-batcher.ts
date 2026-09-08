export type StreamingDelta = {
	id: string;
	thinking: string;
	text: string;
};

type Schedule = (callback: () => void) => number;
type Cancel = (handle: number) => void;

const defaultSchedule: Schedule = (callback) =>
	typeof requestAnimationFrame === 'function'
		? requestAnimationFrame(callback)
		: (setTimeout(callback, 16) as unknown as number);
const defaultCancel: Cancel = (handle) =>
	typeof cancelAnimationFrame === 'function'
		? cancelAnimationFrame(handle)
		: clearTimeout(handle as unknown as ReturnType<typeof setTimeout>);

/** Coalesce token-sized deltas into at most one state update per frame. */
export function createStreamingDeltaBatcher(
	onFlush: (deltas: StreamingDelta[]) => void,
	schedule: Schedule = defaultSchedule,
	cancel: Cancel = defaultCancel
) {
	const pending = new Map<string, StreamingDelta>();
	let scheduledHandle: number | undefined;

	const flush = () => {
		scheduledHandle = undefined;
		if (pending.size === 0) return;
		const deltas = [...pending.values()];
		pending.clear();
		onFlush(deltas);
	};

	return {
		push(id: string, kind: 'thinking' | 'text', delta: string) {
			if (!delta) return;
			const current = pending.get(id) ?? { id, thinking: '', text: '' };
			current[kind] += delta;
			pending.set(id, current);
			if (scheduledHandle === undefined) scheduledHandle = schedule(flush);
		},
		flush() {
			if (scheduledHandle !== undefined) {
			cancel(scheduledHandle);
			scheduledHandle = undefined;
		}
			flush();
		},
		clear() {
			if (scheduledHandle !== undefined) cancel(scheduledHandle);
			scheduledHandle = undefined;
			pending.clear();
		}
	};
}
