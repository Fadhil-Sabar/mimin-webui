import { getBrowserBridgeStatus, handleBrowserRequest } from './browser-bridge';
import type { CanvasConnection, CanvasDetail, StyleGuideline } from '$lib/canvas';

export type SseEvent = { type: string; [key: string]: unknown };

/**
 * Extract a readable message from errors returned by an SSE provider.
 *
 * Some providers return an HTTP status followed by a JSON error body, e.g.
 * `403: {"message":"MODEL_NOT_IN_PLAN: ..."}`. Keep the provider's useful
 * message while hiding the transport status and serialized implementation
 * details from the chat UI.
 */
export function extractSseErrorMessage(value: unknown, fallback = 'Agent error'): string {
	const seen = new Set<unknown>();

	function extract(input: unknown, depth = 0): string | undefined {
		if (depth > 5 || input == null) return undefined;
		if (typeof input === 'object' || typeof input === 'function') {
			if (seen.has(input)) return undefined;
			seen.add(input);
		}

		if (input instanceof Error) return extract(input.message, depth + 1);
		if (typeof input === 'object') {
			const record = input as Record<string, unknown>;
			return (
				extract(record.message, depth + 1) ??
				extract(record.error, depth + 1) ??
				extract(record.code, depth + 1)
			);
		}
		if (typeof input !== 'string') return undefined;

		const text = input.trim();
		if (!text) return undefined;

		// First parse a complete JSON value, then try the JSON object appended to
		// a status prefix such as `403: `.
		const parsed = tryParseJson(text);
		if (parsed !== undefined) {
			const parsedMessage = extract(parsed, depth + 1);
			if (parsedMessage) return parsedMessage;
		}

		const statusBody = text.match(/^\d{3}\s*:\s*(\{[\s\S]*\})$/)?.[1];
		if (statusBody) {
			const parsedBody = tryParseJson(statusBody);
			const bodyMessage = extract(parsedBody, depth + 1);
			if (bodyMessage) return bodyMessage;
			return statusBody;
		}

		return text.replace(/^\d{3}\s*:\s*/, '').trim() || undefined;
	}

	return extract(value) ?? fallback;
}

function tryParseJson(value: string): unknown | undefined {
	try {
		return JSON.parse(value);
	} catch {
		return undefined;
	}
}

export async function createConversation(
	input: {
		projectId?: string | null;
		model?: string;
		enabledTools?: string[];
		skillId?: string | null;
	} = {}
) {
	const response = await fetch('/api/conversations', {
		method: 'POST',
		headers: { 'content-type': 'application/json' },
		body: JSON.stringify(input)
	});
	if (!response.ok)
		throw new Error((await response.json()).error?.message ?? 'Could not create conversation');
	return (await response.json()).conversation;
}

export async function stopConversation(id: string, turnId?: string) {
	await fetch(`/api/conversations/${id}/stop`, {
		method: 'POST',
		headers: { 'content-type': 'application/json' },
		body: JSON.stringify({ turnId })
	});
}

export async function updateConversation(
	id: string,
	input: {
		title?: string;
		model?: string;
		enabledTools?: string[];
		skillId?: string | null;
	}
) {
	const response = await fetch(`/api/conversations/${id}`, {
		method: 'PATCH',
		headers: { 'content-type': 'application/json' },
		body: JSON.stringify(input)
	});
	if (!response.ok)
		throw new Error(
			(await response.json().catch(() => null))?.error?.message ?? 'Could not update conversation'
		);
	return (await response.json()).conversation;
}

export async function deleteConversation(id: string) {
	const response = await fetch(`/api/conversations/${id}`, {
		method: 'DELETE'
	});
	if (!response.ok)
		throw new Error(
			(await response.json().catch(() => null))?.error?.message ?? 'Could not delete conversation'
		);
}

export async function searchConversations(
	query: string,
	projectId?: string | null,
	signal?: AbortSignal
) {
	const params = new URLSearchParams({ q: query });
	if (projectId) params.set('projectId', projectId);
	const response = await fetch(`/api/conversations?${params.toString()}`, { signal });
	if (!response.ok) {
		throw new Error(
			(await response.json().catch(() => null))?.error?.message ?? 'Could not search conversations'
		);
	}
	const data = await response.json();
	return (data.conversations ?? []) as import('./conversations.svelte').ConversationSummary[];
}

export type ConversationPage<M> = {
	conversation: Record<string, unknown>;
	messages: M[];
	/** A further page of older messages exists. */
	hasMore: boolean;
	/** Pass back as `before` to load the messages immediately preceding this page. */
	olderCursor: string | null;
};

/**
 * Read one page of a conversation's transcript.
 *
 * The endpoint returns the *newest* messages by default, because that is what a
 * long conversation has to show on load; pass `before` (the previous page's
 * `olderCursor`) to walk backwards through older history.
 */
export async function fetchConversationPage<M = unknown>(
	id: string,
	options: { before?: string | null; limit?: number; signal?: AbortSignal } = {}
): Promise<ConversationPage<M>> {
	const params = new URLSearchParams();
	if (options.before) params.set('cursor', options.before);
	if (options.limit) params.set('limit', String(options.limit));
	const query = params.toString();
	const response = await fetch(`/api/conversations/${id}${query ? `?${query}` : ''}`, {
		signal: options.signal
	});
	if (!response.ok) {
		throw new Error(
			(await response.json().catch(() => null))?.error?.message ?? 'Could not load conversation'
		);
	}
	const data = await response.json();
	return {
		conversation: data.conversation ?? null,
		messages: (data.messages ?? []) as M[],
		hasMore: data.hasMore === true,
		olderCursor: typeof data.olderCursor === 'string' ? data.olderCursor : null
	};
}

export async function streamMessage(
	id: string,
	content: string,
	onEvent: (event: SseEvent) => void,
	signal?: AbortSignal,
	model?: string,
	files: File[] = [],
	onTurnId?: (turnId: string) => void
) {
	const bridge = await getBrowserBridgeStatus(signal);
	const body = files.length
		? (() => {
				const form = new FormData();
				form.set('content', content);
				if (model) form.set('model', model);
				for (const file of files) form.append('files', file, file.name);
				return form;
			})()
		: JSON.stringify({ content, ...(model ? { model } : {}) });
	const response = await fetch(`/api/conversations/${id}/messages`, {
		method: 'POST',
		headers: {
			...(!files.length ? { 'content-type': 'application/json' } : {}),
			accept: 'application/json',
			'x-client-request-id': clientRequestId(),
			...(bridge.connected ? { 'x-mimin-browser-bridge': '1' } : {})
		},
		body,
		signal
	});
	if (!response.ok)
		throw new Error(
			(await response.json().catch(() => null))?.error?.message ?? 'Could not send message'
		);
	if (response.headers.get('content-type')?.includes('text/event-stream') && response.body) {
		await consumeSseStream(response.body, onEvent, signal);
		return;
	}
	const { turnId } = (await response.json()) as { turnId: string };
	onTurnId?.(turnId);
	await subscribeTurnEvents(id, turnId, onEvent, signal);
}

/** Starts a turn before navigating to chat; the chat page attaches to its log. */
export async function startMessageTurn(
	id: string,
	content: string,
	model: string,
	files: File[] = []
) {
	const bridge = await getBrowserBridgeStatus();
	const body = files.length
		? (() => {
				const form = new FormData();
				form.set('content', content);
				form.set('model', model);
				for (const file of files) form.append('files', file, file.name);
				return form;
			})()
		: JSON.stringify({ content, model });
	const response = await fetch(`/api/conversations/${id}/messages`, {
		method: 'POST',
		headers: {
			...(!files.length ? { 'content-type': 'application/json' } : {}),
			accept: 'application/json',
			'x-client-request-id': clientRequestId(),
			...(bridge.connected ? { 'x-mimin-browser-bridge': '1' } : {})
		},
		body
	});
	if (!response.ok)
		throw new Error(
			(await response.json().catch(() => null))?.error?.message ?? 'Could not send message'
		);
	return (await response.json()) as { turnId: string; cursor: number };
}

export async function streamRetry(
	id: string,
	onEvent: (event: SseEvent) => void,
	signal?: AbortSignal,
	model?: string,
	onTurnId?: (turnId: string) => void
) {
	const bridge = await getBrowserBridgeStatus(signal);
	const response = await fetch(`/api/conversations/${id}/retry`, {
		method: 'POST',
		headers: {
			'content-type': 'application/json',
			accept: 'application/json',
			'x-client-request-id': clientRequestId(),
			...(bridge.connected ? { 'x-mimin-browser-bridge': '1' } : {})
		},
		body: JSON.stringify({ ...(model ? { model } : {}) }),
		signal
	});
	if (!response.ok)
		throw new Error(
			(await response.json().catch(() => null))?.error?.message ?? 'Could not retry message'
		);
	if (response.headers.get('content-type')?.includes('text/event-stream') && response.body) {
		await consumeSseStream(response.body, onEvent, signal);
		return;
	}
	const { turnId } = (await response.json()) as { turnId: string };
	onTurnId?.(turnId);
	await subscribeTurnEvents(id, turnId, onEvent, signal);
}

export async function streamEdit(
	id: string,
	messageId: string,
	content: string,
	historyRevision: number,
	onEvent: (event: SseEvent) => void,
	signal?: AbortSignal,
	model?: string,
	onTurnId?: (turnId: string) => void
) {
	const bridge = await getBrowserBridgeStatus(signal);
	const response = await fetch(`/api/conversations/${id}/edit`, {
		method: 'POST',
		headers: {
			'content-type': 'application/json',
			accept: 'application/json',
			'x-client-request-id': clientRequestId(),
			...(bridge.connected ? { 'x-mimin-browser-bridge': '1' } : {})
		},
		body: JSON.stringify({ messageId, content, historyRevision, ...(model ? { model } : {}) }),
		signal
	});
	if (!response.ok)
		throw new Error(
			(await response.json().catch(() => null))?.error?.message ?? 'Could not edit message'
		);
	const { turnId } = (await response.json()) as { turnId: string };
	onTurnId?.(turnId);
	await subscribeTurnEvents(id, turnId, onEvent, signal);
}

function clientRequestId() {
	if (typeof crypto.randomUUID === 'function') return crypto.randomUUID();
	const bytes = crypto.getRandomValues(new Uint8Array(16));
	bytes[6] = (bytes[6] & 0x0f) | 0x40;
	bytes[8] = (bytes[8] & 0x3f) | 0x80;
	const hex = Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('');
	return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}

export async function getActiveTurn(id: string, signal?: AbortSignal) {
	const response = await fetch(`/api/conversations/${id}/turns`, { signal });
	if (!response.ok) return null;
	const data = (await response.json()) as { turn?: { turnId: string; cursor: number } | null };
	return data.turn ?? null;
}

export async function subscribeTurnEvents(
	id: string,
	turnId: string,
	onEvent: (event: SseEvent) => void,
	signal?: AbortSignal,
	after = 0
) {
	let cursor = after;
	for (;;) {
		if (signal?.aborted) return;
		try {
			const response = await fetch(
				`/api/conversations/${id}/turns/${turnId}/events?after=${cursor}`,
				{
					headers: { accept: 'text/event-stream' },
					signal
				}
			);
			if (!response.ok || !response.body) throw new Error('Could not reconnect to generation');
			const result = await consumeSseStream(response.body, onEvent, signal, cursor);
			cursor = result.cursor;
			if (result.complete) return;
		} catch (error) {
			if (signal?.aborted) return;
			await new Promise((resolve) => setTimeout(resolve, 700));
			if (error instanceof Error && error.message === 'Could not reconnect to generation')
				throw error;
		}
	}
}

async function consumeSseStream(
	stream: ReadableStream<Uint8Array>,
	onEvent: (event: SseEvent) => void,
	signal?: AbortSignal,
	initialCursor = 0
) {
	const reader = stream.getReader();
	const decoder = new TextDecoder();
	let buffer = '';
	let cursor = initialCursor;
	let complete = false;
	async function dispatch(block: string) {
		const raw = block
			.split('\n')
			.find((line) => line.startsWith('data: '))
			?.slice(6);
		if (!raw) return;
		const id = Number(
			block
				.split('\n')
				.find((line) => line.startsWith('id: '))
				?.slice(4)
		);
		if (Number.isSafeInteger(id) && id > 0) {
			if (id <= cursor) return;
			cursor = id;
		}
		const event = JSON.parse(raw) as SseEvent;
		if (event.type === 'done' || event.type === 'error' || event.type === 'replay.unavailable')
			complete = true;
		if (event.type === 'browser.request') await handleBrowserRequest(event, signal);
		else onEvent(event);
	}
	try {
		while (true) {
			const { value, done } = await reader.read();
			if (done) break;
			buffer += decoder.decode(value, { stream: true });
			let boundary = buffer.indexOf('\n\n');
			while (boundary !== -1) {
				const block = buffer.slice(0, boundary);
				buffer = buffer.slice(boundary + 2);
				await dispatch(block);
				boundary = buffer.indexOf('\n\n');
			}
		}
		if (buffer.trim()) {
			await dispatch(buffer);
		}
	} finally {
		await reader.cancel().catch(() => {});
		reader.releaseLock();
	}
	return { cursor, complete };
}

export async function answerQuestion(
	conversationId: string,
	requestId: string,
	answers: Array<{
		questionIndex?: number;
		question?: string;
		selected?: string[];
		custom?: string;
	}>,
	skipped = false
) {
	const response = await fetch(`/api/conversations/${conversationId}/question`, {
		method: 'POST',
		headers: { 'content-type': 'application/json' },
		body: JSON.stringify({ requestId, answers, skipped })
	});
	if (!response.ok) {
		const err = await response.json().catch(() => ({}));
		throw new Error(err.error?.message ?? 'Failed to submit answer');
	}
	return (await response.json()) as { ok: boolean };
}

export type BrowserConsentDecision = 'once' | 'conversation' | 'deny';

/** Answer the first-use prompt that gates reading or interacting with the user's tabs. */
export async function answerBrowserConsent(
	conversationId: string,
	requestId: string,
	decision: BrowserConsentDecision
) {
	const response = await fetch(`/api/conversations/${conversationId}/browser-consent`, {
		method: 'POST',
		headers: { 'content-type': 'application/json' },
		body: JSON.stringify({ requestId, decision })
	});
	if (!response.ok) {
		const err = await response.json().catch(() => ({}));
		throw new Error(err.error?.message ?? 'Failed to submit browser permission');
	}
	return (await response.json()) as { ok: boolean; decision: BrowserConsentDecision };
}

/** Forget a conversation-scoped browser grant so the next access prompts again. */
export async function revokeBrowserConsent(conversationId: string) {
	const response = await fetch(`/api/conversations/${conversationId}/browser-consent`, {
		method: 'DELETE'
	});
	if (!response.ok) return false;
	const data = (await response.json().catch(() => null)) as { revoked?: boolean } | null;
	return Boolean(data?.revoked);
}

export async function fetchCanvas(canvasId: string) {
	const response = await fetch(`/api/canvases/${canvasId}`);
	if (!response.ok) {
		const err = await response.json().catch(() => ({}));
		throw new Error(err.error?.message ?? 'Failed to load canvas');
	}
	return (await response.json()).canvas;
}

export async function createCanvasApi(input: {
	title: string;
	description?: string;
	projectId?: string | null;
	conversationId?: string | null;
	styleGuideline?: StyleGuideline;
}) {
	const response = await fetch('/api/canvases', {
		method: 'POST',
		headers: { 'content-type': 'application/json' },
		body: JSON.stringify(input)
	});
	if (!response.ok) {
		const err = await response.json().catch(() => ({}));
		throw new Error(err.error?.message ?? 'Failed to create canvas');
	}
	return (await response.json()).canvas;
}

export async function updateCanvasApi(
	canvasId: string,
	input: {
		title?: string;
		description?: string;
		activeSceneId?: string | null;
		styleGuideline?: StyleGuideline;
	}
) {
	const response = await fetch(`/api/canvases/${canvasId}`, {
		method: 'PATCH',
		headers: { 'content-type': 'application/json' },
		body: JSON.stringify(input)
	});
	if (!response.ok) {
		const err = await response.json().catch(() => ({}));
		throw new Error(err.error?.message ?? 'Failed to update canvas');
	}
	return (await response.json()).canvas;
}

export async function addCanvasSceneApi(
	canvasId: string,
	scene: {
		name: string;
		viewport?: string;
		description?: string;
		positionX?: number;
		positionY?: number;
		html?: string;
		css?: string;
		js?: string;
	}
) {
	const response = await fetch(`/api/canvases/${canvasId}/scenes`, {
		method: 'POST',
		headers: { 'content-type': 'application/json' },
		body: JSON.stringify(scene)
	});
	if (!response.ok) {
		const err = await response.json().catch(() => ({}));
		throw new Error(err.error?.message ?? 'Failed to add scene');
	}
	return await response.json();
}

export async function updateCanvasSceneApi(
	canvasId: string,
	sceneId: string,
	updates: {
		name?: string;
		viewport?: string;
		description?: string;
		positionX?: number;
		positionY?: number;
		html?: string;
		css?: string;
		js?: string;
	}
) {
	const response = await fetch(`/api/canvases/${canvasId}/scenes/${sceneId}`, {
		method: 'PATCH',
		headers: { 'content-type': 'application/json' },
		body: JSON.stringify(updates)
	});
	if (!response.ok) {
		const err = await response.json().catch(() => ({}));
		throw new Error(err.error?.message ?? 'Failed to update scene');
	}
	return (await response.json()).canvas;
}

export async function deleteCanvasSceneApi(canvasId: string, sceneId: string) {
	const response = await fetch(`/api/canvases/${canvasId}/scenes/${sceneId}`, {
		method: 'DELETE'
	});
	if (!response.ok) {
		const err = await response.json().catch(() => ({}));
		throw new Error(err.error?.message ?? 'Failed to delete scene');
	}
	return (await response.json()).canvas;
}

export async function createCanvasConnectionApi(
	canvasId: string,
	connection: { sourceSceneId: string; targetSceneId: string }
): Promise<{ canvas: CanvasDetail; connection: CanvasConnection }> {
	const response = await fetch(`/api/canvases/${canvasId}/connections`, {
		method: 'POST',
		headers: { 'content-type': 'application/json' },
		body: JSON.stringify(connection)
	});
	if (!response.ok) {
		const err = await response.json().catch(() => ({}));
		throw new Error(err.error?.message ?? 'Failed to create connection');
	}
	return (await response.json()) as { canvas: CanvasDetail; connection: CanvasConnection };
}

export async function deleteCanvasConnectionApi(
	canvasId: string,
	connectionId: string
): Promise<CanvasDetail> {
	const response = await fetch(`/api/canvases/${canvasId}/connections/${connectionId}`, {
		method: 'DELETE'
	});
	if (!response.ok) {
		const err = await response.json().catch(() => ({}));
		throw new Error(err.error?.message ?? 'Failed to delete connection');
	}
	return (await response.json()).canvas;
}
