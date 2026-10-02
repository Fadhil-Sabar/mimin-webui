export type StreamingHtmlOptions = { html: string; streaming: boolean };

/** Preserve rendered blocks and reveal only newly appended prose. */
export function streamingHtml(node: HTMLElement, initial: StreamingHtmlOptions) {
	const document = node.ownerDocument;
	const textRuns = new WeakSet<Node>();
	const animations = new Set<Animation>();
	let previousHtml = node.innerHTML;
	let destroyed = false;

	function reducedMotion() {
		return document.defaultView?.matchMedia?.('(prefers-reduced-motion: reduce)').matches ?? true;
	}

	function reveal(element: HTMLElement) {
		if (!element.animate || reducedMotion()) return;
		const animation = element.animate([{ opacity: 0 }, { opacity: 1 }], {
			duration: 220,
			easing: 'cubic-bezier(.22,1,.36,1)'
		});
		animations.add(animation);
		animation.onfinish = () => {
			animations.delete(animation);
			if (!destroyed && node.contains(element) && element.dataset.streamReveal === '') {
				const parent = element.parentNode;
				element.replaceWith(document.createTextNode(element.textContent ?? ''));
				parent?.normalize();
			}
		};
		animation.oncancel = () => animations.delete(animation);
	}

	function appendText(run: HTMLElement, suffix: string, animate: boolean) {
		if (!animate || !run.animate) {
			run.append(document.createTextNode(suffix));
			run.normalize();
			return;
		}
		// A span per received delta, not per token; completed spans become plain text.
		const span = document.createElement('span');
		span.dataset.streamReveal = '';
		span.textContent = suffix;
		run.append(span);
		reveal(span);
	}

	function patchText(current: Node, next: Text, animate: boolean): Node {
		const oldText = current.textContent ?? '';
		if (oldText === next.data) return current;
		if (animate && next.data.startsWith(oldText)) {
			let run: HTMLElement;
			if (textRuns.has(current)) run = current as HTMLElement;
			else {
				run = document.createElement('span');
				textRuns.add(run);
				run.append(document.createTextNode(oldText));
				current.parentNode!.replaceChild(run, current);
			}
			appendText(run, next.data.slice(oldText.length), animate);
			return run;
		}
		current.textContent = next.data;
		return current;
	}

	function patchChildren(parent: Node, desired: Node, animate: boolean) {
		const children = Array.from(desired.childNodes);
		for (let index = 0; index < children.length; index++) {
			const next = children[index];
			const current = parent.childNodes[index];
			if (current && next.nodeType === 3 && (current.nodeType === 3 || textRuns.has(current))) {
				patchText(current, next as Text, animate);
			} else if (
				current?.nodeType === 1 &&
				next.nodeType === 1 &&
				!textRuns.has(current) &&
				(current as Element).tagName === (next as Element).tagName
			) {
				const element = current as Element;
				const nextElement = next as Element;
				for (const attribute of Array.from(element.attributes)) {
					if (!nextElement.hasAttribute(attribute.name)) element.removeAttribute(attribute.name);
				}
				for (const attribute of Array.from(nextElement.attributes)) {
					if (element.getAttribute(attribute.name) !== attribute.value)
						element.setAttribute(attribute.name, attribute.value);
				}
				// Preserve code, math, citation pills, and controls without inserting spans.
				const prose = animate && !element.matches('pre, code, .katex, .citation-pill, svg, button');
				patchChildren(current, next, prose);
			} else {
				let replacement = next.cloneNode(true);
				if (animate && next.nodeType === 3 && next.textContent?.trim()) {
					const run = document.createElement('span');
					textRuns.add(run);
					appendText(run, next.textContent, true);
					replacement = run;
				}
				if (current) parent.replaceChild(replacement, current);
				else parent.appendChild(replacement);
				if (animate && replacement.nodeType === 1 && !textRuns.has(replacement))
					reveal(replacement as HTMLElement);
			}
		}
		while (parent.childNodes.length > children.length) parent.removeChild(parent.lastChild!);
	}

	function update(options: StreamingHtmlOptions) {
		if (options.html === previousHtml) return;
		const template = document.createElement('template');
		template.innerHTML = options.html;
		patchChildren(node, template.content, options.streaming && !reducedMotion());
		previousHtml = options.html;
	}

	if (initial.streaming && !reducedMotion()) {
		for (const child of Array.from(node.children)) reveal(child as HTMLElement);
	}
	update(initial);
	return {
		update,
		destroy() {
			destroyed = true;
			for (const animation of animations) animation.cancel();
			animations.clear();
		}
	};
}
