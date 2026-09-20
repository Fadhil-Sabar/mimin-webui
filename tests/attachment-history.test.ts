import { describe, expect, it } from 'vitest';
import {
	groupAttachmentsByMessage,
	toAgentMessages,
	withUntrustedAttachmentHeader
} from '../src/lib/server/ai/agent.service';

const ATTACHMENT_CONTEXT =
	'<attachment filename="a.pdf">\n[BEGIN UNTRUSTED ATTACHMENT CONTENT]\ntext\n[END UNTRUSTED ATTACHMENT CONTENT]\n</attachment>';

function textOf(message: unknown): string {
	const content = (message as { content: Array<{ type: string; text?: string }> }).content;
	return content.map((block) => block.text ?? '').join('\n');
}

describe('historical attachment context', () => {
	it('groups attachments by the message that carried them, newest first', () => {
		const attachments = [
			{ messageId: 'm1', filename: 'a.pdf' },
			{ messageId: 'm3', filename: 'c.pdf' },
			{ messageId: 'm1', filename: 'b.pdf' },
			{ messageId: 'm4', filename: 'current.pdf' }
		];

		expect(
			groupAttachmentsByMessage(attachments, 'm4').map(([id, rows]) => [id, rows.length])
		).toEqual([
			['m1', 2],
			['m3', 1]
		]);
	});

	it('skips attachments without a message and the current turn', () => {
		expect(
			groupAttachmentsByMessage(
				[{ messageId: null }, { messageId: undefined }, { messageId: 'now' }],
				'now'
			)
		).toEqual([]);
	});

	it('replays the file text inside the message that carried it', () => {
		const createdAt = new Date('2026-01-02T03:04:05.000Z');
		const messages = toAgentMessages(
			[{ id: 'u1', role: 'user', content: 'ringkas dokumen ini', createdAt }],
			new Map(),
			new Map([['u1', ATTACHMENT_CONTEXT]])
		);

		const text = textOf(messages[0]);
		expect(text.startsWith('ringkas dokumen ini')).toBe(true);
		expect(text).toContain(withUntrustedAttachmentHeader(ATTACHMENT_CONTEXT));
		expect(text).toContain('[BEGIN UNTRUSTED ATTACHMENT CONTENT]');
	});

	it('leaves messages without attachments exactly as stored', () => {
		const createdAt = new Date('2026-01-02T03:04:05.000Z');
		const messages = toAgentMessages(
			[{ id: 'u1', role: 'user', content: 'halo', createdAt }],
			new Map(),
			new Map([['other', ATTACHMENT_CONTEXT]])
		);

		expect(textOf(messages[0])).toBe('halo');
	});
});
