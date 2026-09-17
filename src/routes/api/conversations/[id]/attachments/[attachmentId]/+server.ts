import type { RequestHandler } from '@sveltejs/kit';
import { and, eq } from 'drizzle-orm';
import { getDb, schema } from '$lib/server/db/client';
import { apiError, getOwnedConversation, handleApiError, requireUser } from '$lib/server/api';
import { readStoredFile, resolveStoragePath } from '$lib/server/files/storage';

export const GET: RequestHandler = async (event) => {
	try {
		const user = await requireUser(event);
		if (!user) return apiError('UNAUTHORIZED', 'Authentication required.', 401);
		const { id: conversationId, attachmentId } = event.params;
		if (!conversationId || !attachmentId)
			return apiError('ATTACHMENT_NOT_FOUND', 'Attachment not found.', 404);
		const db = getDb();
		if (!(await getOwnedConversation(conversationId, user.id)))
			return apiError('ATTACHMENT_NOT_FOUND', 'Attachment not found.', 404);
		// The join pins the attachment to this conversation, so an owned conversation
		// cannot be used to read another conversation's file.
		const [attachment] = await db
			.select({
				filename: schema.messageAttachments.filename,
				mimeType: schema.messageAttachments.mimeType,
				storageKey: schema.messageAttachments.storageKey
			})
			.from(schema.messageAttachments)
			.innerJoin(schema.messages, eq(schema.messageAttachments.messageId, schema.messages.id))
			.where(
				and(
					eq(schema.messageAttachments.id, attachmentId),
					eq(schema.messages.conversationId, conversationId)
				)
			);
		if (!attachment) return apiError('ATTACHMENT_NOT_FOUND', 'Attachment not found.', 404);
		try {
			resolveStoragePath(attachment.storageKey);
		} catch {
			return apiError('INVALID_FILE_PATH', 'Invalid file path.', 400);
		}
		let data: Buffer;
		try {
			data = await readStoredFile(attachment.storageKey);
		} catch (error) {
			if ((error as NodeJS.ErrnoException)?.code === 'ENOENT')
				return apiError('ATTACHMENT_NOT_FOUND', 'Attachment not found.', 404);
			throw error;
		}
		const body = new Uint8Array(data).slice().buffer;
		// `inline` lets the bubble render the image in place; `?download=1` saves it.
		const disposition = event.url.searchParams.get('download') === '1' ? 'attachment' : 'inline';
		return new Response(body, {
			headers: {
				'content-type': attachment.mimeType,
				'content-length': String(data.byteLength),
				'content-disposition': `${disposition}; filename*=UTF-8''${encodeURIComponent(attachment.filename)}`,
				'cache-control': 'private, no-store',
				'x-content-type-options': 'nosniff'
			}
		});
	} catch (error) {
		return handleApiError(error);
	}
};
