import { getBrowserBridgeStatus, handleBrowserRequest } from './browser-bridge';

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

export async function stopConversation(id: string) {
	await fetch(`/api/conversations/${id}/stop`, { method: 'POST' });
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

export async function streamMessage(
	id: string,
	content: string,
	onEvent: (event: SseEvent) => void,
	signal?: AbortSignal,
	model?: string,
	files: File[] = []
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
			accept: 'text/event-stream',
			...(bridge.connected ? { 'x-mimin-browser-bridge': '1' } : {})
		},
		body,
		signal
	});
	if (!response.ok || !response.body)
		throw new Error(
			(await response.json().catch(() => null))?.error?.message ?? 'Could not send message'
		);
	await consumeSseStream(response.body, onEvent, signal);
}

export async function streamRetry(
	id: string,
	onEvent: (event: SseEvent) => void,
	signal?: AbortSignal,
	model?: string
) {
	const bridge = await getBrowserBridgeStatus(signal);
	const response = await fetch(`/api/conversations/${id}/retry`, {
		method: 'POST',
		headers: {
			'content-type': 'application/json',
			accept: 'text/event-stream',
			...(bridge.connected ? { 'x-mimin-browser-bridge': '1' } : {})
		},
		body: JSON.stringify({ ...(model ? { model } : {}) }),
		signal
	});
	if (!response.ok || !response.body)
		throw new Error(
			(await response.json().catch(() => null))?.error?.message ?? 'Could not retry message'
		);
	await consumeSseStream(response.body, onEvent, signal);
}

async function consumeSseStream(
	stream: ReadableStream<Uint8Array>,
	onEvent: (event: SseEvent) => void,
	signal?: AbortSignal
) {
	const reader = stream.getReader();
	const decoder = new TextDecoder();
	let buffer = '';
	async function dispatch(raw: string) {
		const event = JSON.parse(raw) as SseEvent;
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
				const data = block.split('\n').find((line) => line.startsWith('data: '));
				if (data) await dispatch(data.slice(6));
				boundary = buffer.indexOf('\n\n');
			}
		}
		if (buffer.trim()) {
			const data = buffer.split('\n').find((line) => line.startsWith('data: '));
			if (data) await dispatch(data.slice(6));
		}
	} finally {
		await reader.cancel().catch(() => {});
		reader.releaseLock();
	}
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
