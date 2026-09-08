import { describe, expect, it, vi } from 'vitest';
import { createStreamingDeltaBatcher } from '$lib/client/streaming-batcher';

describe('streaming delta batcher', () => {
	it('coalesces thinking and message deltas until one scheduled flush', () => {
		let scheduled: (() => void) | undefined;
		const onFlush = vi.fn();
		const batcher = createStreamingDeltaBatcher(
			onFlush,
			(callback) => {
				scheduled = callback;
				return 1;
			},
			() => undefined
		);

		batcher.push('assistant-1', 'thinking', 'think ');
		batcher.push('assistant-1', 'thinking', 'more');
		batcher.push('assistant-1', 'text', 'hello');
		expect(onFlush).not.toHaveBeenCalled();

		scheduled?.();
		expect(onFlush).toHaveBeenCalledTimes(1);
		expect(onFlush).toHaveBeenCalledWith([
			{ id: 'assistant-1', thinking: 'think more', text: 'hello' }
		]);
	});

	it('flushes pending deltas synchronously and allows later frames', () => {
		let scheduled: (() => void) | undefined;
		const onFlush = vi.fn();
		const batcher = createStreamingDeltaBatcher(
			onFlush,
			(callback) => {
				scheduled = callback;
				return 1;
			},
			() => undefined
		);

		batcher.push('one', 'text', 'a');
		batcher.flush();
		batcher.push('two', 'text', 'b');
		scheduled?.();

		expect(onFlush).toHaveBeenNthCalledWith(1, [{ id: 'one', thinking: '', text: 'a' }]);
		expect(onFlush).toHaveBeenNthCalledWith(2, [{ id: 'two', thinking: '', text: 'b' }]);
	});
});
