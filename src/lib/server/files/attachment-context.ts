export type AttachmentContextFile = {
	filename: string;
	mimeType: string;
	storageKey: string;
	messageId?: string;
	extractedText?: string | null;
	extractionStatus?: string | null;
	extractionError?: string | null;
	pageCount?: number | null;
};

export const TEXT_ATTACHMENT_MIME_TYPES = new Set([
	'text/plain',
	'text/markdown',
	'application/json'
]);
export const MAX_ATTACHMENT_CONTEXT_CHARS = 300_000;

/** Builds bounded, explicitly untrusted context for the model without changing the user message. */
export async function buildAttachmentContext(
	attachments: AttachmentContextFile[],
	readFile: (storageKey: string) => Promise<Uint8Array>,
	maxChars = MAX_ATTACHMENT_CONTEXT_CHARS
) {
	let remaining = Math.max(0, maxChars);
	const sections: string[] = [];
	for (const attachment of attachments) {
		let content = '';
		if (remaining > 0 && attachment.extractedText != null) {
			content = attachment.extractedText.slice(0, remaining);
			remaining -= content.length;
		} else if (remaining > 0 && TEXT_ATTACHMENT_MIME_TYPES.has(attachment.mimeType)) {
			try {
				content = new TextDecoder()
					.decode(await readFile(attachment.storageKey))
					.slice(0, remaining);
				remaining -= content.length;
			} catch {
				content = '';
			}
		}
		const source = attachment.messageId ? ` from message ${attachment.messageId}` : '';
		const status = attachment.extractionStatus ? ` status="${attachment.extractionStatus}"` : '';
		const pageCount = attachment.pageCount ? ` pages="${attachment.pageCount}"` : '';
		const error = attachment.extractionError ? ` error="${attachment.extractionError}"` : '';
		sections.push(
			`<attachment filename="${attachment.filename}" mime="${attachment.mimeType}"${source}${status}${pageCount}${error}>\n` +
				'[BEGIN UNTRUSTED ATTACHMENT CONTENT]\n' +
				(content || '[File content is not available as plain text.]') +
				'\n[END UNTRUSTED ATTACHMENT CONTENT]\n</attachment>'
		);
	}
	return sections.join('\n\n');
}
