// @vitest-environment happy-dom
import { describe, expect, it } from 'vitest';
import katex from 'katex';
import { mathmlToUnicode } from '../src/lib/client/math-clipboard';

function toUnicode(latex: string, displayMode = false): string {
	const html = katex.renderToString(latex, { displayMode, throwOnError: true });
	const container = document.createElement('div');
	container.innerHTML = html;
	return mathmlToUnicode(container);
}

describe('mathmlToUnicode', () => {
	it('converts inline superscripts', () => {
		expect(toUnicode('E=mc^2')).toBe('E=mc²');
	});

	it('converts integrals with sub and superscript limits', () => {
		expect(toUnicode('\\int_0^1 x^2 dx', true)).toBe('∫₀¹x²dx');
	});

	it('converts fractions', () => {
		expect(toUnicode('\\frac{1}{3}', true)).toBe('1/3');
	});

	it('converts greek letters and sqrt', () => {
		expect(toUnicode('\\alpha + \\beta = \\sqrt{x}')).toBe('α+β=√(x)');
	});

	it('converts sums with limits under and over', () => {
		expect(toUnicode('\\sum_{i=1}^{n} i', true)).toBe('∑_{i=1}^{n}i');
	});

	it('falls back to text content when no mathml is present', () => {
		const container = document.createElement('div');
		container.innerHTML = '<span>just text</span>';
		expect(mathmlToUnicode(container)).toBe('just text');
	});
});
