// @vitest-environment happy-dom
import { afterEach, describe, expect, it, vi } from 'vitest';
import { streamingHtml } from '../src/lib/client/streaming-html';

const originalAnimate = Object.getOwnPropertyDescriptor(HTMLElement.prototype, 'animate');

afterEach(() => {
	vi.restoreAllMocks();
	if (originalAnimate) Object.defineProperty(HTMLElement.prototype, 'animate', originalAnimate);
	else delete (HTMLElement.prototype as Partial<HTMLElement>).animate;
	document.body.replaceChildren();
});

function setup(html: string) {
	const node = document.createElement('div');
	node.innerHTML = html;
	document.body.append(node);
	const animations: Animation[] = [];
	vi.spyOn(window, 'matchMedia').mockReturnValue({ matches: false } as MediaQueryList);
	const animate = vi.fn(() => {
		const animation = { onfinish: null, oncancel: null, cancel: vi.fn() } as unknown as Animation;
		animations.push(animation);
		return animation;
	});
	Object.defineProperty(HTMLElement.prototype, 'animate', { value: animate, configurable: true });
	const action = streamingHtml(node, { html, streaming: false });
	return { node, action, animate, animations };
}

describe('streamed Markdown DOM', () => {
	it('retains existing prose and formatting while revealing only appended text', () => {
		const { node, action, animate } = setup('<p>Hello <strong>world</strong></p>');
		const paragraph = node.firstElementChild;
		const emphasis = node.querySelector('strong');
		action.update({ html: '<p>Hello <strong>world</strong> again</p>', streaming: true });
		action.update({ html: '<p>Hello <strong>world</strong> again today</p>', streaming: true });
		expect(node.firstElementChild).toBe(paragraph);
		expect(node.querySelector('strong')).toBe(emphasis);
		expect(node.textContent).toBe('Hello world again today');
		expect(animate).toHaveBeenCalledTimes(2);
	});

	it('reconciles a partial Markdown block that becomes formatted', () => {
		const { node, action } = setup('<p>Hello **wor</p>');
		action.update({ html: '<p>Hello <strong>world</strong>!</p>', streaming: true });
		expect(node.textContent).toBe('Hello world!');
		expect(node.querySelector('strong')?.textContent).toBe('world');
		expect(node.textContent).not.toContain('**');
	});

	it('keeps code, math and citations free of reveal wrappers', () => {
		const { node, action } = setup(
			'<pre><code>con</code></pre><span class="katex">x</span><a class="citation-pill">1</a>'
		);
		action.update({
			html: '<pre><code>const x = 1;</code></pre><span class="katex">xy</span><a class="citation-pill">12</a>',
			streaming: true
		});
		expect(node.querySelector('code')?.textContent).toBe('const x = 1;');
		expect(node.querySelector('[data-stream-reveal]')).toBeNull();
	});

	it('consolidates finished deltas instead of accumulating reveal spans', () => {
		const { node, action, animations } = setup('<p>a</p>');
		for (let i = 1; i <= 30; i++) {
			action.update({ html: `<p>a${'b'.repeat(i)}</p>`, streaming: true });
			const animation = animations.at(-1)!;
			animation.onfinish?.call(animation, {} as AnimationPlaybackEvent);
		}
		expect(node.textContent).toBe(`a${'b'.repeat(30)}`);
		expect(node.querySelectorAll('[data-stream-reveal]')).toHaveLength(0);
		expect(node.querySelector('p > span')?.childNodes).toHaveLength(1);
	});

	it('renders history and reduced-motion updates without animations', () => {
		const { node, action, animate } = setup('<p>old</p>');
		action.update({ html: '<p>old history</p>', streaming: false });
		vi.spyOn(window, 'matchMedia').mockReturnValue({ matches: true } as MediaQueryList);
		action.update({ html: '<p>old history and live text</p>', streaming: true });
		expect(animate).not.toHaveBeenCalled();
		expect(node.textContent).toBe('old history and live text');
	});

	it('cancels in-flight effects when a conversation unmounts', () => {
		const { action, animations } = setup('<p>a</p>');
		action.update({ html: '<p>ab</p>', streaming: true });
		action.destroy();
		expect(animations[0].cancel).toHaveBeenCalledOnce();
	});
});
