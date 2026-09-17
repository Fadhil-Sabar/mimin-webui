import { redirect } from '@sveltejs/kit';

export function load({ locals }) {
	if (!locals.user) redirect(303, '/login');
	if (locals.user.role !== 'admin') redirect(303, '/');
	redirect(307, '/chat?settings=users');
}
