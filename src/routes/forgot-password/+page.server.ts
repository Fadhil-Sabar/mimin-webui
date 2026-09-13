import { getMailStatus } from '$lib/server/mail';
import { PASSWORD_RESET_TTL_SECONDS } from '$lib/server/password-reset';

/** The page needs to know whether a reset link can be emailed, and how long it lasts. */
export function load() {
	return {
		mailConfigured: getMailStatus().configured,
		expiresInMinutes: Math.round(PASSWORD_RESET_TTL_SECONDS / 60)
	};
}
