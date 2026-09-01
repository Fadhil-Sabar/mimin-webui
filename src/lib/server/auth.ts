import { createHash, randomBytes } from 'node:crypto';
import { eq } from 'drizzle-orm';
import { getDb, schema } from '$lib/server/db/client';
import { hashPassword, verifyPassword } from './password';

export { hashPassword, verifyPassword };

const SESSION_TTL_MS = 30 * 24 * 60 * 60 * 1000; // 30 days

export interface AuthUser {
	id: string;
	email: string;
	name: string;
}

function sha256(value: string) {
	return createHash('sha256').update(value).digest('hex');
}

export async function createSession(userId: string): Promise<string> {
	const token = randomBytes(32).toString('base64url');
	await getDb()
		.insert(schema.sessions)
		.values({ userId, tokenHash: sha256(token), expiresAt: new Date(Date.now() + SESSION_TTL_MS) });
	return token;
}

export async function deleteSession(token: string) {
	if (!token) return;
	await getDb()
		.delete(schema.sessions)
		.where(eq(schema.sessions.tokenHash, sha256(token)))
		.catch(() => undefined);
}

export async function getSessionUser(token: string | undefined): Promise<AuthUser | null> {
	if (!token) return null;
	const tokenHash = sha256(token);
	const db = getDb();
	const [row] = await db
		.select({
			user: { id: schema.users.id, email: schema.users.email, name: schema.users.name },
			expiresAt: schema.sessions.expiresAt
		})
		.from(schema.sessions)
		.innerJoin(schema.users, eq(schema.sessions.userId, schema.users.id))
		.where(eq(schema.sessions.tokenHash, tokenHash));
	if (!row) return null;
	if (row.expiresAt.getTime() < Date.now()) return null;
	return row.user;
}
