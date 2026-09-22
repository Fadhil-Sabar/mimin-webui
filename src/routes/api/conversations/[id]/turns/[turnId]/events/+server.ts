import type { RequestHandler } from '@sveltejs/kit';
import { apiError, getOwnedConversation, requireUser } from '$lib/server/api';
import { getTurn, readTurnEvents, reconcileInterruptedTurn } from '$lib/server/ai/turn-events';

export const GET: RequestHandler = async (event) => {
	const user = await requireUser(event);
	if (!user) return apiError('UNAUTHORIZED', 'Authentication required.', 401);
	const conversationId = event.params.id;
	const turnId = event.params.turnId;
	if (!conversationId || !turnId || !(await getOwnedConversation(conversationId, user.id)))
		return apiError('CONVERSATION_NOT_FOUND', 'Conversation not found.', 404);
	if (!(await getTurn(conversationId, turnId)))
		return apiError('TURN_NOT_FOUND', 'Turn not found.', 404);
	const rawCursor =
		event.request.headers.get('last-event-id') ?? event.url.searchParams.get('after') ?? '0';
	let cursor = Number(rawCursor);
	if (!Number.isSafeInteger(cursor) || cursor < 0)
		return apiError('INVALID_CURSOR', 'Invalid event cursor.');
	const encoder = new TextEncoder();
	let closed = false;
	let cleanup = () => {};
	const stream = new ReadableStream<Uint8Array>({
		start(controller) {
			let polling = false;
			const send = (value: string) => {
				if (!closed) controller.enqueue(encoder.encode(value));
			};
			const poll = async () => {
				if (closed || polling) return;
				polling = true;
				try {
					const turn = await reconcileInterruptedTurn(conversationId, turnId);
					const rows = await readTurnEvents(turnId, cursor);
					for (const row of rows) {
						cursor = row.id;
						send(`id: ${row.id}\nevent: ${row.type}\ndata: ${JSON.stringify(row.data)}\n\n`);
					}
					if (turn?.status !== 'running' && rows.length < 200) {
						if (cursor === 0)
							send('event: replay.unavailable\ndata: {"type":"replay.unavailable"}\n\n');
						closed = true;
						clearInterval(timer);
						controller.close();
					} else if (!rows.length) send(': ping\n\n');
				} catch (error) {
					closed = true;
					clearInterval(timer);
					controller.error(error);
				} finally {
					polling = false;
				}
			};
			const timer = setInterval(() => void poll(), 700);
			cleanup = () => clearInterval(timer);
			void poll();
			event.request.signal.addEventListener(
				'abort',
				() => {
					closed = true;
					clearInterval(timer);
				},
				{ once: true }
			);
		},
		cancel() {
			closed = true;
			cleanup();
		}
	});
	return new Response(stream, {
		headers: {
			'Content-Type': 'text/event-stream',
			'Cache-Control': 'no-cache, no-transform',
			Connection: 'keep-alive'
		}
	});
};
