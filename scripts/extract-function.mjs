/**
 * Source extraction for the injected-script probe.
 *
 * Shared by `scripts/extension-probe.mjs` and its guard test. They used to carry
 * separate copies of this function and the copies drifted: the test kept a
 * version that ignored comments, so it passed while the probe it exists to guard
 * was extracting mangled functions.
 */

/**
 * Extract a top-level function declaration by matching braces.
 *
 * Comments and string bodies are skipped, because a brace or a lone apostrophe
 * inside either one would otherwise derail the depth count: an apostrophe in a
 * comment used to swallow the rest of the file.
 *
 * @param {string} code
 * @param {string} name
 * @param {string} [context] Source description used in error messages.
 * @returns {string}
 */
export function extractFunction(code, name, context = 'the extension source') {
	const start = code.indexOf(`function ${name}(`);
	if (start === -1) throw new Error(`Could not find function ${name} in ${context}`);
	let index = code.indexOf('{', start);
	let depth = 0;
	for (; index < code.length; index += 1) {
		const char = code[index];
		if (char === '/' && code[index + 1] === '/') {
			while (index < code.length && code[index] !== '\n') index += 1;
		} else if (char === '/' && code[index + 1] === '*') {
			const end = code.indexOf('*/', index + 2);
			index = end === -1 ? code.length : end + 1;
		} else if (char === '{') depth += 1;
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
