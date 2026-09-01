import { env } from '$env/dynamic/private';
import { drizzleAdapter } from '@better-auth/drizzle-adapter';
import { betterAuth } from 'better-auth';
import { admin } from 'better-auth/plugins';
import { getDb, schema } from '$lib/server/db/client';
import { hashPassword, verifyPassword } from './password';

/** The single Better Auth instance used by the SvelteKit handler and server APIs. */
export const auth = betterAuth({
	appName: 'Mimin WebUI',
	baseURL: env.BETTER_AUTH_URL || undefined,
	secret: env.BETTER_AUTH_SECRET || undefined,
	database: drizzleAdapter(getDb(), {
		provider: 'pg',
		usePlural: true,
		schema: {
			users: schema.users,
			sessions: schema.sessions,
			accounts: schema.accounts,
			verifications: schema.verifications
		}
	}),
	emailAndPassword: {
		enabled: true,
		disableSignUp: true,
		minPasswordLength: 8,
		password: {
			hash: hashPassword,
			verify: ({ hash, password }) => verifyPassword(password, hash)
		}
	},
	session: {
		expiresIn: 60 * 60 * 24 * 30
	},
	advanced: {
		database: {
			generateId: 'uuid'
		}
	},
	plugins: [admin({ defaultRole: 'user', adminRoles: ['admin'] })]
});

export type AuthSession = typeof auth.$Infer.Session.session;
export type AuthUser = typeof auth.$Infer.Session.user;

export { hashPassword, verifyPassword };
