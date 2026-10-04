import { describe, expect, it } from 'vitest';
import {
	indentAtCursor,
	indentSelection,
	newlineWithIndent,
	outdentSelection
} from '../src/lib/client/canvas-code-editing';

describe('canvas code editing helpers', () => {
	it('indents empty document', () =>
		expect(indentSelection('', 0, 0)).toEqual({ value: '\t', selectionStart: 1, selectionEnd: 1 }));
	it('handles leading blank line at document start', () =>
		expect(indentSelection('\nfoo', 0, 0)).toEqual({
			value: '\t\nfoo',
			selectionStart: 1,
			selectionEnd: 1
		}));
	it('does not indent next line when selection ends at its start', () =>
		expect(indentSelection('one\ntwo\nthree', 0, 4, '  ')).toEqual({
			value: '  one\ntwo\nthree',
			selectionStart: 2,
			selectionEnd: 6
		}));
	it('indents selected lines but not following line', () =>
		expect(indentSelection('one\ntwo\nthree', 1, 8, '  ')).toEqual({
			value: '  one\n  two\nthree',
			selectionStart: 3,
			selectionEnd: 12
		}));
	it('indents final and empty final lines', () => {
		expect(indentSelection('a\nb', 2, 3)).toEqual({
			value: 'a\n\tb',
			selectionStart: 3,
			selectionEnd: 4
		});
		expect(indentSelection('a\n', 2, 2)).toEqual({
			value: 'a\n\t',
			selectionStart: 3,
			selectionEnd: 3
		});
	});
	it('outdents tabs despite spaces indent setting', () =>
		expect(outdentSelection('\tfirst\n\tsecond', 1, 12, '  ')).toEqual({
			value: 'first\nsecond',
			selectionStart: 0,
			selectionEnd: 10
		}));
	it('outdents up to two spaces by default', () =>
		expect(outdentSelection('  first\n second', 0, 15)).toEqual({
			value: 'first\nsecond',
			selectionStart: 0,
			selectionEnd: 12
		}));
	it('leaves unindented lines unchanged', () =>
		expect(outdentSelection('first\nplain', 0, 11)).toEqual({
			value: 'first\nplain',
			selectionStart: 0,
			selectionEnd: 11
		}));
	it('does not outdent next line at selection boundary', () =>
		expect(outdentSelection('  first\n  second', 0, 8)).toEqual({
			value: 'first\n  second',
			selectionStart: 0,
			selectionEnd: 6
		}));
	it('indents cursor with exact collapsed selection', () =>
		expect(indentAtCursor('abc', 1, '  ')).toEqual({
			value: 'a  bc',
			selectionStart: 3,
			selectionEnd: 3
		}));
	it('adds newline with current indentation', () =>
		expect(newlineWithIndent('  const x = 1;', 14)).toEqual({
			value: '  const x = 1;\n  ',
			selectionStart: 17,
			selectionEnd: 17
		}));
	it('adds newline mid-line with indentation', () =>
		expect(newlineWithIndent('  abcdef', 5)).toEqual({
			value: '  abc\n  def',
			selectionStart: 8,
			selectionEnd: 8
		}));
	it('replaces selection on Enter', () =>
		expect(newlineWithIndent('abXYZcd', 2, 5)).toEqual({
			value: 'ab\ncd',
			selectionStart: 3,
			selectionEnd: 3
		}));
	it('preserves indentation before cursor when replacing selection', () =>
		expect(newlineWithIndent('  abXYZcd', 4, 7)).toEqual({
			value: '  ab\n  cd',
			selectionStart: 7,
			selectionEnd: 7
		}));
});
