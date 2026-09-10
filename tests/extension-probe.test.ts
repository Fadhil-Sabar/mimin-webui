import { readFile } from 'node:fs/promises';
import { describe, expect, it } from 'vitest';

/**
 * The injected-script probe (`npm run extension:probe`) extracts these two
 * functions by source from the extension IIFE. If either is renamed or made a
 * non-declaration, the probe silently breaks, so guard the seam here.
 */
function extractFunction(code: string, name: string) {
	const start = code.indexOf(`function ${name}(`);
	expect(start, `function ${name} must exist in background-core.js`).toBeGreaterThan(-1);
	let index = code.indexOf('{', start);
	let depth = 0;
	for (; index < code.length; index += 1) {
		const char = code[index];
		if (char === '{') depth += 1;
		else if (char === '}') {
			depth -= 1;
			if (depth === 0) return code.slice(start, index + 1);
		} else if (char === '"' || char === "'" || char === '`') {
			const quote = char;
			index += 1;
			while (index < code.length && code[index] !== quote) {
				if (code[index] === '\\') index += 1;
				index += 1;
			}
		}
	}
	throw new Error(`Unbalanced braces while extracting ${name}`);
}

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
