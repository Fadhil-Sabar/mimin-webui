import { spawn, type ChildProcess } from 'node:child_process';
import { mkdtemp, rm, unlink, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { renderPageAsImage, type getDocumentProxy } from 'unpdf';
import { env } from '$env/dynamic/private';

/** Defaults keep OCR bounded for both normal uploads and adversarial PDFs. */
export const PDF_OCR_MAX_PAGES = 24;
export const PDF_OCR_PAGE_WIDTH = 1800;
export const PDF_OCR_MAX_RENDER_BYTES = 8 * 1024 * 1024;
export const PDF_OCR_MAX_PAGE_HEIGHT = 3600;
export const PDF_OCR_MAX_RENDER_PIXELS = 8_000_000;
export const PDF_OCR_MAX_TEXT_CHARS = 500_000;
export const PDF_OCR_TIMEOUT_MS = 60_000;
export const PDF_OCR_PAGE_TIMEOUT_MS = 15_000;
export const PDF_OCR_MAX_CONCURRENT = 2;
export const PDF_OCR_LANGUAGES = 'eng+ind';
export const PDF_OCR_NATIVE_TEXT_THRESHOLD = 80;

export type PdfOcrStatus =
	'not_needed' | 'disabled' | 'busy' | 'unavailable' | 'completed' | 'partial' | 'failed';

export type PdfOcrPage = {
	page: number;
	text: string;
};

export type PdfOcrConfig = {
	enabled: boolean;
	command: string;
	languages: string;
	maxPages: number;
	pageWidth: number;
	maxPageHeight: number;
	maxRenderPixels: number;
	maxRenderBytes: number;
	maxTextChars: number;
	timeoutMs: number;
	pageTimeoutMs: number;
	maxConcurrent: number;
};

export type PdfOcrResult = {
	status: PdfOcrStatus;
	pages: PdfOcrPage[];
	error: string | null;
	processedPages: number;
	skippedPages: number;
};

type PdfDocument = Awaited<ReturnType<typeof getDocumentProxy>>;
export type PdfOcrCandidate = { page: number; nativeText?: string };

let activeOcrJobs = 0;

function environmentValue(name: string) {
	return (
		(env as Record<string, string | undefined>)[name] ??
		(typeof process !== 'undefined' ? process.env[name] : undefined)
	);
}

function positiveInteger(value: string | undefined, fallback: number) {
	const parsed = Number.parseInt(value ?? '', 10);
	return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

function booleanValue(value: string | undefined, fallback: boolean) {
	if (value == null) return fallback;
	return !/^(0|false|no|off)$/i.test(value.trim());
}

/** Resolve OCR settings per call so test processes and long-running servers can reconfigure them. */
export function getPdfOcrConfig(overrides: Partial<PdfOcrConfig> = {}): PdfOcrConfig {
	const config: PdfOcrConfig = {
		enabled: booleanValue(environmentValue('PDF_OCR_ENABLED'), true),
		command: environmentValue('PDF_OCR_COMMAND') ?? 'tesseract',
		languages:
			environmentValue('PDF_OCR_LANGUAGES') ??
			environmentValue('TESSERACT_LANGUAGES') ??
			PDF_OCR_LANGUAGES,
		maxPages: positiveInteger(environmentValue('PDF_OCR_MAX_PAGES'), PDF_OCR_MAX_PAGES),
		pageWidth: positiveInteger(environmentValue('PDF_OCR_PAGE_WIDTH'), PDF_OCR_PAGE_WIDTH),
		maxPageHeight: positiveInteger(
			environmentValue('PDF_OCR_MAX_PAGE_HEIGHT'),
			PDF_OCR_MAX_PAGE_HEIGHT
		),
		maxRenderPixels: positiveInteger(
			environmentValue('PDF_OCR_MAX_RENDER_PIXELS'),
			PDF_OCR_MAX_RENDER_PIXELS
		),
		maxRenderBytes: positiveInteger(
			environmentValue('PDF_OCR_MAX_RENDER_BYTES'),
			PDF_OCR_MAX_RENDER_BYTES
		),
		maxTextChars: positiveInteger(
			environmentValue('PDF_OCR_MAX_TEXT_CHARS'),
			PDF_OCR_MAX_TEXT_CHARS
		),
		timeoutMs: positiveInteger(environmentValue('PDF_OCR_TIMEOUT_MS'), PDF_OCR_TIMEOUT_MS),
		pageTimeoutMs: positiveInteger(
			environmentValue('PDF_OCR_PAGE_TIMEOUT_MS'),
			PDF_OCR_PAGE_TIMEOUT_MS
		),
		maxConcurrent: positiveInteger(
			environmentValue('PDF_OCR_MAX_CONCURRENT'),
			PDF_OCR_MAX_CONCURRENT
		)
	};
	return { ...config, ...overrides };
}

function ocrErrorCode(error: unknown) {
	const value = error as { code?: string; message?: string };
	const message = value?.message ?? '';
	const explicitCode = message.match(/^PDF_OCR_[A-Z_]+$/i)?.[0];
	if (explicitCode) return explicitCode.toUpperCase();
	if (value?.code === 'ENOENT' || /not found|enoent/i.test(message)) return 'PDF_OCR_UNAVAILABLE';
	if (/PDF_OCR_UNAVAILABLE/i.test(message)) return 'PDF_OCR_UNAVAILABLE';
	if (/timeout|timed out/i.test(message)) return 'PDF_OCR_TIMEOUT';
	if (/text limit|too much output/i.test(message)) return 'PDF_OCR_TEXT_LIMIT';
	return 'PDF_OCR_FAILED';
}

function stopProcess(process: ChildProcess) {
	try {
		process.kill('SIGKILL');
	} catch {
		// The process may have exited between the timeout and kill call.
	}
}

/** Run Tesseract without a shell and with a hard wall-clock and output bound. */
export function runTesseract(
	imagePath: string,
	options: {
		command?: string;
		languages?: string;
		timeoutMs?: number;
		maxTextChars?: number;
		signal?: AbortSignal;
	} = {}
) {
	const timeoutMs = options.timeoutMs ?? PDF_OCR_PAGE_TIMEOUT_MS;
	const maxTextChars = options.maxTextChars ?? PDF_OCR_MAX_TEXT_CHARS;
	return new Promise<string>((resolve, reject) => {
		let child: ChildProcess;
		try {
			child = spawn(
				options.command ?? 'tesseract',
				[imagePath, 'stdout', '-l', options.languages ?? PDF_OCR_LANGUAGES, '--psm', '3'],
				{ shell: false, stdio: ['ignore', 'pipe', 'pipe'] }
			);
		} catch (error) {
			reject(new Error(ocrErrorCode(error)));
			return;
		}

		let output = '';
		let errorOutput = '';
		let timedOut = false;
		let textLimit = false;
		let settled = false;
		const timer = setTimeout(() => {
			timedOut = true;
			stopProcess(child);
		}, timeoutMs);
		const settle = (error?: Error) => {
			if (settled) return;
			settled = true;
			clearTimeout(timer);
			options.signal?.removeEventListener('abort', abortHandler);
			if (error) reject(error);
			else resolve(output.replace(/\r\n/g, '\n').trim());
		};
		const abortHandler = () => {
			stopProcess(child);
			settle(new Error('PDF_OCR_ABORTED'));
		};
		if (options.signal?.aborted) return abortHandler();
		options.signal?.addEventListener('abort', abortHandler, { once: true });

		child.stdout?.on('data', (chunk: Buffer | string) => {
			if (textLimit) return;
			output += chunk.toString();
			if (output.length > maxTextChars) {
				output = output.slice(0, maxTextChars);
				textLimit = true;
				stopProcess(child);
			}
		});
		child.stderr?.on('data', (chunk: Buffer | string) => {
			// Keep stderr bounded; it is only used to aid local diagnostics and is never returned.
			errorOutput = (errorOutput + chunk.toString()).slice(-4000);
		});
		child.once('error', (error) => settle(new Error(ocrErrorCode(error))));
		child.once('close', (code, signal) => {
			if (timedOut) return settle(new Error('PDF_OCR_TIMEOUT'));
			if (textLimit) return settle(new Error('PDF_OCR_TEXT_LIMIT'));
			if (code !== 0) {
				const error = new Error(code == null && signal ? 'PDF_OCR_FAILED' : 'PDF_OCR_FAILED');
				if (errorOutput) error.cause = errorOutput;
				return settle(error);
			}
			settle();
		});
	});
}

async function renderOcrPage(document: PdfDocument, page: number, config: PdfOcrConfig) {
	const pdfPage = await document.getPage(page);
	try {
		const viewport = pdfPage.getViewport({ scale: 1 });
		const scale = config.pageWidth / viewport.width;
		const renderedWidth = Math.ceil(viewport.width * scale);
		const renderedHeight = Math.ceil(viewport.height * scale);
		if (
			renderedWidth > config.pageWidth + 1 ||
			renderedHeight > config.maxPageHeight ||
			renderedWidth * renderedHeight > config.maxRenderPixels
		)
			throw new Error('PDF_OCR_RENDER_BOUNDS');
	} finally {
		await pdfPage.cleanup();
	}
	const rendered = await renderPageAsImage(document, page, {
		canvasImport: () => import('@napi-rs/canvas'),
		width: config.pageWidth
	});
	const bytes = Buffer.from(new Uint8Array(rendered));
	if (bytes.byteLength > config.maxRenderBytes) throw new Error('PDF_OCR_IMAGE_TOO_LARGE');
	return bytes;
}

/** OCR only the sparse pages selected by PDF text extraction. */
export async function ocrPdfPages(
	document: PdfDocument,
	candidates: PdfOcrCandidate[],
	options: {
		config?: Partial<PdfOcrConfig>;
		deadlineMs?: number;
		signal?: AbortSignal;
		renderPage?: (document: PdfDocument, page: number, config: PdfOcrConfig) => Promise<Buffer>;
		runOcr?: (
			path: string,
			options: {
				command: string;
				languages: string;
				timeoutMs: number;
				maxTextChars: number;
				signal?: AbortSignal;
			}
		) => Promise<string>;
	} = {}
): Promise<PdfOcrResult> {
	const config = getPdfOcrConfig(options.config);
	if (!config.enabled) {
		return {
			status: 'disabled',
			pages: [],
			error: 'PDF_OCR_DISABLED',
			processedPages: 0,
			skippedPages: candidates.length
		};
	}
	if (!candidates.length)
		return { status: 'not_needed', pages: [], error: null, processedPages: 0, skippedPages: 0 };
	if (activeOcrJobs >= config.maxConcurrent) {
		return {
			status: 'busy',
			pages: [],
			error: 'PDF_OCR_BUSY',
			processedPages: 0,
			skippedPages: candidates.length
		};
	}
	activeOcrJobs += 1;

	const pagesToProcess = candidates.slice(0, config.maxPages);
	const skippedPages = candidates.length - pagesToProcess.length;
	const deadline = options.deadlineMs ?? Date.now() + config.timeoutMs;
	const output: PdfOcrPage[] = [];
	let firstError: string | null = null;
	let failedPages = 0;
	let processedPages = 0;
	let visitedPages = 0;
	let tempDirectory: string | undefined;
	try {
		tempDirectory = await mkdtemp(join(tmpdir(), 'mimin-pdf-ocr-'));
		for (const candidate of pagesToProcess) {
			visitedPages += 1;
			const remaining = deadline - Date.now();
			if (remaining <= 0 || options.signal?.aborted) {
				firstError ??= 'PDF_OCR_TIMEOUT';
				failedPages += 1;
				continue;
			}
			const imagePath = join(tempDirectory, `page-${candidate.page}.png`);
			try {
				const renderer = options.renderPage ?? renderOcrPage;
				const image = await renderer(document, candidate.page, config);
				const ocrRemaining = deadline - Date.now();
				if (ocrRemaining <= 0 || options.signal?.aborted) throw new Error('PDF_OCR_TIMEOUT');
				await writeFile(imagePath, image, { flag: 'wx' });
				const text = await (options.runOcr ?? runTesseract)(imagePath, {
					command: config.command,
					languages: config.languages,
					timeoutMs: Math.min(config.pageTimeoutMs, ocrRemaining),
					maxTextChars: config.maxTextChars,
					signal: options.signal
				});
				processedPages += 1;
				if (text) output.push({ page: candidate.page, text });
			} catch (error) {
				failedPages += 1;
				firstError ??= error instanceof Error ? ocrErrorCode(error) : 'PDF_OCR_FAILED';
				// An unavailable binary cannot recover on another page.
				if (firstError === 'PDF_OCR_UNAVAILABLE') break;
			} finally {
				await unlink(imagePath).catch(() => {});
			}
		}
	} catch (error) {
		firstError ??= error instanceof Error ? ocrErrorCode(error) : 'PDF_OCR_FAILED';
	} finally {
		if (tempDirectory) await rm(tempDirectory, { recursive: true, force: true }).catch(() => {});
		activeOcrJobs -= 1;
	}

	const status: PdfOcrStatus =
		firstError == null && skippedPages === 0
			? 'completed'
			: output.length || processedPages
				? 'partial'
				: firstError === 'PDF_OCR_UNAVAILABLE'
					? 'unavailable'
					: 'failed';
	return {
		status,
		pages: output,
		error: firstError,
		processedPages,
		skippedPages: candidates.length - visitedPages + failedPages
	};
}
