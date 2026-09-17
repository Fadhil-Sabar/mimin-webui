import { env } from '$env/dynamic/private';
import { getMailStatus, passwordResetEmail, sendMail } from './mail';
import {
	PASSWORD_RESET_TTL_SECONDS,
	peekResetLink,
	recordResetLink,
	type ResetLinkRecord
} from './password-reset/links';

export { PASSWORD_RESET_TTL_SECONDS, peekResetLink, type ResetLinkRecord };

/**
 * The link that is actually recorded and emailed points at the app's own reset page,
 * so a reset never depends on Better Auth's callback redirect and its origin check.
 * The origin comes from ORIGIN/BETTER_AUTH_URL, falling back to the origin Better
 * Auth used to build the link it handed us.
 */
export function passwordResetPublicUrl(token: string, generatedUrl: string): string {
	const configured = env.ORIGIN?.trim() || env.BETTER_AUTH_URL?.trim();
	let origin = configured ? configured.replace(/\/+$/, '') : '';
	if (!origin) {
		try {
			origin = new URL(generatedUrl).origin;
		} catch {
			origin = '';
		}
	}
	return `${origin}/reset-password?token=${encodeURIComponent(token)}`;
}

/**
 * Better Auth calls this with the finished link. The link is always recorded so an
 * administrator can hand it over, and it is emailed when a relay is configured.
 * This callback never throws: a mail outage must not turn into a 500 that reveals
 * whether the address exists.
 */
export async function deliverPasswordResetLink(input: {
	email: string;
	url: string;
	token: string;
}): Promise<void> {
	try {
		const url = passwordResetPublicUrl(input.token, input.url);
		recordResetLink({ email: input.email, url });

		const status = getMailStatus();
		if (!status.configured) {
			// The link is a bearer credential, so the log says one was created and never
			// what it is. An administrator copies it from the users console instead.
			console.warn(
				`[auth] Password reset link generated for ${input.email} ` +
					'(no SMTP_HOST configured; an administrator can copy the link from the admin console).'
			);
			return;
		}

		const message = passwordResetEmail({
			url,
			expiresInMinutes: Math.round(PASSWORD_RESET_TTL_SECONDS / 60)
		});
		const result = await sendMail({ to: input.email, ...message });
		if (!result.sent)
			console.warn(`[auth] Could not email the reset link for ${input.email}: ${result.reason}`);
	} catch (error) {
		console.error('[auth] Delivering the password reset link failed.', error);
	}
}
