import { json } from '@sveltejs/kit';
import type { RequestHandler } from '@sveltejs/kit';
import { eq } from 'drizzle-orm';
import { getDb, schema } from '$lib/server/db/client';
import { apiError, handleApiError, SESSION_COOKIE } from '$lib/server/api';
import { createSession, verifyPassword } from '$lib/server/auth';

export const POST: RequestHandler = async ({ request, cookies }) => {
	try {
		const body = await request.json().catch(() => null);
		const email = typeof body?.email === 'string' ? body.email.trim().toLowerCase() : '';
		const password = typeof body?.password === 'string' ? body.password : '';
		if (!email || !password) return apiError('INVALID_INPUT', 'Email and password are required.');

		const [user] = await getDb().select().from(schema.users).where(eq(schema.users.email, email));
		if (!user || !(await verifyPassword(password, user.passwordHash))) {
			return apiError('INVALID_CREDENTIALS', 'Email or password is incorrect.', 401);
		}

		const token = await createSession(user.id);
		cookies.set(SESSION_COOKIE, token, {
			path: '/',
			httpOnly: true,
			sameSite: 'lax',
			maxAge: 60 * 60 * 24 * 30
		});
		return json({ user: { id: user.id, email: user.email, name: user.name } });
	} catch (error) {
		return handleApiError(error);
	}
};
