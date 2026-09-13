/**
 * Short-lived, in-memory record of the most recent password reset link per email.
 *
 * Better Auth hands the finished link to `sendResetPassword`, so this is the only
 * place the server sees it. Keeping it lets an administrator hand a link to a user
 * on an installation that has no SMTP relay, and the entry expires on its own.
 */

export type ResetLinkRecord = {
	email: string;
	url: string;
	createdAt: number;
	expiresAt: number;
};

/** The token itself expires after an hour; keep the record in step and never unbounded. */
export const PASSWORD_RESET_TTL_SECONDS = 60 * 60;
export const PASSWORD_RESET_TTL_MS = PASSWORD_RESET_TTL_SECONDS * 1000;
export const MAX_REMEMBERED_RESET_LINKS = 200;

const links = new Map<string, ResetLinkRecord>();

function normalizeEmail(email: string): string {
	return email.trim().toLowerCase();
}

function prune(now: number) {
	for (const [key, record] of links) {
		if (record.expiresAt <= now) links.delete(key);
	}
	while (links.size > MAX_REMEMBERED_RESET_LINKS) {
		const oldest = links.keys().next();
		if (oldest.done) break;
		links.delete(oldest.value);
	}
}

export function recordResetLink(
	record: { email: string; url: string; expiresAt?: number },
	now = Date.now()
): ResetLinkRecord {
	const stored: ResetLinkRecord = {
		email: normalizeEmail(record.email),
		url: record.url,
		createdAt: now,
		expiresAt: record.expiresAt ?? now + PASSWORD_RESET_TTL_MS
	};
	// Re-insert so the map stays ordered from least to most recently created.
	links.delete(stored.email);
	links.set(stored.email, stored);
	prune(now);
	return stored;
}

export function peekResetLink(email: string, now = Date.now()): ResetLinkRecord | null {
	prune(now);
	const record = links.get(normalizeEmail(email));
	if (!record || record.expiresAt <= now) return null;
	return record;
}

export function resetLinkCount(): number {
	return links.size;
}

export function clearResetLinks(): void {
	links.clear();
}
