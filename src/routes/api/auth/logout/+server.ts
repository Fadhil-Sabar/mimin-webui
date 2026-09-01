import { json } from '@sveltejs/kit';
import type { RequestHandler } from '@sveltejs/kit';
import { deleteSession } from '$lib/server/auth';
import { getSessionToken, SESSION_COOKIE } from '$lib/server/api';

export const POST: RequestHandler = async ({ cookies }) => {
	const token = getSessionToken({ cookies });
	if (token) await deleteSession(token);
	cookies.delete(SESSION_COOKIE, { path: '/' });
	return json({ loggedOut: true });
};
