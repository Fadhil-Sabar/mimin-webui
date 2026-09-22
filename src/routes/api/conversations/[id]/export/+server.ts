import type { RequestHandler } from '@sveltejs/kit';
import { and, asc, eq, inArray, ne } from 'drizzle-orm';
import { getDb, schema } from '$lib/server/db/client';
import { apiError, getOwnedConversation, handleApiError, requireUser } from '$lib/server/api';
import { extractMessageText } from '$lib/server/conversations';
import { toPublicConversation, toPublicMessage } from '$lib/server/skill-runtime';

function safeFilename(title: string) {
	const value = title
		.normalize('NFKC')
		.replace(/[^a-zA-Z0-9._ -]+/g, '')
		.trim()
		.replace(/\s+/g, '-');
	return (value || 'conversation').slice(0, 80);
}

function markdownContent(content: unknown) {
	return extractMessageText(content).trim();
}

export const GET: RequestHandler = async (event) => {
	try {
		const user = await requireUser(event);
		if (!user) return apiError('UNAUTHORIZED', 'Authentication required.', 401);
		const conversationId = event.params.id;
		if (!conversationId) return apiError('CONVERSATION_NOT_FOUND', 'Conversation not found.', 404);
		const format = event.url.searchParams.get('format') ?? 'markdown';
		if (format !== 'markdown' && format !== 'json')
			return apiError('INVALID_FORMAT', 'Choose markdown or json.', 400);

		const conversation = await getOwnedConversation(conversationId, user.id);
		if (!conversation) return apiError('CONVERSATION_NOT_FOUND', 'Conversation not found.', 404);
		const db = getDb();
		const messages = await db
			.select()
			.from(schema.messages)
			.where(
				and(
					eq(schema.messages.conversationId, conversationId),
					ne(schema.messages.turnState, 'superseded')
				)
			)
			.orderBy(asc(schema.messages.createdAt), asc(schema.messages.id));
		const messageIds = messages.map((message) => message.id);
		const attachments = messageIds.length
			? await db
					.select({
						id: schema.messageAttachments.id,
						messageId: schema.messageAttachments.messageId,
						filename: schema.messageAttachments.filename,
						mimeType: schema.messageAttachments.mimeType,
						sizeBytes: schema.messageAttachments.sizeBytes,
						extractionStatus: schema.messageAttachments.extractionStatus,
						pageCount: schema.messageAttachments.pageCount,
						extractionError: schema.messageAttachments.extractionError
					})
					.from(schema.messageAttachments)
					.where(inArray(schema.messageAttachments.messageId, messageIds))
			: [];
		const attachmentsByMessage = new Map<string, Array<(typeof attachments)[number]>>();
		for (const attachment of attachments) {
			const current = attachmentsByMessage.get(attachment.messageId) ?? [];
			current.push(attachment);
			attachmentsByMessage.set(attachment.messageId, current);
		}
		const exportedMessages = messages.map((message) => ({
			...toPublicMessage(message),
			attachments: attachmentsByMessage.get(message.id) ?? []
		}));
		const publicConversation = toPublicConversation(conversation);
		const filename = safeFilename(conversation.title);

		if (format === 'json') {
			return new Response(
				JSON.stringify({ conversation: publicConversation, messages: exportedMessages }, null, 2),
				{
					headers: {
						'content-type': 'application/json; charset=utf-8',
						'content-disposition': `attachment; filename="${filename}.json"`
					}
				}
			);
		}

		const lines = [`# ${conversation.title}`, ''];
		for (const message of exportedMessages) {
			const role = message.role === 'user' ? 'User' : 'Assistant';
			lines.push(`## ${role}`, '', markdownContent(message.content));
			if (message.attachments.length) {
				lines.push('', 'Attachments:');
				for (const attachment of message.attachments)
					lines.push(
						`- ${attachment.filename} (${attachment.mimeType}, ${attachment.sizeBytes} bytes)`
					);
			}
			lines.push('');
		}
		return new Response(lines.join('\n'), {
			headers: {
				'content-type': 'text/markdown; charset=utf-8',
				'content-disposition': `attachment; filename="${filename}.md"`
			}
		});
	} catch (error) {
		return handleApiError(error);
	}
};
