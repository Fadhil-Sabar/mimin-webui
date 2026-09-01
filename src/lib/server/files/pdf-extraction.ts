import { getDocumentProxy } from 'unpdf';

export const PDF_MAX_PAGES = 100;
export const PDF_MAX_TEXT_CHARS = 500_000;
export const PDF_EXTRACTION_TIMEOUT_MS = 10_000;
export const PDF_MAX_IMAGE_SIZE = 16_777_216;

export type PdfExtractionStatus = 'extracted' | 'empty' | 'truncated' | 'failed';
export type PdfExtractionResult = {
	status: PdfExtractionStatus;
	text: string;
	pageCount: number | null;
	error: string | null;
};

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
	options: {
		maxPages?: number;
		maxTextChars?: number;
		timeoutMs?: number;
	} = {}
): Promise<PdfExtractionResult> {
	if (!hasPdfMagicBytes(data)) throw new Error('INVALID_PDF');
	const maxPages = options.maxPages ?? PDF_MAX_PAGES;
	const maxTextChars = options.maxTextChars ?? PDF_MAX_TEXT_CHARS;
	const timeoutMs = options.timeoutMs ?? PDF_EXTRACTION_TIMEOUT_MS;
	const startedAt = Date.now();
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
			const pages: string[] = [];
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
						pages.push(pageText.slice(0, remaining));
						textLength = maxTextChars;
						truncated = true;
						break;
					}
					pages.push(pageText);
					textLength += pageText.length;
				} finally {
					await page.cleanup();
				}
			}
			const text = pages.join('\n').replace(/\r\n/g, '\n').trim();
			return {
				status: text ? (truncated ? 'truncated' : 'extracted') : 'empty',
				text,
				pageCount,
				error: null
			} satisfies PdfExtractionResult;
		})();
		const timeout = new Promise<never>((_, reject) => {
			timer = setTimeout(() => reject(timeoutError()), timeoutMs);
		});
		return await Promise.race([extraction, timeout]);
	} catch (error) {
		if (error instanceof Error && error.message === 'PDF_EXTRACTION_TIMEOUT') timedOut = true;
		return {
			status: 'failed',
			text: '',
			pageCount: pdf?.numPages ?? null,
			error: errorCode(error)
		};
	} finally {
		if (timer) clearTimeout(timer);
		if (pdf) await dispose(pdf, timedOut);
	}
}

export async function extractPdfFile(file: File, options?: Parameters<typeof extractPdfText>[1]) {
	return extractPdfText(new Uint8Array(await file.arrayBuffer()), options);
}
