import type { RequestHandler } from '@sveltejs/kit';
import { eq } from 'drizzle-orm';
import { getDb, schema } from '$lib/server/db/client';
import { apiError, getOwnedConversation, handleApiError, requireUser } from '$lib/server/api';
import { isModelAvailable, listAvailableModels } from '$lib/server/ai/model.service';
import { messageInput } from '$lib/server/validation';
import { runConversationTurn, stopConversation } from '$lib/server/ai/agent.service';

function sse(event: string, data: unknown) {
	return `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`;
}

export const POST: RequestHandler = async (event) => {
	try {
		const user = await requireUser(event);
		if (!user) return apiError('UNAUTHORIZED', 'Authentication required.', 401);
		const conversationId = event.params.id;
		if (!conversationId) return apiError('CONVERSATION_NOT_FOUND', 'Conversation not found.', 404);
		const parsed = messageInput.safeParse(await event.request.json());
		if (!parsed.success) return apiError('INVALID_INPUT', 'Message content is required.');
		const db = getDb();
		const conversation = await getOwnedConversation(conversationId, user.id);
		if (!conversation) return apiError('CONVERSATION_NOT_FOUND', 'Conversation not found.', 404);

		let modelToUse = parsed.data.model ?? conversation.model;
		if (!(await isModelAvailable(user.id, modelToUse))) {
			const available = await listAvailableModels(user.id);
			if (available.length > 0) {
				const preferred = available.find((m) => `${m.provider}/${m.id}` === 'openai/gpt-4o-mini');
				const fallback = preferred ?? available[0];
				modelToUse = `${fallback.provider}/${fallback.id}`;
				await db
					.update(schema.conversations)
					.set({ model: modelToUse, updatedAt: new Date() })
					.where(eq(schema.conversations.id, conversationId));
			} else {
				return apiError('MODEL_NOT_AVAILABLE', 'No configured models are available.');
			}
		}

		const [userMessage] = await db
			.insert(schema.messages)
			.values({ conversationId, role: 'user', content: parsed.data.content })
			.returning();
		if (conversation.title === 'New conversation')
			await db
				.update(schema.conversations)
				.set({ title: parsed.data.content.slice(0, 60), updatedAt: new Date() })
				.where(eq(schema.conversations.id, conversationId));

		const encoder = new TextEncoder();
		let controller: ReadableStreamDefaultController<Uint8Array> | undefined;
		const stream = new ReadableStream<Uint8Array>({
			start(c) {
				controller = c;
			},
			cancel() {
				controller = undefined;
				stopConversation(conversationId);
			}
		});
		const send = (event: string, data: unknown) => {
			if (!controller) return;
			try {
				controller.enqueue(encoder.encode(sse(event, data)));
			} catch {
				/* stream closed */
			}
		};
		const close = () => {
			if (controller) {
				try {
					controller.close();
				} catch {
					/* already closed */
				}
				controller = undefined;
			}
		};

		void (async () => {
			try {
				send('message.start', {
					type: 'message.start',
					messageId: userMessage.id,
					role: 'user',
					content: parsed.data.content
				});
				await runConversationTurn(
					conversationId,
					parsed.data.model,
					parsed.data.content,
					(event) => send(event.type, event),
					user.id
				);
				send('done', { type: 'done' });
			} catch (error) {
				const code = error instanceof Error ? error.message : 'INTERNAL_ERROR';
				const message =
					code === 'MODEL_NOT_AVAILABLE'
						? 'Selected model is not available.'
						: code === 'PROVIDER_NOT_CONFIGURED'
							? 'This provider is not configured on the server.'
							: code === 'CONVERSATION_NOT_FOUND'
								? 'Conversation not found.'
								: error instanceof Error
									? error.message
									: 'The agent could not complete this turn.';
				send('error', { type: 'error', error: { code, message } });
			} finally {
				close();
			}
		})();

		return new Response(stream, {
			headers: {
				'Content-Type': 'text/event-stream',
				'Cache-Control': 'no-cache, no-transform',
				Connection: 'keep-alive'
			}
		});
	} catch (error) {
		return handleApiError(error);
	}
};
