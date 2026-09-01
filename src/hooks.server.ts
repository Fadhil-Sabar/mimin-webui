import type { Handle } from '@sveltejs/kit';
import { building } from '$app/environment';
import { isAuthPath, svelteKitHandler } from 'better-auth/svelte-kit';
import { auth } from '$lib/server/auth';

const PUBLIC_PAGES = new Set(['/login']);

export const handle: Handle = async ({ event, resolve }) => {
	if (isAuthPath(event.url.toString(), auth.options)) {
		return svelteKitHandler({ auth, event, resolve, building });
	}

	const session = await auth.api.getSession({ headers: event.request.headers });
	event.locals.session = session?.session ?? null;
	event.locals.user = session?.user ?? null;
	const user = event.locals.user;

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
