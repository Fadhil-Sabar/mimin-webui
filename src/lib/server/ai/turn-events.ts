import { and, asc, desc, eq, gt, lt } from 'drizzle-orm';
import { getDb, schema } from '$lib/server/db/client';
import { TURN_LEASE_MS } from './turn-registry';

export const TURN_EVENT_RETENTION_MS = 24 * 60 * 60 * 1000;
let lastPruneAt = 0;

export async function findTurnByRequest(conversationId: string, requestId: string) {
	const [turn] = await getDb()
		.select()
		.from(schema.conversationTurns)
		.where(
			and(
				eq(schema.conversationTurns.conversationId, conversationId),
				eq(schema.conversationTurns.requestId, requestId)
			)
		);
	return turn;
}

export async function createTurn(
	conversationId: string,
	id: string,
	requestId: string,
	userMessageId?: string
) {
	if (Date.now() - lastPruneAt > 60 * 60 * 1000) {
		lastPruneAt = Date.now();
		void pruneExpiredTurnEvents().catch(() => {});
	}
	const [turn] = await getDb()
		.insert(schema.conversationTurns)
		.values({
			id,
			conversationId,
			requestId,
			userMessageId
		})
		.onConflictDoNothing()
		.returning();
	return turn ?? findTurnByRequest(conversationId, requestId);
}

export async function appendTurnEvent(turnId: string, type: string, data: unknown) {
	const [row] = await getDb()
		.insert(schema.turnEvents)
		.values({ turnId, type, data })
		.returning({ id: schema.turnEvents.id });
	return row.id;
}

export async function finishTurn(turnId: string, status: 'complete' | 'interrupted' | 'stopped') {
	await getDb()
		.update(schema.conversationTurns)
		.set({ status, completedAt: new Date() })
		.where(
			and(eq(schema.conversationTurns.id, turnId), eq(schema.conversationTurns.status, 'running'))
		);
}

export async function getTurn(conversationId: string, turnId: string) {
	const [turn] = await getDb()
		.select()
		.from(schema.conversationTurns)
		.where(
			and(
				eq(schema.conversationTurns.conversationId, conversationId),
				eq(schema.conversationTurns.id, turnId)
			)
		);
	return turn;
}

export async function getLatestRunningTurn(conversationId: string) {
	const [turn] = await getDb()
		.select()
		.from(schema.conversationTurns)
		.where(
			and(
				eq(schema.conversationTurns.conversationId, conversationId),
				eq(schema.conversationTurns.status, 'running')
			)
		)
		.orderBy(desc(schema.conversationTurns.createdAt))
		.limit(1);
	return turn;
}

export async function reconcileInterruptedTurn(conversationId: string, turnId: string) {
	const turn = await getTurn(conversationId, turnId);
	if (!turn || turn.status !== 'running') return turn;
	const [lease] = await getDb()
		.select()
		.from(schema.activeTurns)
		.where(eq(schema.activeTurns.conversationId, conversationId));
	if (lease?.token === turnId && lease.leaseUntil.getTime() > Date.now()) return turn;
	// A newly reserved turn can precede its lease write briefly. The grace period
	// also avoids treating an in-progress transaction as a process crash.
	if (Date.now() - turn.createdAt.getTime() < TURN_LEASE_MS) return turn;
	await finishTurn(turnId, 'interrupted');
	await appendTurnEvent(turnId, 'error', {
		type: 'error',
		error: { code: 'TURN_INTERRUPTED', message: 'Generation was interrupted. Retry to continue.' }
	});
	return { ...turn, status: 'interrupted' };
}

export async function readTurnEvents(turnId: string, afterId: number) {
	return getDb()
		.select()
		.from(schema.turnEvents)
		.where(and(eq(schema.turnEvents.turnId, turnId), gt(schema.turnEvents.id, afterId)))
		.orderBy(asc(schema.turnEvents.id))
		.limit(200);
}

export async function pruneExpiredTurnEvents() {
	await getDb()
		.delete(schema.turnEvents)
		.where(lt(schema.turnEvents.createdAt, new Date(Date.now() - TURN_EVENT_RETENTION_MS)));
}

export async function recordBrowserAction(input: {
	requestId: string;
	turnId: string;
	userId: string;
	token: string;
}) {
	await getDb()
		.insert(schema.pendingBrowserActions)
		.values({
			...input,
			expiresAt: new Date(Date.now() + 45_000)
		})
		.onConflictDoNothing();
}
