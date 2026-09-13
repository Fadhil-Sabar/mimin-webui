import { env } from '$env/dynamic/private';
import { loadMailConfig, type MailConfigResult, type MailEnv } from './mail/config';
import { sendSmtpMail, SmtpError, type SmtpConfig, type SmtpMessage } from './mail/smtp-client';

export { SmtpError };
export type { SmtpConfig, SmtpMessage };

export type MailStatus = {
	configured: boolean;
	host: string | null;
	from: string | null;
	problem: string | null;
};

export type MailResult = { sent: true } | { sent: false; reason: string };

export const MAIL_NOT_CONFIGURED =
	'Email delivery is not configured on this server. Set SMTP_HOST, SMTP_PORT, SMTP_FROM, and SMTP_USER/SMTP_PASSWORD to send mail.';

function readMailConfig(): MailConfigResult {
	return loadMailConfig(env as MailEnv);
}

/** Safe for page loads: reports configuration without ever throwing. */
export function getMailStatus(): MailStatus {
	const { config, problem } = readMailConfig();
	return {
		configured: Boolean(config),
		host: config?.host ?? null,
		from: config?.from ?? null,
		problem: problem ?? null
	};
}

export function isMailConfigured(): boolean {
	return getMailStatus().configured;
}

/** Sends one plain-text message. Failure is reported, never thrown at the caller. */
export async function sendMail(message: SmtpMessage): Promise<MailResult> {
	const { config, problem } = readMailConfig();
	if (problem) return { sent: false, reason: problem };
	if (!config) return { sent: false, reason: MAIL_NOT_CONFIGURED };

	try {
		await sendSmtpMail(config, message);
		return { sent: true };
	} catch (error) {
		const reason =
			error instanceof SmtpError
				? error.message
				: error instanceof Error
					? error.message
					: 'Sending the email failed.';
		console.error(`[mail] ${reason}`);
		return { sent: false, reason };
	}
}

export function passwordResetEmail(options: { url: string; expiresInMinutes: number }): {
	subject: string;
	text: string;
} {
	return {
		subject: 'Reset your Mimin WebUI password',
		text: [
			'A password reset was requested for your Mimin WebUI account.',
			'',
			'Open this link to choose a new password:',
			options.url,
			'',
			`The link expires in ${options.expiresInMinutes} minutes and can be used once.`,
			'If you did not request this, you can ignore this message; your password stays unchanged.'
		].join('\n')
	};
}
