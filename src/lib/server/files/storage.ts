import { mkdir, readFile, unlink, writeFile } from 'node:fs/promises';
import { basename, isAbsolute, relative, resolve } from 'node:path';
import { env } from '$env/dynamic/private';
import { randomUUID } from 'node:crypto';
import { extractPdfFile, hasPdfMagicBytes, type PdfExtractionResult } from './pdf-extraction';

const allowed = new Map([
	['.txt', 'text/plain'],
	['.md', 'text/markdown'],
	['.json', 'application/json'],
	['.pdf', 'application/pdf']
]);
export const MAX_FILE_SIZE = 25 * 1024 * 1024;
export const MAX_EXTRACTED_TEXT_CHARS = 500_000;
export function isSafeStorageKey(storageKey: string) {
	return !(
		!storageKey ||
		isAbsolute(storageKey) ||
		storageKey.startsWith('/') ||
		storageKey.startsWith('\\') ||
		/^[a-zA-Z]:[\\/]/.test(storageKey) ||
		storageKey.split(/[\\/]+/).includes('..')
	);
}
export function resolveStoragePath(storageKey: string) {
	if (!isSafeStorageKey(storageKey)) throw new Error('INVALID_STORAGE_KEY');
	const root = resolve(env.STORAGE_PATH || './data/uploads');
	const candidate = resolve(root, storageKey);
	const relativePath = relative(root, candidate);
	if (
		!relativePath ||
		relativePath === '..' ||
		relativePath.startsWith(`..${process.platform === 'win32' ? '\\' : '/'}`) ||
		isAbsolute(relativePath)
	)
		throw new Error('INVALID_STORAGE_KEY');
	return candidate;
}
export function validateFilename(filename: string) {
	const clean = basename(filename).replace(/[^a-zA-Z0-9._-]/g, '_');
	const ext = clean.slice(clean.lastIndexOf('.')).toLowerCase();
	if (!clean || !allowed.has(ext)) throw new Error('UNSUPPORTED_FILE');
	return { filename: clean, ext, mimeType: allowed.get(ext)! };
}

export async function saveUploadedFile(scope: string, file: File) {
	if (file.size > MAX_FILE_SIZE) throw new Error('FILE_TOO_LARGE');
	const info = validateFilename(file.name);
	if (info.mimeType === 'application/pdf') {
		const header = new Uint8Array(await file.slice(0, 5).arrayBuffer());
		if (!hasPdfMagicBytes(header)) throw new Error('INVALID_PDF');
	}
	const key = `${scope}/${randomUUID()}${info.ext}`;
	const destination = resolveStoragePath(key);
	await mkdir(resolveStoragePath(scope), { recursive: true });
	try {
		await writeFile(destination, Buffer.from(await file.arrayBuffer()), { flag: 'wx' });
	} catch (error) {
		await unlink(destination).catch(() => {});
		throw error;
	}
	return { ...info, sizeBytes: file.size, storageKey: key };
}

export async function saveProjectFile(projectId: string, file: File) {
	return saveUploadedFile(projectId, file);
}

export type UploadedFileExtraction = {
	extractedText: string | null;
	extractionStatus: PdfExtractionResult['status'] | 'not_started';
	pageCount: number | null;
	extractionError: string | null;
};

export async function extractUploadedFile(file: File): Promise<UploadedFileExtraction> {
	const info = validateFilename(file.name);
	if (info.mimeType === 'application/pdf') {
		const result = await extractPdfFile(file);
		return {
			extractedText: result.text || null,
			extractionStatus: result.status,
			pageCount: result.pageCount,
			extractionError: result.error
		};
	}
	const text = await file.text();
	const truncated = text.length > MAX_EXTRACTED_TEXT_CHARS;
	const extractedText = text.slice(0, MAX_EXTRACTED_TEXT_CHARS);
	return {
		extractedText: extractedText || null,
		extractionStatus: extractedText ? (truncated ? 'truncated' : 'extracted') : 'empty',
		pageCount: null,
		extractionError: null
	};
}

export async function readStoredFile(storageKey: string) {
	return readFile(resolveStoragePath(storageKey));
}

export async function cleanupStoredFiles(storageKeys: string[]) {
	await Promise.allSettled(
		storageKeys.map(async (storageKey) => {
			try {
				await unlink(resolveStoragePath(storageKey));
			} catch {
				/* The file may already have been removed. */
			}
		})
	);
}

export async function extractText(file: File) {
	return (await extractUploadedFile(file)).extractedText ?? '';
}

export function chunkText(text: string, chunkSize = 1200) {
	const normalized = text.replace(/\r\n/g, '\n').trim();
	const chunks: string[] = [];
	for (let i = 0; i < normalized.length; i += chunkSize)
		chunks.push(normalized.slice(i, i + chunkSize));
	return chunks;
}
