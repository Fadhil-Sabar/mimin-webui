export type EditResult = { value: string; selectionStart: number; selectionEnd: number };

function lineStart(value: string, index: number): number {
	if (index === 0) return 0;
	return value.lastIndexOf('\n', index - 1) + 1;
}

function lineEnd(value: string, index: number): number {
	const newline = value.indexOf('\n', index);
	return newline === -1 ? value.length : newline;
}

export function indentSelection(
	value: string,
	selectionStart: number,
	selectionEnd: number,
	indent = '\t'
): EditResult {
	const start = lineStart(value, selectionStart);
	const effectiveEnd =
		selectionEnd > selectionStart && value[selectionEnd - 1] === '\n'
			? selectionEnd - 1
			: selectionEnd;
	const end = lineEnd(value, effectiveEnd);
	const selectedText = value.slice(start, end);
	const lines = selectedText.split('\n');
	const replacement = lines.map((line) => indent + line).join('\n');
	const selectedLineCount = lines.length - (selectedText.endsWith('\n') ? 1 : 0);
	const delta = indent.length * selectedLineCount;
	return {
		value: value.slice(0, start) + replacement + value.slice(end),
		selectionStart: selectionStart + indent.length,
		selectionEnd: selectionEnd + (selectionEnd === selectionStart ? indent.length : delta)
	};
}

export function outdentSelection(
	value: string,
	selectionStart: number,
	selectionEnd: number,
	indent = '\t'
): EditResult {
	const start = lineStart(value, selectionStart);
	const effectiveEnd =
		selectionEnd > selectionStart && value[selectionEnd - 1] === '\n'
			? selectionEnd - 1
			: selectionEnd;
	const end = lineEnd(value, effectiveEnd);
	const selectedText = value.slice(start, end);
	const selected = selectedText.split('\n');
	let removedBeforeStart = 0;
	let removedInSelection = 0;
	const replacement = selected
		.map((line, index) => {
			const spaceWidth = indent === '\t' ? 2 : Math.max(1, indent.length);
			let remove = 0;
			if (line.startsWith('\t')) remove = 1;
			else while (remove < spaceWidth && line[remove] === ' ') remove++;
			if (index === 0) removedBeforeStart = Math.min(remove, selectionStart - start);
			removedInSelection += remove;
			return line.slice(remove);
		})
		.join('\n');
	return {
		value: value.slice(0, start) + replacement + value.slice(end),
		selectionStart: Math.max(start, selectionStart - removedBeforeStart),
		selectionEnd: Math.max(start, selectionEnd - removedInSelection)
	};
}

export function indentAtCursor(value: string, cursor: number, indent = '\t'): EditResult {
	return {
		value: value.slice(0, cursor) + indent + value.slice(cursor),
		selectionStart: cursor + indent.length,
		selectionEnd: cursor + indent.length
	};
}

export function newlineWithIndent(
	value: string,
	cursor: number,
	selectionEnd = cursor
): EditResult {
	const startOfLine = lineStart(value, cursor);
	let firstNonIndent = startOfLine;
	while (
		firstNonIndent < cursor &&
		(value[firstNonIndent] === ' ' || value[firstNonIndent] === '\t')
	) {
		firstNonIndent++;
	}
	const indent = value.slice(startOfLine, firstNonIndent);
	const insertion = '\n' + indent;
	const result = value.slice(0, cursor) + insertion + value.slice(selectionEnd);
	const caret = cursor + insertion.length;
	return { value: result, selectionStart: caret, selectionEnd: caret };
}
