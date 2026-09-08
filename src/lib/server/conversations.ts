import { Buffer } from 'node:buffer';

export type ConversationCursor = { updatedAt: Date; id: string };
export type MessageCursor = { createdAt: Date; id: string };

function encode(value: object) {
	return Buffer.from(JSON.stringify(value), 'utf8').toString('base64url');
}

function decode(value: string): Record<string, unknown> | null {
	try {
		const parsed: unknown = JSON.parse(Buffer.from(value, 'base64url').toString('utf8'));
		return parsed && typeof parsed === 'object' ? (parsed as Record<string, unknown>) : null;
	} catch {
		return null;
	}
}

function dateCursor(value: string, key: 'updatedAt' | 'createdAt', id: unknown) {
	const date = new Date(value);
	return !Number.isNaN(date.getTime()) && typeof id === 'string' && id
		? ({ [key]: date, id } as ConversationCursor | MessageCursor)
		: null;
}

export function encodeConversationCursor(cursor: ConversationCursor) {
	return encode({ updatedAt: cursor.updatedAt.toISOString(), id: cursor.id });
}

export function decodeConversationCursor(value: string): ConversationCursor | null {
	const parsed = decode(value);
	return parsed
		? (dateCursor(String(parsed.updatedAt), 'updatedAt', parsed.id) as ConversationCursor | null)
		: null;
}

export function encodeMessageCursor(cursor: MessageCursor) {
	return encode({ createdAt: cursor.createdAt.toISOString(), id: cursor.id });
}

export function decodeMessageCursor(value: string): MessageCursor | null {
	const parsed = decode(value);
	return parsed
		? (dateCursor(String(parsed.createdAt), 'createdAt', parsed.id) as MessageCursor | null)
		: null;
}

/** Extract readable plain text from a message content field. */
export function extractMessageText(content: unknown): string {
	if (typeof content === 'string') return content;
	if (Array.isArray(content)) {
		return content
			.filter((part) => {
				if (typeof part === 'string') return true;
				return Boolean(
					part && typeof part === 'object' && (part as Record<string, unknown>).type !== 'thinking'
				);
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

export function extractSnippet(text: string, query: string, maxLength = 120): string {
	const normalized = text.replace(/\s+/g, ' ').trim();
	if (!normalized) return '';
	if (!query)
		return normalized.length > maxLength ? normalized.slice(0, maxLength) + '…' : normalized;
	const index = normalized.toLowerCase().indexOf(query.toLowerCase());
	if (index === -1)
		return normalized.length > maxLength ? normalized.slice(0, maxLength) + '…' : normalized;
	const halfWindow = Math.floor((maxLength - query.length) / 2);
	const start = Math.max(0, index - halfWindow);
	const end = Math.min(normalized.length, start + maxLength);
	let snippet = normalized.slice(start, end);
	if (start > 0) snippet = '…' + snippet.trimStart();
	if (end < normalized.length) snippet = snippet.trimEnd() + '…';
	return snippet;
}
