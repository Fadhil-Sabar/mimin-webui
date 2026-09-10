/**
 * Consent state shared by the chat page and the consent card.
 *
 * The streaming loop is the only writer: it attaches a pending prompt to the
 * tool call that is waiting on it, and records the user's answer once the
 * endpoint accepts it.
 */

export type ConsentDecision = 'once' | 'conversation' | 'deny';

export type ConsentState = {
	requestId: string;
	/** Bridge action the agent is waiting to run, e.g. `browser_read_tab`. */
	action?: string;
	tabId?: string | number;
	url?: string;
	title?: string;
	/** Set once the user answered. */
	decision?: ConsentDecision;
};

/** Minimal shape a message must expose to carry consent on its tool calls. */
export type ConsentCarrier = {
	toolCalls?: Array<{ toolCallId: string; consent?: ConsentState }>;
};

function readString(value: unknown): string | undefined {
	return typeof value === 'string' && value ? value : undefined;
}

function readTabId(value: unknown): string | number | undefined {
	if (typeof value === 'number' && Number.isFinite(value)) return value;
	return readString(value);
}

/**
 * Build the consent state from a `browser.consent.request` SSE event.
 * Returns null when the event carries no usable request id.
 */
export function consentFromEvent(event: Record<string, unknown>): ConsentState | null {
	const requestId = readString(event.requestId);
	if (!requestId) return null;
	return {
		requestId,
		action: readString(event.action),
		tabId: readTabId(event.tabId),
		url: readString(event.url),
		title: readString(event.title)
	};
}

/**
 * Attach consent to the tool call identified by `toolCallId`, leaving every
 * other message untouched. Returns the original array when nothing matched so
 * callers can skip a redundant state update.
 */
export function attachConsent<T extends ConsentCarrier>(
	messages: T[],
	toolCallId: string,
	consent: ConsentState
): T[] {
	let changed = false;
	const next = messages.map((message) => {
		if (!message.toolCalls?.some((call) => call.toolCallId === toolCallId)) return message;
		changed = true;
		return {
			...message,
			toolCalls: message.toolCalls.map((call) =>
				call.toolCallId === toolCallId ? { ...call, consent } : call
			)
		} as T;
	});
	return changed ? next : messages;
}

/** Record the user's decision on an already-attached consent state. */
export function applyConsentDecision<T extends ConsentCarrier>(
	messages: T[],
	toolCallId: string,
	decision: ConsentDecision
): T[] {
	const existing = messages
		.flatMap((message) => message.toolCalls ?? [])
		.find((call) => call.toolCallId === toolCallId)?.consent;
	if (!existing) return messages;
	return attachConsent(messages, toolCallId, { ...existing, decision });
}

/** True while the agent is still blocked on an unanswered prompt. */
export function isConsentPending(consent?: ConsentState): boolean {
	return Boolean(consent && !consent.decision);
}

/**
 * Prompts that arrived before the tool call they belong to.
 *
 * The server sends `browser.consent.request` from inside the tool, while
 * `tool.start` is emitted by the agent's event handler, which persists first and
 * is queued separately. Either frame can reach the browser first, so a prompt
 * must be held until its tool call exists instead of being dropped.
 */
export type ConsentBuffer = Record<string, ConsentState>;

/** Hold a prompt until the tool call it belongs to shows up. */
export function bufferConsent(buffer: ConsentBuffer, consent: ConsentState): ConsentBuffer {
	return { ...buffer, [consent.requestId]: consent };
}

/**
 * Attach an incoming prompt to its tool call, or hold it until that tool call
 * arrives. This is the entry point for `browser.consent.request` frames: the
 * prompt may legitimately be the first of the two frames to reach the browser.
 */
export function attachOrBufferConsent<T extends ConsentCarrier>(
	messages: T[],
	buffer: ConsentBuffer,
	consent: ConsentState
): { messages: T[]; buffer: ConsentBuffer } {
	const attached = attachConsent(messages, consent.requestId, consent);
	if (attached === messages) return { messages, buffer: bufferConsent(buffer, consent) };
	if (!buffer[consent.requestId]) return { messages: attached, buffer };
	const rest = { ...buffer };
	delete rest[consent.requestId];
	return { messages: attached, buffer: rest };
}

/**
 * Attach any buffered prompt that now has a matching tool call, keeping the
 * entries that are still waiting. Returns the original array and buffer when
 * nothing changed so callers can skip a redundant state update.
 */
export function flushConsentBuffer<T extends ConsentCarrier>(
	messages: T[],
	buffer: ConsentBuffer
): { messages: T[]; buffer: ConsentBuffer; attached: boolean } {
	let nextMessages = messages;
	const remaining: ConsentBuffer = {};
	let attached = false;
	for (const [requestId, consent] of Object.entries(buffer)) {
		const next = attachConsent(nextMessages, requestId, consent);
		if (next === nextMessages) remaining[requestId] = consent;
		else {
			nextMessages = next;
			attached = true;
		}
	}
	return { messages: nextMessages, buffer: remaining, attached };
}
