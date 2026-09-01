import { json } from '@sveltejs/kit';
import type { RequestHandler } from '@sveltejs/kit';
import { eq } from 'drizzle-orm';
import { getDb, schema } from '$lib/server/db/client';
import { apiError, handleApiError } from '$lib/server/api';
import { messageInput } from '$lib/server/validation';
import { runConversationTurn } from '$lib/server/ai/agent.service';

function sse(event: string, data: unknown) { return `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`; }
export const POST: RequestHandler = async ({ params, request }) => {
	try {
		const conversationId = params.id;
		if (!conversationId) return apiError('CONVERSATION_NOT_FOUND', 'Conversation not found.', 404);
		const parsed = messageInput.safeParse(await request.json());
		if (!parsed.success) return apiError('INVALID_INPUT', 'Message content is required.');
		const db = getDb();
		const [conversation] = await db.select().from(schema.conversations).where(eq(schema.conversations.id, conversationId));
		if (!conversation) return apiError('CONVERSATION_NOT_FOUND', 'Conversation not found.', 404);
		const [userMessage] = await db.insert(schema.messages).values({ conversationId, role: 'user', content: parsed.data.content }).returning();
		if (conversation.title === 'New conversation') await db.update(schema.conversations).set({ title: parsed.data.content.slice(0, 60), updatedAt: new Date() }).where(eq(schema.conversations.id, conversationId));
		const stream = new TransformStream<Uint8Array, Uint8Array>();
		const writer = stream.writable.getWriter(); const encoder = new TextEncoder();
		const send = (event: string, data: unknown) => writer.write(encoder.encode(sse(event, data)));
		void (async () => {
			try {
				await send('message.start', { type: 'message.start', messageId: userMessage.id, role: 'user', content: parsed.data.content });
				await runConversationTurn(conversationId, parsed.data.model, parsed.data.content, (event) => { void send(event.type, event); });
				await send('done', { type: 'done' });
			} catch (error) {
				const code = error instanceof Error ? error.message : 'INTERNAL_ERROR';
				const message = code === 'MODEL_NOT_AVAILABLE' ? 'Selected model is not available.' : code === 'PROVIDER_NOT_CONFIGURED' ? 'This provider is not configured on the server.' : code === 'CONVERSATION_NOT_FOUND' ? 'Conversation not found.' : 'The agent could not complete this turn.';
				await send('error', { type: 'error', error: { code, message } });
			} finally { await writer.close(); }
		})();
		return new Response(stream.readable, { headers: { 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-cache, no-transform', Connection: 'keep-alive' } });
	} catch (error) { return handleApiError(error); }
};
