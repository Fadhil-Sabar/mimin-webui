import { getDocumentProxy } from 'unpdf';
import {
	getPdfOcrConfig,
	ocrPdfPages,
	PDF_OCR_NATIVE_TEXT_THRESHOLD,
	type PdfOcrConfig,
	type PdfOcrStatus
} from './pdf-ocr';

export const PDF_MAX_PAGES = 100;
export const PDF_MAX_TEXT_CHARS = 500_000;
export const PDF_EXTRACTION_TIMEOUT_MS = 10_000;
export const PDF_MAX_IMAGE_SIZE = 16_777_216;

export type PdfExtractionStatus = 'extracted' | 'empty' | 'truncated' | 'partial' | 'failed';
export type PdfExtractionPage = {
	page: number;
	text: string;
	source: 'native' | 'ocr' | 'hybrid';
};
export type PdfExtractionOptions = {
	maxPages?: number;
	maxTextChars?: number;
	timeoutMs?: number;
	/** Enables OCR for sparse pages. Chat attachment extraction leaves this disabled. */
	ocr?: boolean;
	ocrConfig?: Partial<PdfOcrConfig>;
};
export type PdfExtractionResult = {
	status: PdfExtractionStatus;
	text: string;
	pages: PdfExtractionPage[];
	pageCount: number | null;
	error: string | null;
	ocrStatus: PdfOcrStatus;
};

export function mergePdfPageText(
	nativeText: string,
	ocrText: string
): { text: string; source: PdfExtractionPage['source'] } {
	if (!nativeText) return { text: ocrText, source: 'ocr' };
	if (!ocrText) return { text: nativeText, source: 'native' };
	const nativeNormalized = nativeText.replace(/\s+/g, ' ').trim().toLowerCase();
	const ocrNormalized = ocrText.replace(/\s+/g, ' ').trim().toLowerCase();
	if (nativeNormalized === ocrNormalized) return { text: nativeText, source: 'native' };
	if (ocrNormalized.includes(nativeNormalized)) return { text: ocrText, source: 'ocr' };
	if (nativeNormalized.includes(ocrNormalized)) return { text: nativeText, source: 'native' };
	return { text: `${nativeText}\n${ocrText}`, source: 'hybrid' };
}

export function hasPdfMagicBytes(data: Uint8Array) {
	return data.length >= 5 && new TextDecoder().decode(data.subarray(0, 5)) === '%PDF-';
}

function errorCode(error: unknown) {
	const value = error as { name?: string; code?: number; message?: string };
	const message = value?.message ?? '';
	if (value?.name === 'PasswordException' || /password|encrypted/i.test(message))
		return 'PDF_PASSWORD_REQUIRED';
	if (/too many pages/i.test(message)) return 'PDF_TOO_MANY_PAGES';
	if (/timeout|timed out/i.test(message)) return 'PDF_EXTRACTION_TIMEOUT';
	return value?.code === 1 ? 'PDF_PASSWORD_REQUIRED' : 'PDF_EXTRACTION_FAILED';
}

function timeoutError() {
	return new Error('PDF_EXTRACTION_TIMEOUT');
}

async function disposePdf(
	document: Awaited<ReturnType<typeof getDocumentProxy>>,
	destroy: boolean
) {
	if (destroy) {
		try {
			const loadingTask = document.loadingTask as { destroy?: () => Promise<void> };
			if (typeof loadingTask.destroy === 'function') {
				await loadingTask.destroy();
				return;
			}
		} catch {
			// Fall through to cleanup if PDF.js cannot destroy the loading task.
		}
	}
	await document.cleanup().catch(() => {});
}

/** Extracts text once with page, text, image-resource, and wall-clock limits. */
export async function extractPdfText(
	data: Uint8Array,
	options: PdfExtractionOptions = {}
): Promise<PdfExtractionResult> {
	if (!hasPdfMagicBytes(data)) throw new Error('INVALID_PDF');
	const maxPages = options.maxPages ?? PDF_MAX_PAGES;
	const maxTextChars = options.maxTextChars ?? PDF_MAX_TEXT_CHARS;
	const timeoutMs =
		options.timeoutMs ??
		(options.ocr
			? Math.max(PDF_EXTRACTION_TIMEOUT_MS, getPdfOcrConfig(options.ocrConfig).timeoutMs)
			: PDF_EXTRACTION_TIMEOUT_MS);
	const startedAt = Date.now();
	const ocrAbortController = options.ocr ? new AbortController() : undefined;
	let timer: ReturnType<typeof setTimeout> | undefined;
	let pdf: Awaited<ReturnType<typeof getDocumentProxy>> | undefined;
	let timedOut = false;
	let disposePromise: Promise<void> | undefined;
	const dispose = (document: Awaited<ReturnType<typeof getDocumentProxy>>, destroy: boolean) => {
		disposePromise ??= disposePdf(document, destroy);
		return disposePromise;
	};
	try {
		const load = getDocumentProxy(data, {
			maxImageSize: PDF_MAX_IMAGE_SIZE,
			stopAtErrors: true,
			disableAutoFetch: true,
			disableStream: true,
			verbosity: 0
		}).then((document) => {
			pdf = document;
			if (timedOut) void dispose(document, true);
			return document;
		});
		const extraction = (async () => {
			const document = await load;
			const pageCount = document.numPages;
			if (pageCount > maxPages) throw new Error('PDF_TOO_MANY_PAGES');
			const pages: PdfExtractionPage[] = [];
			const candidates: Array<{ page: number; nativeText: string }> = [];
			let textLength = 0;
			let truncated = false;
			for (let pageNumber = 1; pageNumber <= pageCount; pageNumber += 1) {
				if (Date.now() - startedAt > timeoutMs) throw timeoutError();
				const page = await document.getPage(pageNumber);
				try {
					const pageText = (await page.getTextContent()).items
						.filter((item) => 'str' in item && typeof item.str === 'string')
						.map(
							(item) =>
								('str' in item ? item.str : '') + ('hasEOL' in item && item.hasEOL ? '\n' : '')
						)
						.join('');
					const remaining = maxTextChars - textLength;
					if (remaining <= 0) {
						truncated = true;
						break;
					}
					if (pageText.length > remaining) {
						pages.push({ page: pageNumber, text: pageText.slice(0, remaining), source: 'native' });
						textLength = maxTextChars;
						truncated = true;
						break;
					}
					pages.push({ page: pageNumber, text: pageText, source: 'native' });
					if (pageText.trim().length < PDF_OCR_NATIVE_TEXT_THRESHOLD)
						candidates.push({ page: pageNumber, nativeText: pageText });
					textLength += pageText.length;
				} finally {
					await page.cleanup();
				}
			}

			let ocrStatus: PdfOcrStatus = 'not_needed';
			let ocrError: string | null = null;
			if (options.ocr && candidates.length && !truncated) {
				const ocr = await ocrPdfPages(document, candidates, {
					config: options.ocrConfig,
					deadlineMs: startedAt + timeoutMs,
					signal: ocrAbortController?.signal
				});
				ocrStatus = ocr.status;
				ocrError = ocr.error;
				for (const ocrPage of ocr.pages) {
					const page = pages.find((candidate) => candidate.page === ocrPage.page);
					if (!page || !ocrPage.text) continue;
					const merged = mergePdfPageText(page.text, ocrPage.text);
					page.text = merged.text;
					page.source = merged.source;
				}
			}

			let remainingText = maxTextChars;
			const boundedPages: PdfExtractionPage[] = [];
			let outputTruncated = truncated;
			for (const page of pages) {
				if (remainingText <= 0) {
					outputTruncated = true;
					break;
				}
				const text = page.text.slice(0, remainingText);
				if (text.length < page.text.length) outputTruncated = true;
				boundedPages.push({ ...page, text });
				remainingText -= text.length;
			}
			const text = boundedPages
				.map((page) => page.text)
				.join('\n')
				.replace(/\r\n/g, '\n')
				.trim();
			const partial =
				ocrStatus === 'partial' ||
				ocrStatus === 'failed' ||
				ocrStatus === 'busy' ||
				ocrStatus === 'unavailable';
			return {
				status: text
					? outputTruncated
						? 'truncated'
						: partial
							? 'partial'
							: 'extracted'
					: 'empty',
				text,
				pages: boundedPages,
				pageCount,
				error: ocrError,
				ocrStatus
			} satisfies PdfExtractionResult;
		})();
		const timeout = new Promise<never>((_, reject) => {
			timer = setTimeout(() => {
				ocrAbortController?.abort();
				reject(timeoutError());
			}, timeoutMs);
		});
		return await Promise.race([extraction, timeout]);
	} catch (error) {
		if (error instanceof Error && error.message === 'PDF_EXTRACTION_TIMEOUT') timedOut = true;
		return {
			status: 'failed',
			text: '',
			pages: [],
			pageCount: pdf?.numPages ?? null,
			error: errorCode(error),
			ocrStatus: 'not_needed'
		};
	} finally {
		if (timer) clearTimeout(timer);
		if (pdf) await dispose(pdf, timedOut);
	}
}

export async function extractPdfFile(file: File, options?: PdfExtractionOptions) {
	return extractPdfText(new Uint8Array(await file.arrayBuffer()), options);
}
