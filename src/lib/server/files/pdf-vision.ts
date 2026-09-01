import { getDocumentProxy, renderPageAsImage } from 'unpdf';
import type { ImageContent } from '@earendil-works/pi-ai';
import { PDF_MAX_IMAGE_SIZE } from './pdf-extraction';

/** Keep visual PDF fallbacks useful without allowing a large PDF to dominate a request. */
export const PDF_VISION_MAX_PAGES = 8;
export const PDF_VISION_PAGE_WIDTH = 1600;
export const PDF_VISION_MAX_BYTES = 16 * 1024 * 1024;
export const PDF_VISION_TIMEOUT_MS = 15_000;
export type PdfVisionPageRenderer = (
	data: Uint8Array,
	pageNumber: number
) => Promise<ArrayBuffer | Uint8Array>;

export type PdfVisionAttachment = {
	filename: string;
	mimeType: string;
	storageKey: string;
	extractionStatus?: string | null;
	extractionError?: string | null;
	pageCount?: number | null;
};

export type PdfVisionFallback = {
	images: ImageContent[];
	notice: string | null;
};

function isBlockedPdfError(error: string | null | undefined) {
	return /password|encrypted|invalid[_ -]?pdf/i.test(error ?? '');
}

/**
 * A PDF is eligible only when text extraction was explicitly empty or failed.
 * Invalid and password-protected files must stay on the normal error path.
 */
export function isPdfVisionFallbackEligible(attachment: PdfVisionAttachment) {
	return (
		attachment.mimeType === 'application/pdf' &&
		(attachment.extractionStatus === 'empty' || attachment.extractionStatus === 'failed') &&
		!isBlockedPdfError(attachment.extractionError)
	);
}

function isBlockedRenderError(error: unknown) {
	const message = error instanceof Error ? error.message : String(error);
	return /password|encrypted|invalid[_ -]?pdf|malformed|corrupt|magic bytes/i.test(message);
}

async function renderPageList(
	data: Uint8Array,
	pageCount: number,
	maxPages: number,
	maxBytes: number,
	deadline: number,
	renderPage: PdfVisionPageRenderer
) {
	const pagesToRender = Math.min(pageCount, PDF_VISION_MAX_PAGES, maxPages);
	const images: ImageContent[] = [];
	let renderedBytes = 0;
	let budgetExhausted = false;
	for (let pageNumber = 1; pageNumber <= pagesToRender; pageNumber += 1) {
		if (Date.now() > deadline) throw new Error('PDF_VISION_RENDER_TIMEOUT');
		const rendered = await renderPage(data, pageNumber);
		const pageData =
			rendered instanceof Uint8Array
				? Buffer.from(rendered)
				: Buffer.from(new Uint8Array(rendered));
		if (renderedBytes + pageData.byteLength > maxBytes) {
			if (images.length === 0) throw new Error('PDF_VISION_IMAGE_TOO_LARGE');
			budgetExhausted = true;
			break;
		}
		images.push({
			type: 'image',
			data: pageData.toString('base64'),
			mimeType: 'image/png'
		});
		renderedBytes += pageData.byteLength;
	}
	return { images, pageCount, pagesToRender: images.length, renderedBytes, budgetExhausted };
}

async function renderPdfPages(
	data: Uint8Array,
	requestedPageCount: number | null | undefined,
	maxPages: number,
	maxBytes: number,
	deadline: number,
	pageRenderer?: PdfVisionPageRenderer
) {
	if (pageRenderer) {
		const pageCount =
			requestedPageCount && requestedPageCount > 0 ? requestedPageCount : PDF_VISION_MAX_PAGES;
		return renderPageList(data, pageCount, maxPages, maxBytes, deadline, pageRenderer);
	}
	const pdf = await getDocumentProxy(data, {
		maxImageSize: PDF_MAX_IMAGE_SIZE,
		stopAtErrors: true,
		disableAutoFetch: true,
		disableStream: true,
		verbosity: 0
	});
	try {
		return renderPageList(
			data,
			pdf.numPages,
			maxPages,
			maxBytes,
			deadline,
			async (_data, pageNumber) => {
				return renderPageAsImage(pdf, pageNumber, {
					canvasImport: () => import('@napi-rs/canvas'),
					width: PDF_VISION_PAGE_WIDTH
				});
			}
		);
	} finally {
		await pdf.cleanup().catch(() => {});
	}
}

/**
 * Builds image content and model-facing metadata for eligible PDFs. Missing
 * visual support or rendering failures are explicit errors so the model never
 * answers as if it saw a PDF that was not actually provided.
 */
export async function buildPdfVisionFallback(
	attachments: PdfVisionAttachment[],
	readFile: (storageKey: string) => Promise<Uint8Array>,
	canAcceptImages: boolean,
	pageRenderer?: PdfVisionPageRenderer
): Promise<PdfVisionFallback> {
	const images: ImageContent[] = [];
	const notices: string[] = [];
	let remainingPages = PDF_VISION_MAX_PAGES;
	let remainingBytes = PDF_VISION_MAX_BYTES;
	const deadline = Date.now() + PDF_VISION_TIMEOUT_MS;

	for (const attachment of attachments) {
		if (attachment.mimeType !== 'application/pdf') continue;
		if (!isPdfVisionFallbackEligible(attachment)) {
			if (
				(attachment.extractionStatus === 'empty' || attachment.extractionStatus === 'failed') &&
				isBlockedPdfError(attachment.extractionError)
			) {
				if (/password|encrypted/i.test(attachment.extractionError ?? ''))
					throw new Error('PDF_PASSWORD_REQUIRED');
				throw new Error('INVALID_PDF');
			}
			continue;
		}
		if (!canAcceptImages) {
			throw new Error('PDF_VISION_MODEL_UNSUPPORTED');
		}
		if (remainingPages <= 0 || remainingBytes <= 0) {
			notices.push(
				`PDF page images for ${attachment.filename} were omitted because the visual fallback budget was reached (${PDF_VISION_MAX_PAGES} pages or ${PDF_VISION_MAX_BYTES} bytes).`
			);
			continue;
		}

		try {
			const result = await renderPdfPages(
				new Uint8Array(await readFile(attachment.storageKey)),
				attachment.pageCount,
				remainingPages,
				remainingBytes,
				deadline,
				pageRenderer
			);
			if (result.images.length === 0) {
				throw new Error('PDF_VISION_RENDER_FAILED');
			}
			images.push(...result.images);
			remainingPages -= result.images.length;
			remainingBytes -= result.renderedBytes;
			const omittedPages = result.pageCount - result.pagesToRender;
			notices.push(
				`Text extraction was unavailable for ${attachment.filename}; attached rendered images for pages 1-${result.pagesToRender} of ${result.pageCount}${omittedPages > 0 || result.budgetExhausted ? ` (${omittedPages > 0 ? `${omittedPages} remaining page${omittedPages === 1 ? '' : 's'}` : 'Additional pages'} omitted to keep the visual fallback bounded)` : ''}.`
			);
		} catch (error) {
			if (isBlockedRenderError(error)) {
				if (/password|encrypted/i.test(error instanceof Error ? error.message : String(error)))
					throw new Error('PDF_PASSWORD_REQUIRED', { cause: error });
				throw new Error('INVALID_PDF', { cause: error });
			}
			throw new Error('PDF_VISION_RENDER_FAILED', { cause: error });
		}
	}

	return { images, notice: notices.length ? notices.join('\n') : null };
}
