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

/**
 * Builds bounded, explicitly untrusted context for the model without changing the user message.
 *
 * Callers pass the attachments in priority order — the current turn's files first, then
 * the newest earlier files — because the character budget is consumed in that order.
 */
export async function buildAttachmentContext(
	attachments: AttachmentContextFile[],
	readFile: (storageKey: string) => Promise<Uint8Array>,
	maxChars = MAX_ATTACHMENT_CONTEXT_CHARS
) {
	let remaining = Math.max(0, Math.min(maxChars, MAX_ATTACHMENT_CONTEXT_CHARS));
	const sections: string[] = [];
	for (const attachment of attachments) {
		let content = '';
		let omittedForBudget = false;
		if (remaining <= 0) {
			omittedForBudget = true;
		} else if (attachment.extractedText != null) {
			content = attachment.extractedText.slice(0, remaining);
			remaining -= content.length;
		} else if (TEXT_ATTACHMENT_MIME_TYPES.has(attachment.mimeType)) {
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
		const omitted = omittedForBudget ? ' omitted="budget"' : '';
		sections.push(
			`<attachment filename="${attachment.filename}" mime="${attachment.mimeType}"${source}${status}${pageCount}${error}${omitted}>\n` +
				'[BEGIN UNTRUSTED ATTACHMENT CONTENT]\n' +
				(content ||
					(omittedForBudget
						? '[File content omitted: the attachment budget was already used by more recent files.]'
						: '[File content is not available as plain text.]')) +
				'\n[END UNTRUSTED ATTACHMENT CONTENT]\n</attachment>'
		);
	}
	return sections.join('\n\n');
}
