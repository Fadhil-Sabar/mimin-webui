import { json } from '@sveltejs/kit';
import type { RequestHandler } from '@sveltejs/kit';
import { requireUser } from '$lib/server/api';

export const GET: RequestHandler = async (event) => {
	const user = await requireUser(event);
	return json({ user });
};
