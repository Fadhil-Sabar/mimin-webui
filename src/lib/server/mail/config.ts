import { SmtpError, type SmtpConfig } from './smtp-client';

export type MailEnv = Record<string, string | undefined>;

export const DEFAULT_SMTP_PORT = 587;
export const DEFAULT_SMTP_TIMEOUT_MS = 10_000;

export type MailConfigResult = { config: SmtpConfig | null; problem?: string };

function readBoolean(value: string | undefined, fallback: boolean): boolean {
	if (value === undefined || value.trim() === '') return fallback;
	return ['1', 'true', 'yes', 'on'].includes(value.trim().toLowerCase());
}

function readPositiveInteger(value: string | undefined, fallback: number): number {
	if (value === undefined || value.trim() === '') return fallback;
	const parsed = Number(value.trim());
	if (!Number.isInteger(parsed) || parsed <= 0) return fallback;
	return parsed;
}

/**
 * Builds the SMTP transport from environment variables.
 * Returns null when SMTP_HOST is unset, which means "no email delivery configured".
 */
export function resolveMailConfig(env: MailEnv): SmtpConfig | null {
	const host = env.SMTP_HOST?.trim();
	if (!host) return null;

	const secure = readBoolean(env.SMTP_SECURE, false);
	const port = readPositiveInteger(env.SMTP_PORT, secure ? 465 : DEFAULT_SMTP_PORT);
	const user = env.SMTP_USER?.trim() || undefined;
	const from = env.SMTP_FROM?.trim() || user;
	if (!from)
		throw new SmtpError(
			'SMTP_FROM must be set when SMTP_HOST is configured, for example "Mimin WebUI <no-reply@example.com>".'
		);

	return {
		host,
		port,
		secure,
		user,
		password: env.SMTP_PASSWORD || undefined,
		from,
		heloName: env.SMTP_HELO_NAME?.trim() || undefined,
		// Credentials or message content over a plaintext hop is never the default.
		requireTls: !readBoolean(env.SMTP_ALLOW_INSECURE, false),
		timeoutMs: readPositiveInteger(env.SMTP_TIMEOUT_MS, DEFAULT_SMTP_TIMEOUT_MS)
	};
}

/** Never throws: an operator typo should degrade to "no email", not to a broken sign-in page. */
export function loadMailConfig(env: MailEnv): MailConfigResult {
	try {
		return { config: resolveMailConfig(env) };
	} catch (error) {
		return {
			config: null,
			problem: error instanceof Error ? error.message : 'The mail configuration is invalid.'
		};
	}
}
