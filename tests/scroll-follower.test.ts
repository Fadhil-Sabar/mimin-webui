// @vitest-environment happy-dom
import { afterEach, describe, expect, it, vi } from 'vitest';
import { createScrollFollower } from '../src/lib/client/scroll-follower';

afterEach(() => vi.restoreAllMocks());

function setup(reduced = false) {
	const element = document.createElement('div');
	Object.defineProperties(element, {
		scrollHeight: { value: 1200, configurable: true },
		clientHeight: { value: 400 }
	});
	let pinned = true;
	let time = performance.now();
	let id = 0;
	const frames = new Map<number, FrameRequestCallback>();
	vi.spyOn(window, 'matchMedia').mockReturnValue({ matches: reduced } as MediaQueryList);
	vi.spyOn(window, 'requestAnimationFrame').mockImplementation((callback) => {
		frames.set(++id, callback);
		return id;
	});
	vi.spyOn(window, 'cancelAnimationFrame').mockImplementation((key) => {
		frames.delete(key);
	});
	const follower = createScrollFollower(element, () => pinned);
	return {
		element,
		follower,
		frames,
		pause: () => {
			pinned = false;
			follower.cancel();
		},
		step: () => {
			time += 16;
			const pending = [...frames.values()];
			frames.clear();
			pending.forEach((callback) => callback(time));
		}
	};
}

describe('transcript scroll following', () => {
	it('uses one smooth loop and follows content that grows during the animation', () => {
		const { element, follower, frames, step } = setup();
		follower.request();
		follower.request();
		expect(frames.size).toBe(1);
		step();
		expect(element.scrollTop).toBeGreaterThan(0);
		expect(element.scrollTop).toBeLessThan(800);
		Object.defineProperty(element, 'scrollHeight', { value: 1500 });
		for (let i = 0; i < 80; i++) step();
		expect(element.scrollTop).toBe(1100);
		expect(frames.size).toBe(0);
	});

	it('does not pull a reader back down after following is paused', () => {
		const { element, follower, frames, pause, step } = setup();
		follower.request();
		step();
		pause();
		const position = element.scrollTop;
		follower.request();
		step();
		expect(element.scrollTop).toBe(position);
		expect(frames.size).toBe(0);
	});

	it('jumps directly for reduced motion and cancels work on teardown', () => {
		const { element, follower, frames } = setup(true);
		follower.request();
		expect(element.scrollTop).toBe(800);
		expect(frames.size).toBe(0);
		follower.destroy();
		follower.request();
		expect(frames.size).toBe(0);
	});
});
