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
