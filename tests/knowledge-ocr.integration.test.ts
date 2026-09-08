import { readFile } from 'node:fs/promises';
import { spawnSync } from 'node:child_process';
import { describe, expect, it } from 'vitest';
import { extractPdfText } from '../src/lib/server/files/pdf-extraction';

const hasTesseract =
	Boolean(process.env.PDF_OCR_COMMAND) || spawnSync('tesseract', ['--version']).status === 0;

describe('PDF fixtures', () => {
	it('extracts native text on both pages with accurate page numbers', async () => {
		const data = await readFile(new URL('./fixtures/knowledge-normal.pdf', import.meta.url));
		const result = await extractPdfText(new Uint8Array(data));
		expect(result.status).toBe('extracted');
		expect(result.pages.map((page) => page.page)).toEqual([1, 2]);
		expect(result.pages[1].text).toContain('page two');
	});
	it.skipIf(!hasTesseract)(
		'renders an image-only PDF and extracts real Tesseract text',
		async () => {
			const data = await readFile(new URL('./fixtures/knowledge-scanned.pdf', import.meta.url));
			const native = await extractPdfText(new Uint8Array(data));
			expect(native.status).toBe('empty');
			const result = await extractPdfText(new Uint8Array(data), {
				ocr: true,
				ocrConfig: { languages: 'eng', command: process.env.PDF_OCR_COMMAND || 'tesseract' }
			});
			expect(result.status).toBe('extracted');
			expect(result.ocrStatus).toBe('completed');
			expect(result.pages[0].source).toBe('ocr');
			expect(result.pages[0].page).toBe(1);
			expect(result.text.toLowerCase()).toContain('project knowledge');
		},
		60_000
	);
});
