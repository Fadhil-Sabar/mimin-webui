import { beforeEach, describe, expect, it, vi } from 'vitest';

const envState = vi.hoisted(() => ({ values: {} as Record<string, string | undefined> }));
const state = vi.hoisted(() => ({
	user: { id: 'admin-1', role: 'admin' } as { id: string; role?: string } | null,
	rows: [{ id: 'user-2', email: 'someone@example.com' }] as { id: string; email: string }[],
	requestPasswordReset: vi.fn(async (input: { body: { email: string } }) => ({
		status: true,
		message: input.body.email
	}))
}));

vi.mock('$env/dynamic/private', () => ({ env: envState.values }));

vi.mock('drizzle-orm', () => ({
	eq: (column: unknown, value: unknown) => ({ column, value })
}));

vi.mock('../src/lib/server/db/client', () => ({
	schema: { users: { id: 'users.id' } },
	getDb: () => ({
		select: () => ({ from: () => ({ where: async () => state.rows }) })
	})
}));

vi.mock('../src/lib/server/auth', () => ({
	auth: { api: { requestPasswordReset: state.requestPasswordReset } }
}));

vi.mock('../src/lib/server/api', async () => {
	const { json } = await import('@sveltejs/kit');
	return {
		apiError: (code: string, message: string, status = 400) =>
			json({ error: { code, message } }, { status }),
		requireUser: vi.fn(async () => state.user),
		handleApiError: (error: unknown) => {
			throw error;
		}
	};
});

const { loadMailConfig, resolveMailConfig } = await import('../src/lib/server/mail/config');
const { MAIL_NOT_CONFIGURED, getMailStatus, sendMail } = await import('../src/lib/server/mail');
const { deliverPasswordResetLink, passwordResetPublicUrl } =
	await import('../src/lib/server/password-reset');
const {
	MAX_REMEMBERED_RESET_LINKS,
	PASSWORD_RESET_TTL_MS,
	clearResetLinks,
	peekResetLink,
	recordResetLink,
	resetLinkCount
} = await import('../src/lib/server/password-reset/links');
const route = await import('../src/routes/api/admin/users/[id]/reset-link/+server');

function setEnv(values: Record<string, string | undefined>) {
	for (const key of Object.keys(envState.values)) delete envState.values[key];
	Object.assign(envState.values, values);
}

function event(id = 'user-2') {
	return {
		locals: { user: state.user },
		params: { id },
		request: new Request('http://localhost/api/admin/users/user-2/reset-link', { method: 'POST' })
	} as never;
}

beforeEach(() => {
	state.user = { id: 'admin-1', role: 'admin' };
	state.rows = [{ id: 'user-2', email: 'someone@example.com' }];
	state.requestPasswordReset.mockReset();
	state.requestPasswordReset.mockImplementation(async (input: { body: { email: string } }) => ({
		status: true,
		message: input.body.email
	}));
	clearResetLinks();
	setEnv({});
});

describe('remembered reset links', () => {
	it('keeps the newest link per email', () => {
		recordResetLink({ email: 'Someone@Example.com', url: 'http://localhost/first' });
		recordResetLink({ email: 'someone@example.com', url: 'http://localhost/second' });

		expect(resetLinkCount()).toBe(1);
		expect(peekResetLink('someone@example.com')?.url).toBe('http://localhost/second');
	});

	it('forgets expired links', () => {
		const now = 1_000_000;
		recordResetLink({ email: 'someone@example.com', url: 'http://localhost/link' }, now);

		expect(peekResetLink('someone@example.com', now + PASSWORD_RESET_TTL_MS - 1)).not.toBeNull();
		expect(peekResetLink('someone@example.com', now + PASSWORD_RESET_TTL_MS)).toBeNull();
		expect(resetLinkCount()).toBe(0);
	});

	it('stays bounded', () => {
		for (let index = 0; index < MAX_REMEMBERED_RESET_LINKS + 25; index += 1) {
			recordResetLink({ email: `user-${index}@example.com`, url: `http://localhost/${index}` });
		}

		expect(resetLinkCount()).toBe(MAX_REMEMBERED_RESET_LINKS);
		expect(peekResetLink('user-0@example.com')).toBeNull();
		expect(peekResetLink(`user-${MAX_REMEMBERED_RESET_LINKS + 24}@example.com`)).not.toBeNull();
	});
});

describe('mail configuration', () => {
	it('reports "not configured" when SMTP_HOST is empty', () => {
		expect(resolveMailConfig({})).toBeNull();
		expect(loadMailConfig({ SMTP_HOST: '   ' })).toEqual({ config: null });
		expect(getMailStatus()).toEqual({ configured: false, host: null, from: null, problem: null });
	});

	it('derives the sender and TLS policy from the environment', () => {
		const config = resolveMailConfig({
			SMTP_HOST: 'smtp.example.com',
			SMTP_USER: 'mailer@example.com',
			SMTP_PASSWORD: 'secret'
		});

		expect(config).toMatchObject({
			host: 'smtp.example.com',
			port: 587,
			secure: false,
			from: 'mailer@example.com',
			requireTls: true
		});
	});

	it('honours implicit TLS and the explicit insecure override', () => {
		expect(
			resolveMailConfig({
				SMTP_HOST: 'smtp.example.com',
				SMTP_FROM: 'no-reply@example.com',
				SMTP_SECURE: 'true'
			})
		).toMatchObject({ port: 465, secure: true });
		expect(
			resolveMailConfig({
				SMTP_HOST: 'smtp.example.com',
				SMTP_FROM: 'no-reply@example.com',
				SMTP_ALLOW_INSECURE: 'true'
			})
		).toMatchObject({ requireTls: false, from: 'no-reply@example.com' });
	});

	it('surfaces a configuration problem instead of throwing', () => {
		setEnv({ SMTP_HOST: 'smtp.example.com' });

		expect(getMailStatus()).toMatchObject({
			configured: false,
			problem: expect.stringContaining('SMTP_FROM')
		});
	});

	it('never sends when no relay is configured', async () => {
		await expect(
			sendMail({ to: 'user@example.com', subject: 'Hi', text: 'Hello' })
		).resolves.toEqual({ sent: false, reason: MAIL_NOT_CONFIGURED });
	});

	it('reports a failed delivery instead of throwing', async () => {
		setEnv({
			SMTP_HOST: '127.0.0.1',
			SMTP_PORT: '9',
			SMTP_FROM: 'no-reply@example.com',
			SMTP_TIMEOUT_MS: '1500'
		});

		const result = await sendMail({ to: 'user@example.com', subject: 'Hi', text: 'Hello' });
		expect(result.sent).toBe(false);
	});
});

describe('password reset delivery', () => {
	it('records a link that points at the app reset page', async () => {
		setEnv({ ORIGIN: 'https://mimin.example.com/' });

		await deliverPasswordResetLink({
			email: 'someone@example.com',
			url: 'https://mimin.example.com/api/auth/reset-password/token-1?callbackURL=x',
			token: 'token-1'
		});

		expect(peekResetLink('someone@example.com')?.url).toBe(
			'https://mimin.example.com/reset-password?token=token-1'
		);
	});

	it('falls back to the origin Better Auth generated the link from', () => {
		expect(
			passwordResetPublicUrl('token 2', 'https://other.example.com/api/auth/reset-password/x')
		).toBe('https://other.example.com/reset-password?token=token%202');
	});

	it('never writes the reset link or its token to the log', async () => {
		const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
		try {
			await deliverPasswordResetLink({
				email: 'someone@example.com',
				url: 'https://mimin.example.com/api/auth/reset-password/token-secret?callbackURL=x',
				token: 'token-secret'
			});

			const logged = warn.mock.calls.flat().join(' ');
			// The link is a bearer credential: the log may only say one was created, and
			// an administrator copies the actual link from the admin console.
			expect(logged).not.toContain('token-secret');
			expect(logged).not.toContain('/reset-password');
			expect(logged).toContain('someone@example.com');
			expect(peekResetLink('someone@example.com')?.url).toContain('token-secret');
		} finally {
			warn.mockRestore();
		}
	});

	it('records a link even when the generated url cannot be parsed', async () => {
		await expect(
			deliverPasswordResetLink({ email: 'someone@example.com', url: 'not a url', token: 'token-3' })
		).resolves.toBeUndefined();
		expect(peekResetLink('someone@example.com')?.url).toBe('/reset-password?token=token-3');
	});
});

describe('admin reset link route', () => {
	it('requires a session', async () => {
		state.user = null;
		const response = await route.POST(event());
		expect(response.status).toBe(401);
	});

	it('requires an administrator', async () => {
		state.user = { id: 'user-9', role: 'user' };
		const response = await route.POST(event());
		expect(response.status).toBe(403);
		expect(state.requestPasswordReset).not.toHaveBeenCalled();
	});

	it('rejects an unknown user', async () => {
		state.rows = [];
		const response = await route.POST(event('missing'));
		expect(response.status).toBe(404);
	});

	it('returns the created link for a known user', async () => {
		state.requestPasswordReset.mockImplementation(async ({ body }: { body: { email: string } }) => {
			recordResetLink({
				email: body.email,
				url: 'https://mimin.example.com/reset-password?token=token-4'
			});
			return { status: true, message: body.email };
		});

		const response = await route.POST(event());
		expect(response.status).toBe(200);
		expect(state.requestPasswordReset).toHaveBeenCalledWith({
			body: { email: 'someone@example.com' }
		});
		const payload = await response.json();
		expect(payload.url).toBe('https://mimin.example.com/reset-password?token=token-4');
		expect(new Date(payload.expiresAt).getTime()).toBeGreaterThan(Date.now());
	});

	it('reports when no link could be produced', async () => {
		const response = await route.POST(event());
		expect(response.status).toBe(503);
		expect((await response.json()).error.code).toBe('RESET_LINK_UNAVAILABLE');
	});
});
