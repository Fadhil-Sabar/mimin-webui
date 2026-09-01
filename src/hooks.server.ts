import type { Handle } from '@sveltejs/kit';
import { getSessionToken } from '$lib/server/api';
import { getSessionUser } from '$lib/server/auth';

const PUBLIC_PAGES = new Set(['/login', '/register']);

export const handle: Handle = async ({ event, resolve }) => {
	const token = getSessionToken(event);
	const user = token ? await getSessionUser(token) : null;
	event.locals.user = user;

	const url = new URL(event.request.url);
	if (event.route.id?.startsWith('/api/')) {
		return resolve(event);
	}

	// API routes are guarded individually by each handler. Pages redirect to /login.
	if (!user && !PUBLIC_PAGES.has(url.pathname)) {
		return Response.redirect(new URL('/login', url), 303);
	}
	if (user && PUBLIC_PAGES.has(url.pathname)) {
		return Response.redirect(new URL('/', url), 303);
	}

	return resolve(event);
};
