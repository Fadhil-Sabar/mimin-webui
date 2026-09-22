import type { Agent } from '@earendil-works/pi-agent-core';
import { and, eq, lt } from 'drizzle-orm';
import { getDb, schema } from '$lib/server/db/client';
import { cancelBrowserRequests } from '../browser/bridge';
import { cancelBrowserConsents } from '../browser/consent';
import { cancelQuestionRequests } from './question-broker';

/**
 * A live turn renews its row every third of the lease; an expired lease means
 * the owning process died and another instance may reclaim the conversation.
 */
export const TURN_LEASE_MS = 60_000;

/**
 * Process-local fast paths. The database row is the source of truth across
 * instances; these maps avoid a query for the common same-process case.
 */
const activeAgents = new Map<string, { agent: Agent; token: string }>();
const reservedTurns = new Map<string, string>();
const canceledTurns = new Set<string>();

/**
 * Reserves the conversation's single turn. Returns false when any instance
 * (this one or another) already holds an unexpired reservation.
 */
/**
 * Test seam: drops the process-local mirrors (as a process restart would)
 * without touching the shared rows, so cross-instance paths can be exercised.
 */
export function forgetLocalTurnState() {
	activeAgents.clear();
	reservedTurns.clear();
	canceledTurns.clear();
}

export async function beginConversationTurn(conversationId: string, token: string) {
	if (reservedTurns.has(conversationId)) return false;
	const db = getDb();
	const leaseUntil = new Date(Date.now() + TURN_LEASE_MS);
	const inserted = await db
		.insert(schema.activeTurns)
		.values({ conversationId, token, leaseUntil })
		.onConflictDoNothing()
		.returning({ conversationId: schema.activeTurns.conversationId });
	if (inserted.length) {
		reservedTurns.set(conversationId, token);
		return true;
	}
	// Conflict is only reclaimable when the previous holder's lease expired.
	const reclaimed = await db
		.update(schema.activeTurns)
		.set({ token, canceled: false, leaseUntil, updatedAt: new Date() })
		.where(
			and(
				eq(schema.activeTurns.conversationId, conversationId),
				lt(schema.activeTurns.leaseUntil, new Date())
			)
		)
		.returning({ conversationId: schema.activeTurns.conversationId });
	if (reclaimed.length) {
		reservedTurns.set(conversationId, token);
		return true;
	}
	return false;
}

export async function releaseConversationTurn(conversationId: string, token: string) {
	if (reservedTurns.get(conversationId) === token) reservedTurns.delete(conversationId);
	canceledTurns.delete(token);
	const active = activeAgents.get(conversationId);
	if (active?.token === token) activeAgents.delete(conversationId);
	await getDb()
		.delete(schema.activeTurns)
		.where(
			and(
				eq(schema.activeTurns.conversationId, conversationId),
				eq(schema.activeTurns.token, token)
			)
		)
		.catch(() => {});
}

export function isConversationTurnCanceled(token: string) {
	return canceledTurns.has(token);
}

/**
 * Reconciles the local cancel flag with the shared row, so a Stop pressed on
 * another instance is observed at the running turn's next checkpoint. When the
 * shared row says canceled, the local agent (if any) is aborted immediately.
 * Returns true when the turn is canceled or its reservation was taken over.
 */
export async function refreshConversationTurnCanceled(conversationId: string, token: string) {
	if (canceledTurns.has(token)) return true;
	const [row] = await getDb()
		.select({
			token: schema.activeTurns.token,
			canceled: schema.activeTurns.canceled
		})
		.from(schema.activeTurns)
		.where(eq(schema.activeTurns.conversationId, conversationId));
	if (!row) return canceledTurns.has(token);
	if (row.token !== token) return true; // reclaimed: this turn no longer owns the conversation
	if (!row.canceled) return false;
	canceledTurns.add(token);
	const active = activeAgents.get(conversationId);
	if (active?.token === token) active.agent.abort();
	return true;
}

/** True while any instance holds a live or reserved turn for the conversation. */
export async function hasActiveConversationTurn(conversationId: string) {
	if (activeAgents.has(conversationId) || reservedTurns.has(conversationId)) return true;
	const [row] = await getDb()
		.select({ leaseUntil: schema.activeTurns.leaseUntil })
		.from(schema.activeTurns)
		.where(eq(schema.activeTurns.conversationId, conversationId));
	return Boolean(row && row.leaseUntil.getTime() > Date.now());
}

/** Attach the live Agent instance for a turn started with beginConversationTurn. */
export async function registerActiveAgent(conversationId: string, agent: Agent, token: string) {
	activeAgents.set(conversationId, { agent, token });
	await renewTurnLease(conversationId, token);
}

export async function renewTurnLease(conversationId: string, token: string) {
	await getDb()
		.update(schema.activeTurns)
		.set({ leaseUntil: new Date(Date.now() + TURN_LEASE_MS), updatedAt: new Date() })
		.where(
			and(
				eq(schema.activeTurns.conversationId, conversationId),
				eq(schema.activeTurns.token, token)
			)
		)
		.catch(() => {});
}

/** Keeps the turn's lease alive for the whole prompt/loop cycle. */
export function startTurnLeaseHeartbeat(conversationId: string, token: string) {
	const timer = setInterval(
		() => {
			void renewTurnLease(conversationId, token);
		},
		Math.max(1_000, Math.floor(TURN_LEASE_MS / 3))
	);
	return () => clearInterval(timer);
}

async function markTurnCanceled(conversationId: string, token?: string) {
	await getDb()
		.update(schema.activeTurns)
		.set({ canceled: true, updatedAt: new Date() })
		.where(
			and(
				eq(schema.activeTurns.conversationId, conversationId),
				token ? eq(schema.activeTurns.token, token) : undefined
			)
		)
		.catch(() => {});
}

export async function stopConversation(conversationId: string, token?: string) {
	const active = activeAgents.get(conversationId);
	if (!active) {
		const reservedToken = reservedTurns.get(conversationId);
		if (reservedToken && (!token || reservedToken === token)) {
			canceledTurns.add(reservedToken);
			await markTurnCanceled(conversationId, reservedToken);
			cancelBrowserRequests(conversationId, reservedToken);
			void cancelBrowserConsents(conversationId, reservedToken);
			void cancelQuestionRequests(conversationId, reservedToken);
			return true;
		}
		// Not held locally: the turn may be running on another instance.
		const [row] = await getDb()
			.select({ token: schema.activeTurns.token })
			.from(schema.activeTurns)
			.where(eq(schema.activeTurns.conversationId, conversationId));
		if (row && (!token || row.token === token)) {
			await markTurnCanceled(conversationId, row.token);
			void cancelBrowserConsents(conversationId, row.token);
			void cancelQuestionRequests(conversationId, row.token);
			return true;
		}
		return false;
	}
	if (token && active.token !== token) return false;
	// A stop with no turn token is the user pressing Stop, not a stream that dropped,
	// so it is recorded as intentional: the partial reply ends quietly instead of
	// being surfaced afterwards as an interrupted turn.
	if (!token) canceledTurns.add(active.token);
	await markTurnCanceled(conversationId, active.token);
	cancelBrowserRequests(conversationId, active.token);
	void cancelBrowserConsents(conversationId, active.token);
	void cancelQuestionRequests(conversationId, active.token);
	active.agent.abort();
	return true;
}
