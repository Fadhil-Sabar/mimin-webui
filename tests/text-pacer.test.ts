// @vitest-environment happy-dom
import { afterEach, describe, expect, it, vi } from 'vitest';
import { createTextPacer } from '../src/lib/client/text-pacer';

afterEach(() => vi.restoreAllMocks());

function setup() {
	let now = 0;
	let id = 0;
	let reduced = false;
	const frames = new Map<number, FrameRequestCallback>();
	const updates: { text: string; pending: boolean }[] = [];
	const view = {
		performance: { now: () => now } as Performance,
		matchMedia: () => ({ matches: reduced }) as MediaQueryList,
		requestAnimationFrame(callback: FrameRequestCallback) {
			const next = id++;
			frames.set(next, callback);
			return next;
		},
		cancelAnimationFrame(key: number) {
			frames.delete(key);
		}
	};
	const pacer = createTextPacer((text, pending) => updates.push({ text, pending }), view);
	return {
		pacer,
		frames,
		updates,
		reduce: () => {
			reduced = true;
		},
		step(ms = 16) {
			now += ms;
			const callbacks = [...frames.values()];
			frames.clear();
			callbacks.forEach((callback) => callback(now));
		}
	};
}

describe('streaming text pacing', () => {
	it('renders loaded history immediately', () => {
		const { pacer, frames, updates } = setup();
		pacer.set('Existing answer', false);
		expect(updates.at(-1)).toEqual({ text: 'Existing answer', pending: false });
		expect(frames.size).toBe(0);
	});

	it('spreads a burst across frames and uses only one loop for further chunks', () => {
		const { pacer, frames, updates, step } = setup();
		pacer.set('a'.repeat(160), true);
		pacer.set('a'.repeat(160) + 'b'.repeat(160), true);
		expect(frames.size).toBe(1);
		step();
		expect(updates.at(-1)!.text.length).toBeGreaterThan(0);
		expect(updates.at(-1)!.text.length).toBeLessThan(120);
		expect(updates.at(-1)!.pending).toBe(true);
		for (let i = 0; i < 80; i++) step();
		expect(updates.at(-1)).toEqual({ text: 'a'.repeat(160) + 'b'.repeat(160), pending: false });
		expect(frames.size).toBe(0);
	});

	it('drains the authoritative final tail instead of dumping it when streaming ends', () => {
		const { pacer, updates, step } = setup();
		pacer.set('word '.repeat(50), true);
		step();
		pacer.set('word '.repeat(50) + 'finished', false);
		expect(updates.at(-1)!.text.length).toBeLessThan(258);
		for (let i = 0; i < 80; i++) step();
		expect(updates.at(-1)).toEqual({ text: 'word '.repeat(50) + 'finished', pending: false });
	});

	it('catches up large chunks without leaving seconds of artificial backlog', () => {
		const { pacer, updates, step } = setup();
		pacer.set('x'.repeat(20000), true);
		for (let i = 0; i < 60; i++) step();
		expect(updates.at(-1)).toEqual({ text: 'x'.repeat(20000), pending: false });
	});

	it('replaces edited or switched text immediately without mixing old content', () => {
		const { pacer, frames, updates, step } = setup();
		pacer.set('old '.repeat(80), true);
		step();
		pacer.set('Replaced answer', false);
		expect(updates.at(-1)).toEqual({ text: 'Replaced answer', pending: false });
		expect(frames.size).toBe(0);
	});

	it('honors reduced motion even if it changes during the reveal', () => {
		const { pacer, frames, updates, reduce, step } = setup();
		pacer.set('hello '.repeat(60), true);
		step();
		reduce();
		step();
		expect(updates.at(-1)).toEqual({ text: 'hello '.repeat(60), pending: false });
		pacer.set('Next answer', true);
		expect(updates.at(-1)).toEqual({ text: 'Next answer', pending: false });
		expect(frames.size).toBe(0);
	});

	it('does not split UTF-16 surrogate pairs while revealing emoji', () => {
		const { pacer, updates, step } = setup();
		pacer.set('ab', false);
		pacer.set('ab😀c', true);
		step(1);
		expect(updates.at(-1)!.text).toBe('ab😀');
	});

	it('cancels pending frames on unmount and ignores later updates', () => {
		const { pacer, frames, updates, step } = setup();
		pacer.set('text '.repeat(60), true);
		pacer.destroy();
		const count = updates.length;
		pacer.set('ignored', true);
		step();
		expect(updates).toHaveLength(count);
		expect(frames.size).toBe(0);
	});
});
