export type BrowserConsentDecision = 'once' | 'conversation' | 'deny';

/** What the agent wants to touch, shown to the user before access is granted. */
export type BrowserConsentSubject = {
	/** Bridge action the agent intends to run, e.g. `browser_read_tab`. */
	action: string;
	tabId?: string | number;
	url?: string;
	title?: string;
};

export type BrowserConsentContext = {
	userId: string;
	conversationId: string;
	turnToken: string;
};

export type BrowserConsentEvent = {
	type: 'browser.consent.request';
	requestId: string;
	conversationId: string;
	turnToken: string;
	action: string;
	tabId?: string | number;
	url?: string;
	title?: string;
	expiresInMs: number;
};

export type BrowserConsentOutcome = {
	granted: boolean;
	decision?: BrowserConsentDecision;
	reason?: 'timeout';
};

export const BROWSER_CONSENT_TIMEOUT_MS = 5 * 60 * 1000;
export const BROWSER_CONSENT_TTL_MS = 12 * 60 * 60 * 1000;
export const MAX_BROWSER_CONSENT_GRANTS = 512;

type PendingConsent = BrowserConsentContext & {
	requestId: string;
	resolve: (outcome: BrowserConsentOutcome) => void;
	reject: (error: Error) => void;
	timer: ReturnType<typeof setTimeout>;
	removeAbortListener?: () => void;
};

const pendingConsents = new Map<string, PendingConsent>();
/** Conversation-scoped grants. Cleared by TTL, explicit revoke, or server restart. */
const conversationGrants = new Map<string, number>();

function consentError(message: string) {
	return new Error(`BROWSER_CONSENT_${message}`);
}

function grantKey(userId: string, conversationId: string) {
	return `${userId}:${conversationId}`;
}

function clearPending(pending: PendingConsent) {
	clearTimeout(pending.timer);
	pending.removeAbortListener?.();
	pendingConsents.delete(pending.requestId);
}

function evictStaleGrants() {
	const now = Date.now();
	for (const [key, expiresAt] of conversationGrants) {
		if (expiresAt <= now) conversationGrants.delete(key);
	}
}

/** Remember that this conversation may access browser tabs without re-prompting. */
export function grantConversationBrowserConsent(userId: string, conversationId: string): void {
	evictStaleGrants();
	if (
		!conversationGrants.has(grantKey(userId, conversationId)) &&
		conversationGrants.size >= MAX_BROWSER_CONSENT_GRANTS
	) {
		const oldestKey = conversationGrants.keys().next().value as string | undefined;
		if (oldestKey) conversationGrants.delete(oldestKey);
	}
	conversationGrants.set(grantKey(userId, conversationId), Date.now() + BROWSER_CONSENT_TTL_MS);
}

export function hasConversationBrowserConsent(userId: string, conversationId: string): boolean {
	const expiresAt = conversationGrants.get(grantKey(userId, conversationId));
	if (!expiresAt) return false;
	if (expiresAt <= Date.now()) {
		conversationGrants.delete(grantKey(userId, conversationId));
		return false;
	}
	return true;
}

export function revokeConversationBrowserConsent(userId: string, conversationId: string): boolean {
	return conversationGrants.delete(grantKey(userId, conversationId));
}

export function clearAllBrowserConsentGrants(): void {
	conversationGrants.clear();
}

export function pendingBrowserConsentCount(): number {
	return pendingConsents.size;
}

/**
 * Ask the user to confirm browser tab access before the first use in a conversation.
 * Resolves immediately when the conversation already has a standing grant.
 * A decision of `once` authorizes only this call; `conversation` also stores a grant.
 * The caller supplies `requestId` (the tool call id) so the client can attach the
 * prompt to the tool call that is waiting on it.
 */
export function requestBrowserConsent(
	context: BrowserConsentContext,
	requestId: string,
	subject: BrowserConsentSubject,
	emit: (event: BrowserConsentEvent) => void,
	signal?: AbortSignal,
	timeoutMs = BROWSER_CONSENT_TIMEOUT_MS
): Promise<BrowserConsentOutcome> {
	if (hasConversationBrowserConsent(context.userId, context.conversationId)) {
		return Promise.resolve({ granted: true, decision: 'conversation' });
	}
	if (signal?.aborted) return Promise.reject(consentError('CANCELED'));

	return new Promise<BrowserConsentOutcome>((resolve, reject) => {
		const timer = setTimeout(() => {
			const current = pendingConsents.get(requestId);
			if (!current) return;
			clearPending(current);
			resolve({ granted: false, reason: 'timeout' });
		}, timeoutMs);

		const pending: PendingConsent = {
			...context,
			requestId,
			resolve: (outcome) => {
				clearPending(pending);
				resolve(outcome);
			},
			reject: (error) => {
				clearPending(pending);
				reject(error);
			},
			timer
		};
		pendingConsents.set(requestId, pending);

		if (signal) {
			const abort = () => {
				const current = pendingConsents.get(requestId);
				if (current) current.reject(consentError('CANCELED'));
			};
			signal.addEventListener('abort', abort, { once: true });
			pending.removeAbortListener = () => signal.removeEventListener('abort', abort);
		}

		try {
			emit({
				type: 'browser.consent.request',
				requestId,
				conversationId: context.conversationId,
				turnToken: context.turnToken,
				action: subject.action,
				tabId: subject.tabId,
				url: subject.url,
				title: subject.title,
				expiresInMs: timeoutMs
			});
		} catch (error) {
			const current = pendingConsents.get(requestId);
			if (current) current.reject(error instanceof Error ? error : consentError('DISPATCH_FAILED'));
		}
	});
}

/** Settle a pending consent prompt from the authenticated answer endpoint. */
export function resolveBrowserConsent(
	requestId: string,
	userId: string,
	decision: BrowserConsentDecision
): boolean {
	const pending = pendingConsents.get(requestId);
	if (!pending || pending.userId !== userId) return false;
	if (decision === 'conversation') {
		grantConversationBrowserConsent(pending.userId, pending.conversationId);
	}
	if (decision === 'deny') {
		pending.resolve({ granted: false, decision: 'deny' });
		return true;
	}
	pending.resolve({ granted: true, decision });
	return true;
}

export function cancelBrowserConsents(conversationId: string, turnToken?: string): number {
	let canceled = 0;
	for (const pending of [...pendingConsents.values()]) {
		if (
			pending.conversationId === conversationId &&
			(!turnToken || pending.turnToken === turnToken)
		) {
			pending.reject(consentError('CANCELED'));
			canceled += 1;
		}
	}
	return canceled;
}

export function clearAllBrowserConsentRequests(): void {
	for (const pending of [...pendingConsents.values()]) {
		pending.reject(consentError('CANCELED'));
	}
	pendingConsents.clear();
}

export function isBrowserConsentAbortError(error: unknown) {
	return error instanceof Error && /BROWSER_CONSENT_(CANCELED|TIMEOUT)/.test(error.message);
}
