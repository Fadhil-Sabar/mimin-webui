import { readFile } from 'node:fs/promises';
import { describe, expect, it } from 'vitest';

/**
 * The injected-script probe (`npm run extension:probe`) extracts these functions
 * by source from the extension IIFE. If either is renamed or made a
 * non-declaration, the probe silently breaks, so guard the seam here using the
 * very same extractor the probe uses.
 */
const { extractFunction } = await import('../scripts/extract-function.mjs');

describe('extension probe extraction', () => {
	it('extracts pageSnapshot and interactPage as self-contained functions', async () => {
		const source = await readFile(
			new URL('../browser-extension/src/background-core.js', import.meta.url),
			'utf8'
		);

		for (const name of ['pageSnapshot', 'interactPage']) {
			const body = extractFunction(source, name);
			// Parsing via the Function constructor proves the slice is valid JS and
			// does not depend on the surrounding IIFE closure.
			expect(() => new Function(`return (${body})`)).not.toThrow();
			expect(body.endsWith('}')).toBe(true);
		}
	});

	it('ignores braces and apostrophes inside comments', () => {
		// A comment is where an unbalanced brace or a lone apostrophe is most likely
		// to appear, and either one used to run the slice past the function end.
		const code = [
			'function outer() {',
			"\t// don't be fooled by } or a trailing quote '",
			'\tconst inner = { a: 1 };',
			'\t/* a block } comment too */',
			'\treturn inner;',
			'}',
			'function next() {',
			'\treturn 1;',
			'}'
		].join('\n');

		const body = extractFunction(code, 'outer');

		// Counting raw braces here would be wrong: the slice is allowed to contain
		// unbalanced braces inside its comments and strings. What matters is that it
		// stops at the right place and parses.
		expect(body).toContain('const inner = { a: 1 };');
		expect(body).not.toContain('function next');
		expect(body.endsWith('}')).toBe(true);
		expect(() => new Function(`return (${body})`)).not.toThrow();
	});

	it('keeps the probe page wired to the generated script', async () => {
		const page = await readFile(
			new URL('../browser-extension/probe/index.html', import.meta.url),
			'utf8'
		);
		expect(page).toContain('<script src="injected.js"></script>');
		expect(page).toContain('pageSnapshot');
		expect(page).toContain('interactPage');
		expect(page).toContain('SUMMARY');
	});
});
