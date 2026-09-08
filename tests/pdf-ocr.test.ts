import { readFile } from 'node:fs/promises';
import { describe, expect, it } from 'vitest';
import { extractPdfText, mergePdfPageText } from '../src/lib/server/files/pdf-extraction';
import {
	getPdfOcrConfig,
	ocrPdfPages,
	PDF_OCR_MAX_PAGE_HEIGHT,
	PDF_OCR_MAX_RENDER_PIXELS
} from '../src/lib/server/files/pdf-ocr';
import { chunkUploadedExtraction } from '../src/lib/server/files/storage';

function onePagePdf(text: string) {
	const escaped = text.replace(/\\/g, '\\\\').replace(/\(/g, '\\(').replace(/\)/g, '\\)');
	const stream = `BT /F1 18 Tf 30 180 Td (${escaped}) Tj ET\n`;
	const objects = [
		'<< /Type /Catalog /Pages 2 0 R >>',
		'<< /Type /Pages /Kids [3 0 R] /Count 1 >>',
		'<< /Type /Page /Parent 2 0 R /MediaBox [0 0 300 300] /Contents 4 0 R /Resources << /Font << /F1 5 0 R >> >> >>',
		`<< /Length ${Buffer.byteLength(stream) + 1} >>\nstream\n${stream}endstream`,
		'<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>'
	];
	let pdf = '%PDF-1.4\n';
	const offsets = [0];
	objects.forEach((object, index) => {
		offsets.push(Buffer.byteLength(pdf));
		pdf += `${index + 1} 0 obj\n${object}\nendobj\n`;
	});
	const xrefOffset = Buffer.byteLength(pdf);
	pdf += `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n`;
	for (const offset of offsets.slice(1)) pdf += `${String(offset).padStart(10, '0')} 00000 n \n`;
	pdf += `trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xrefOffset}\n%%EOF\n`;
	return new TextEncoder().encode(pdf);
}

describe('PDF OCR extraction', () => {
	it('keeps native text page-aware without invoking OCR', async () => {
		const result = await extractPdfText(onePagePdf('Native page text'), { timeoutMs: 2_000 });

		expect(result.status).toBe('extracted');
		expect(result.text).toContain('Native page text');
		expect(result.pages).toEqual([expect.objectContaining({ page: 1, source: 'native' })]);
		expect(result.ocrStatus).toBe('not_needed');
	});

	it('returns explicit disabled status and bounds page processing', async () => {
		const disabled = await ocrPdfPages({} as never, [{ page: 1, nativeText: '' }], {
			config: { enabled: false }
		});
		expect(disabled).toMatchObject({ status: 'disabled', error: 'PDF_OCR_DISABLED' });

		const seen: string[] = [];
		const result = await ocrPdfPages(
			{} as never,
			[
				{ page: 1, nativeText: '' },
				{ page: 2, nativeText: '' }
			],
			{
				config: { maxPages: 1, timeoutMs: 1_000, pageTimeoutMs: 1_000 },
				renderPage: async () => Buffer.from('png'),
				runOcr: async (path) => {
					seen.push(await readFile(path, 'utf8'));
					return 'Recognized scan';
				}
			}
		);
		expect(result.status).toBe('partial');
		expect(result.pages).toEqual([{ page: 1, text: 'Recognized scan' }]);
		expect(result.skippedPages).toBe(1);
		expect(seen).toEqual(['png']);
	});

	it('maps unavailable OCR and cleans up when a runner fails', async () => {
		const result = await ocrPdfPages({} as never, [{ page: 1, nativeText: '' }], {
			config: { timeoutMs: 1_000, pageTimeoutMs: 1_000 },
			renderPage: async () => Buffer.from('png'),
			runOcr: async () => {
				throw new Error('PDF_OCR_UNAVAILABLE');
			}
		});
		expect(result).toMatchObject({ status: 'unavailable', error: 'PDF_OCR_UNAVAILABLE' });
	});

	it('keeps the complete OCR passage when it includes a sparse native header', () => {
		expect(mergePdfPageText('Section 1', 'Section 1\nThe scanned body continues here.')).toEqual({
			text: 'Section 1\nThe scanned body continues here.',
			source: 'ocr'
		});
		expect(mergePdfPageText('Section 1\nThe body', 'Section 1')).toEqual({
			text: 'Section 1\nThe body',
			source: 'native'
		});
	});

	it('propagates cancellation to the OCR runner', async () => {
		const controller = new AbortController();
		let runnerStarted!: () => void;
		const started = new Promise<void>((resolve) => {
			runnerStarted = resolve;
		});
		const running = ocrPdfPages({} as never, [{ page: 1, nativeText: '' }], {
			config: { timeoutMs: 2_000, pageTimeoutMs: 2_000 },
			signal: controller.signal,
			renderPage: async () => Buffer.from('png'),
			runOcr: async (_path, { signal }) =>
				new Promise<string>((_resolve, reject) => {
					runnerStarted();
					signal?.addEventListener('abort', () => reject(new Error('PDF_OCR_ABORTED')), {
						once: true
					});
				})
		});
		await started;
		controller.abort();
		expect(await running).toMatchObject({ status: 'failed', error: 'PDF_OCR_ABORTED' });
	});

	it('does not queue unlimited concurrent OCR jobs', async () => {
		let release!: () => void;
		const hold = new Promise<void>((resolve) => {
			release = resolve;
		});
		const first = ocrPdfPages({} as never, [{ page: 1, nativeText: '' }], {
			config: { maxConcurrent: 1, timeoutMs: 2_000, pageTimeoutMs: 2_000 },
			renderPage: async () => Buffer.from('png'),
			runOcr: async () => {
				await hold;
				return 'done';
			}
		});
		const busy = await ocrPdfPages({} as never, [{ page: 2, nativeText: '' }], {
			config: { maxConcurrent: 1 }
		});
		expect(busy).toMatchObject({ status: 'busy', error: 'PDF_OCR_BUSY' });
		release();
		expect((await first).status).toBe('completed');
	});

	it('retains page numbers when chunking extracted content', () => {
		expect(
			chunkUploadedExtraction(
				{
					extractedText: 'unused',
					pages: [
						{ page: 2, text: 'abcdefgh', source: 'ocr' },
						{ page: 4, text: 'ijkl', source: 'native' }
					]
				},
				4
			)
		).toEqual([
			{ content: 'abcd', page: 2 },
			{ content: 'efgh', page: 2 },
			{ content: 'ijkl', page: 4 }
		]);
	});

	it('adds bounded overlap to default knowledge chunks', () => {
		const content = 'a'.repeat(1_500);
		const chunks = chunkUploadedExtraction({ extractedText: content });
		expect(chunks).toHaveLength(2);
		expect(chunks[0]?.content).toHaveLength(1_200);
		expect(chunks[1]?.content).toHaveLength(450);
		expect(chunks[1]?.content).toBe(content.slice(1_050));
	});

	it('exposes safe rendering defaults', () => {
		const config = getPdfOcrConfig({ enabled: true });
		expect(config.maxPageHeight).toBe(PDF_OCR_MAX_PAGE_HEIGHT);
		expect(config.maxRenderPixels).toBe(PDF_OCR_MAX_RENDER_PIXELS);
		expect(config.languages).toContain('eng');
	});
});
