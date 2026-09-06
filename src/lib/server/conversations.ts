/**
 * Extract readable plain text from a message content field.
 * Handles strings, arrays of message parts (ignoring thinking parts), and nested objects.
 */
export function extractMessageText(content: unknown): string {
	if (typeof content === 'string') return content;
	if (Array.isArray(content)) {
		return content
			.filter((part) => {
				if (typeof part === 'string') return true;
				if (part && typeof part === 'object') {
					return (part as Record<string, unknown>).type !== 'thinking';
				}
				return false;
			})
			.map((part) => {
				if (typeof part === 'string') return part;
				if (part && typeof part === 'object') {
					const rec = part as Record<string, unknown>;
					if (typeof rec.text === 'string') return rec.text;
					if (typeof rec.content === 'string') return rec.content;
				}
				return '';
			})
			.filter(Boolean)
			.join(' ');
	}
	if (content && typeof content === 'object') {
		const rec = content as Record<string, unknown>;
		if (typeof rec.text === 'string') return rec.text;
		if (typeof rec.content === 'string') return rec.content;
	}
	return '';
}

/**
 * Extract a contextual snippet around a search query match in text.
 */
export function extractSnippet(text: string, query: string, maxLength = 120): string {
	const normalized = text.replace(/\s+/g, ' ').trim();
	if (!normalized) return '';
	if (!query) {
		return normalized.length > maxLength ? normalized.slice(0, maxLength) + '…' : normalized;
	}
	const lower = normalized.toLowerCase();
	const qLower = query.toLowerCase();
	const index = lower.indexOf(qLower);
	if (index === -1) {
		return normalized.length > maxLength ? normalized.slice(0, maxLength) + '…' : normalized;
	}
	const halfWindow = Math.floor((maxLength - query.length) / 2);
	const start = Math.max(0, index - halfWindow);
	const end = Math.min(normalized.length, start + maxLength);
	let snippet = normalized.slice(start, end);
	if (start > 0) snippet = '…' + snippet.trimStart();
	if (end < normalized.length) snippet = snippet.trimEnd() + '…';
	return snippet;
}
