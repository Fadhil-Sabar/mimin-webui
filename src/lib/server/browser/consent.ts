import { and, eq, lt } from 'drizzle-orm';
import { getDb, schema } from '$lib/server/db/client';

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
/** How often a pending prompt checks the shared row for an answer or cancel from another instance. */
export const PENDING_TURN_POLL_MS = 500;
/** Local mirror window for a shared grant row; the row itself stays authoritative. */
const GRANT_CACHE_MS = 15_000;

type PendingConsent = BrowserConsentContext & {
	requestId: string;
	resolve: (outcome: BrowserConsentOutcome) => void;
	reject: (error: Error) => void;
	timer: ReturnType<typeof setTimeout>;
	poll?: ReturnType<typeof setInterval>;
	removeAbortListener?: () => void;
};

/** Local mirror of `browser_consent_grants`; capped so a remote revoke lands quickly. */
const conversationGrants = new Map<string, number>();

function consentError(message: string) {
	return new Error(`BROWSER_CONSENT_${message}`);
}

function grantKey(userId: string, conversationId: string) {
	return `${userId}:${conversationId}`;
}

function clearPending(pending: PendingConsent) {
	clearTimeout(pending.timer);
	if (pending.poll) clearInterval(pending.poll);
	pending.removeAbortListener?.();
	pendingConsents.delete(pending.requestId);
}

function evictStaleGrants() {
	const now = Date.now();
	for (const [key, expiresAt] of conversationGrants) {
		if (expiresAt <= now) conversationGrants.delete(key);
	}
}

function setLocalGrant(userId: string, conversationId: string) {
	evictStaleGrants();
	const key = grantKey(userId, conversationId);
	if (!conversationGrants.has(key) && conversationGrants.size >= MAX_BROWSER_CONSENT_GRANTS) {
		const oldestKey = conversationGrants.keys().next().value as string | undefined;
		if (oldestKey) conversationGrants.delete(oldestKey);
	}
	conversationGrants.set(key, Date.now() + GRANT_CACHE_MS);
}

async function persistGrant(userId: string, conversationId: string) {
	try {
		const db = getDb();
		const now = new Date();
		await db
			.delete(schema.browserConsentGrants)
			.where(lt(schema.browserConsentGrants.expiresAt, now));
		const expiresAt = new Date(Date.now() + BROWSER_CONSENT_TTL_MS);
		await db
			.insert(schema.browserConsentGrants)
			.values({ userId, conversationId, expiresAt })
			.onConflictDoUpdate({
				target: [schema.browserConsentGrants.userId, schema.browserConsentGrants.conversationId],
				set: { expiresAt }
			});
	} catch {
		// Shared grant unavailable: the local mirror still serves this instance.
	}
}

/** Remember that this conversation may access browser tabs without re-prompting. */
export function grantConversationBrowserConsent(userId: string, conversationId: string): void {
	setLocalGrant(userId, conversationId);
	void persistGrant(userId, conversationId);
}

/** True when this instance holds a fresh mirror of the grant. */
export function hasConversationBrowserConsent(userId: string, conversationId: string): boolean {
	const expiresAt = conversationGrants.get(grantKey(userId, conversationId));
	if (!expiresAt) return false;
	if (expiresAt <= Date.now()) {
		conversationGrants.delete(grantKey(userId, conversationId));
		return false;
	}
	return true;
}

/** Authoritative grant check used when the local mirror misses; refreshes the mirror. */
async function hasSharedBrowserConsent(userId: string, conversationId: string): Promise<boolean> {
	try {
		const db = getDb();
		const [row] = await db
			.select({ expiresAt: schema.browserConsentGrants.expiresAt })
			.from(schema.browserConsentGrants)
			.where(
				and(
					eq(schema.browserConsentGrants.userId, userId),
					eq(schema.browserConsentGrants.conversationId, conversationId)
				)
			);
		if (!row || row.expiresAt.getTime() <= Date.now()) return false;
		setLocalGrant(userId, conversationId);
		return true;
	} catch {
		return false;
	}
}

export async function revokeConversationBrowserConsent(
	userId: string,
	conversationId: string
): Promise<boolean> {
	const local = conversationGrants.delete(grantKey(userId, conversationId));
	let deleted = false;
	try {
		const db = getDb();
		const rows = await db
			.delete(schema.browserConsentGrants)
			.where(
				and(
					eq(schema.browserConsentGrants.userId, userId),
					eq(schema.browserConsentGrants.conversationId, conversationId)
				)
			)
			.returning({ conversationId: schema.browserConsentGrants.conversationId });
		deleted = rows.length > 0;
	} catch {
		// Local mirror already reflected the revoke.
	}
	return local || deleted;
}

export function clearAllBrowserConsentGrants(): void {
	conversationGrants.clear();
	try {
		void getDb()
			.delete(schema.browserConsentGrants)
			.then(
				() => {},
				() => {}
			);
	} catch {
		// Tests run without a database.
	}
}

export function pendingBrowserConsentCount(): number {
	return pendingConsents.size;
}

const pendingConsents = new Map<string, PendingConsent>();

async function insertPendingConsentRow(
	context: BrowserConsentContext,
	requestId: string,
	timeoutMs: number
) {
	try {
		const db = getDb();
		// Opportunistic sweep so prompts whose waiter died do not accumulate.
		await db
			.delete(schema.pendingTurnRequests)
			.where(lt(schema.pendingTurnRequests.expiresAt, new Date()));
		await db.insert(schema.pendingTurnRequests).values({
			requestId,
			kind: 'browser_consent',
			conversationId: context.conversationId,
			userId: context.userId,
			turnToken: context.turnToken,
			expiresAt: new Date(Date.now() + timeoutMs)
		});
	} catch {
		// Without the shared row, answers are limited to this instance.
	}
}

async function markPendingConsentRow(requestId: string, status: string, answer?: unknown) {
	try {
		const db = getDb();
		await db
			.update(schema.pendingTurnRequests)
			.set({ status, answer: answer ?? null, updatedAt: new Date() })
			.where(eq(schema.pendingTurnRequests.requestId, requestId));
	} catch {
		// Best effort; the waiter also settles from the local promise.
	}
}

/**
 * Ask the user to confirm browser tab access before the first use in a conversation.
 * Resolves immediately when the conversation already has a standing grant (local
 * mirror first, then the shared row when the prompt has to be shown).
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

		// Shared-row handoff: a grant recorded on another instance skips the prompt,
		// and an answer/cancel recorded elsewhere settles this waiter by polling.
		void hasSharedBrowserConsent(context.userId, context.conversationId).then((granted) => {
			if (!granted) return;
			const current = pendingConsents.get(requestId);
			if (current) current.resolve({ granted: true, decision: 'conversation' });
		});
		void insertPendingConsentRow(context, requestId, timeoutMs);
		// The emit above may have already failed the prompt; do not leak a poller.
		if (pendingConsents.get(requestId) !== pending) return;
		pending.poll = setInterval(() => {
			void (async () => {
				try {
					const db = getDb();
					const [row] = await db
						.select({
							status: schema.pendingTurnRequests.status,
							answer: schema.pendingTurnRequests.answer
						})
						.from(schema.pendingTurnRequests)
						.where(eq(schema.pendingTurnRequests.requestId, requestId));
					const current = pendingConsents.get(requestId);
					if (!current || !row) return;
					if (row.status === 'canceled') {
						current.reject(consentError('CANCELED'));
						return;
					}
					if (row.status === 'answered') {
						const decision = (row.answer as { decision?: BrowserConsentDecision } | null)?.decision;
						if (decision === 'deny') current.resolve({ granted: false, decision: 'deny' });
						else current.resolve({ granted: true, decision: decision ?? 'once' });
					}
				} catch {
					// Shared row unavailable; the local promise and timeout still apply.
				}
			})();
		}, PENDING_TURN_POLL_MS);
	});
}

/**
 * Settle a pending consent prompt from the authenticated answer endpoint.
 * When the waiter lives on another instance, the decision is recorded on the
 * shared row instead and picked up by that instance's poll.
 */
export async function resolveBrowserConsent(
	requestId: string,
	userId: string,
	decision: BrowserConsentDecision
): Promise<boolean> {
	const pending = pendingConsents.get(requestId);
	if (pending && pending.userId === userId) {
		if (decision === 'conversation') {
			grantConversationBrowserConsent(pending.userId, pending.conversationId);
		}
		void markPendingConsentRow(requestId, 'answered', { decision });
		if (decision === 'deny') pending.resolve({ granted: false, decision: 'deny' });
		else pending.resolve({ granted: true, decision });
		return true;
	}
	try {
		const db = getDb();
		const [row] = await db
			.update(schema.pendingTurnRequests)
			.set({ status: 'answered', answer: { decision }, updatedAt: new Date() })
			.where(
				and(
					eq(schema.pendingTurnRequests.requestId, requestId),
					eq(schema.pendingTurnRequests.userId, userId),
					eq(schema.pendingTurnRequests.kind, 'browser_consent'),
					eq(schema.pendingTurnRequests.status, 'pending')
				)
			)
			.returning({ conversationId: schema.pendingTurnRequests.conversationId });
		if (!row) return false;
		if (decision === 'conversation') {
			grantConversationBrowserConsent(userId, row.conversationId);
		}
		return true;
	} catch {
		return false;
	}
}

export async function cancelBrowserConsents(
	conversationId: string,
	turnToken?: string
): Promise<number> {
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
	try {
		const db = getDb();
		await db
			.update(schema.pendingTurnRequests)
			.set({ status: 'canceled', updatedAt: new Date() })
			.where(
				and(
					eq(schema.pendingTurnRequests.conversationId, conversationId),
					eq(schema.pendingTurnRequests.kind, 'browser_consent'),
					eq(schema.pendingTurnRequests.status, 'pending'),
					turnToken ? eq(schema.pendingTurnRequests.turnToken, turnToken) : undefined
				)
			);
	} catch {
		// Local waiters were rejected above; shared rows expire on their own.
	}
	return canceled;
}

export function clearAllBrowserConsentRequests(): void {
	for (const pending of [...pendingConsents.values()]) {
		pending.reject(consentError('CANCELED'));
	}
	pendingConsents.clear();
}

/**
 * True when a consent request was canceled rather than denied. A timeout does
 * not appear here: the broker resolves it as a not-granted outcome so a turn
 * keeps running instead of failing.
 */
export function isBrowserConsentAbortError(error: unknown) {
	return error instanceof Error && error.message.includes('BROWSER_CONSENT_CANCELED');
}
