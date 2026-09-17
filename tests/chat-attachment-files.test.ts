import { describe, expect, it } from 'vitest';
import {
	isImageAttachment,
	isImageFile,
	normalizeAttachmentFile
} from '../src/routes/(app)/chat/chat-format';

function makeFile(name: string, type: string, bytes = 4) {
	return new File([new Uint8Array(bytes)], name, { type });
}

describe('chat attachment file handling', () => {
	it('detects images from mime type or extension', () => {
		expect(isImageFile(makeFile('diagram.png', 'image/png'))).toBe(true);
		expect(isImageFile(makeFile('photo.jpeg', ''))).toBe(true);
		expect(isImageFile(makeFile('notes.md', 'text/markdown'))).toBe(false);
		expect(isImageAttachment({ mimeType: 'image/gif' })).toBe(true);
		expect(isImageAttachment({ filename: 'shot.webp' })).toBe(true);
		expect(isImageAttachment({ mimeType: 'application/pdf', filename: 'report.pdf' })).toBe(false);
	});

	it('names a pasted image blob after its mime type so the upload route accepts it', () => {
		const pasted = makeFile('', 'image/png');
		const normalized = normalizeAttachmentFile(pasted);

		expect(normalized).not.toBeNull();
		expect(normalized?.name).toMatch(/^pasted-[a-z0-9]+\.png$/);
		expect(normalized?.type).toBe('image/png');
	});

	it('keeps a usable filename when the picked image already has one', () => {
		const picked = makeFile('screenshot.jpg', 'image/jpeg');
		expect(normalizeAttachmentFile(picked)).toBe(picked);
	});

	it('rejects files the endpoint would not accept', () => {
		expect(normalizeAttachmentFile(makeFile('archive.zip', 'application/zip'))).toBeNull();
		expect(normalizeAttachmentFile(makeFile('script.exe', 'image/png'))).not.toBeNull();
		expect(normalizeAttachmentFile(makeFile('notes.txt', 'text/plain'))).not.toBeNull();
	});
});
