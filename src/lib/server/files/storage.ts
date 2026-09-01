import { mkdir, writeFile } from 'node:fs/promises';
import { basename, join } from 'node:path';
import { env } from '$env/dynamic/private';
import { randomUUID } from 'node:crypto';

const allowed = new Map([['.txt', 'text/plain'], ['.md', 'text/markdown'], ['.json', 'application/json'], ['.pdf', 'application/pdf']]);
export const MAX_FILE_SIZE = 25 * 1024 * 1024;
export function validateFilename(filename: string) { const clean = basename(filename).replace(/[^a-zA-Z0-9._-]/g, '_'); const ext = clean.slice(clean.lastIndexOf('.')).toLowerCase(); if (!clean || !allowed.has(ext)) throw new Error('UNSUPPORTED_FILE'); return { filename: clean, ext, mimeType: allowed.get(ext)! }; }
export async function saveProjectFile(projectId: string, file: File) { if (file.size > MAX_FILE_SIZE) throw new Error('FILE_TOO_LARGE'); const info = validateFilename(file.name); const storageRoot = env.STORAGE_PATH || './data/uploads'; const key = `${projectId}/${randomUUID()}${info.ext}`; const destination = join(storageRoot, key); await mkdir(join(storageRoot, projectId), { recursive: true }); await writeFile(destination, Buffer.from(await file.arrayBuffer()), { flag: 'wx' }); return { ...info, sizeBytes: file.size, storageKey: key }; }
export async function extractText(file: File) { if (!['text/plain', 'text/markdown', 'application/json'].includes(file.type)) return ''; return await file.text(); }
export function chunkText(text: string, chunkSize = 1200) { const normalized = text.replace(/\r\n/g, '\n').trim(); const chunks: string[] = []; for (let i = 0; i < normalized.length; i += chunkSize) chunks.push(normalized.slice(i, i + chunkSize)); return chunks; }
