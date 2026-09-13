import { json } from '@sveltejs/kit';
import type { RequestEvent } from '@sveltejs/kit';
import { eq } from 'drizzle-orm';
import { apiError, handleApiError, requireUser } from '$lib/server/api';
import { getDb, schema } from '$lib/server/db/client';
import { peekResetLink } from '$lib/server/password-reset';

/**
 * Creates a one-time password reset link for another user.
 *
 * Better Auth generates the token and hands the link to the configured
 * `sendResetPassword` callback; this route reads the recorded link back so an
 * administrator can pass it on when the installation has no SMTP relay.
 *
 * `$lib/server/auth` is imported inside the handler on purpose: route modules are
 * imported while the app is built, and constructing Better Auth needs configuration
 * (a secret and a database URL) that a build machine does not necessarily have.
 */
export async function POST(event: RequestEvent) {
	try {
		const user = await requireUser(event);
		if (!user) return apiError('UNAUTHORIZED', 'Authentication required.', 401);
		if (user.role !== 'admin')
			return apiError('FORBIDDEN', 'Administrator access is required.', 403);

		const [target] = await getDb()
			.select({ id: schema.users.id, email: schema.users.email })
			.from(schema.users)
			.where(eq(schema.users.id, event.params.id as string));
		if (!target) return apiError('USER_NOT_FOUND', 'User not found.', 404);

		const { auth } = await import('$lib/server/auth');
		await auth.api.requestPasswordReset({ body: { email: target.email } });

		const link = peekResetLink(target.email);
		if (!link)
			return apiError(
				'RESET_LINK_UNAVAILABLE',
				'The reset link could not be created. Try again in a moment.',
				503
			);

		return json({ url: link.url, expiresAt: new Date(link.expiresAt).toISOString() });
	} catch (error) {
		return handleApiError(error);
	}
}
