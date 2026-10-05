import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { exportJWK, generateKeyPair, SignJWT, type JWK } from 'jose';

type Row = Record<string, unknown>;
type Condition = { column: string; value: unknown } | Condition[];

const state = vi.hoisted(() => ({
	rows: new Map<string, Row>(),
	settings: new Map<string, Row>(),
	jwks: { keys: [] } as { keys: JWK[] }
}));
vi.mock('drizzle-orm', () => ({
	eq: (column: string, value: unknown) => ({ column, value }),
	and: (...conditions: unknown[]) => conditions
}));
vi.mock('$lib/server/db/client', () => {
	const matches = (row: Row, condition: Condition): boolean =>
		Array.isArray(condition)
			? condition.every((item) => matches(row, item))
			: row[condition.column] === condition.value;
	const tableRows = (table: string) => (table === 'settings' ? state.settings : state.rows);
	return {
		schema: {
			appSettings: Object.assign(new String('settings'), { key: 'key' }),
			chatgptPlanConnections: Object.assign(new String('connections'), {
				userId: 'userId',
				refreshToken: 'refreshToken',
				clientId: 'clientId'
			})
		},
		getDb: () => ({
			select: () => ({
				from: (table: string) => ({
					where: (condition: Condition) => ({
						limit: async () =>
							[...tableRows(String(table)).values()].filter((row) => matches(row, condition))
					})
				})
			}),
			insert: (table: string) => ({
				values: (row: Row) => ({
					onConflictDoNothing: async () => {
						const rows = tableRows(String(table));
						const id = String(row.key ?? row.userId);
						if (!rows.has(id)) rows.set(id, row);
					},
					onConflictDoUpdate: async () => {
						state.rows.set(String(row.userId), row);
					}
				})
			}),
			update: () => ({
				set: (values: Row) => ({
					where: (condition: Condition) => {
						const changed: Row[] = [];
						for (const [id, row] of state.rows)
							if (matches(row, condition)) {
								state.rows.set(id, { ...row, ...values });
								changed.push({ userId: id });
							}
						return Object.assign(Promise.resolve(changed), { returning: async () => changed });
					}
				})
			})
		})
	};
});
vi.mock('../src/lib/server/ai/provider-settings.service', () => ({
	encryptSecret: async (value: string) => `encrypted:${value}`,
	decryptSecret: async (value: string | null) =>
		value?.startsWith('encrypted:') ? value.slice(10) : null
}));
vi.mock('jose', async (importOriginal) => {
	const original = await importOriginal<typeof import('jose')>();
	return {
		...original,
		createRemoteJWKSet:
			() =>
			async (...args: Parameters<ReturnType<typeof original.createLocalJWKSet>>) =>
				original.createLocalJWKSet(state.jwks)(...args)
	};
});
import {
	ChatGptPlanCompletionError,
	completeChatGptPlanConnection,
	getChatGptPlanStatus,
	resetChatGptPlanForTests,
	startChatGptPlanConnection
} from '../src/lib/server/ai/chatgpt-plan.service';

let privateKey: Awaited<ReturnType<typeof generateKeyPair>>['privateKey'];
const scope = 'openid profile email offline_access resource.invoke chatgpt.tokens.use.direct';
let tokenResponse: Row;
let fetcher: ReturnType<typeof vi.fn>;
beforeAll(async () => {
	const pair = await generateKeyPair('RS256');
	privateKey = pair.privateKey;
	state.jwks.keys = [{ ...(await exportJWK(pair.publicKey)), kid: 'test-key', alg: 'RS256' }];
});
beforeEach(() => {
	state.rows.clear();
	state.settings.clear();
	process.env.CHATGPT_OAUTH_CALLBACK_PORT = '0';
	fetcher = vi.fn(async () => Response.json(tokenResponse));
	vi.stubGlobal('fetch', fetcher);
});
afterEach(() => {
	resetChatGptPlanForTests();
	vi.unstubAllGlobals();
	delete process.env.CHATGPT_OAUTH_CALLBACK_PORT;
});
async function identity(nonce: string) {
	return new SignJWT({ nonce, email: 'person@example.test' })
		.setProtectedHeader({ alg: 'RS256', kid: 'test-key' })
		.setIssuer('https://auth.openai.com')
		.setAudience('oaiapp_test')
		.setSubject('account-1')
		.setIssuedAt()
		.setExpirationTime('1h')
		.sign(privateKey);
}
async function authorize(userId = 'user-1') {
	const attempt = await startChatGptPlanConnection(userId);
	const authorization = new URL(attempt.authorizationUrl);
	tokenResponse = {
		access_token: 'test-access',
		refresh_token: 'test-refresh',
		token_type: 'Bearer',
		expires_in: 3600,
		scope,
		id_token: await identity(authorization.searchParams.get('nonce')!)
	};
	const callback = new URL(authorization.searchParams.get('redirect_uri')!);
	callback.search = new URLSearchParams({
		code: 'test-code',
		state: authorization.searchParams.get('state')!,
		client_id: 'oaiapp_test'
	}).toString();
	void attempt.completion.catch(() => {});
	return { attempt, authorization, callback };
}

describe('ChatGPT pasted callback completion', () => {
	it('completes a pending sign-in from the pasted callback URL', async () => {
		const { attempt, authorization, callback } = await authorize();
		const result = await completeChatGptPlanConnection('user-1', callback.toString());
		expect(result).toEqual({ ok: true, email: 'person@example.test' });
		await attempt.completion;
		expect(state.rows.get('user-1')?.accessToken).toBe('encrypted:test-access');
		expect(state.rows.get('user-1')?.refreshToken).toBe('encrypted:test-refresh');
		expect((await getChatGptPlanStatus('user-1')).connected).toBe(true);
		const body = fetcher.mock.calls[0][1].body as URLSearchParams;
		expect(body.get('code')).toBe('test-code');
		expect(body.get('code_verifier')).toHaveLength(43);
		expect(body.get('redirect_uri')).toBe(authorization.searchParams.get('redirect_uri'));
	});

	it('accepts surrounding whitespace and rejects a replayed URL', async () => {
		const { attempt, callback } = await authorize();
		await completeChatGptPlanConnection('user-1', `  ${callback.toString()}\n`);
		await attempt.completion;
		await expect(
			completeChatGptPlanConnection('user-1', callback.toString())
		).rejects.toMatchObject({ code: 'NO_ACTIVE_ATTEMPT' });
		expect(fetcher).toHaveBeenCalledTimes(1);
	});

	it('rejects a mismatched state without consuming the attempt', async () => {
		const { attempt, callback } = await authorize();
		const wrong = new URL(callback);
		wrong.searchParams.set('state', 'wrong');
		await expect(completeChatGptPlanConnection('user-1', wrong.toString())).rejects.toMatchObject({
			code: 'STATE_MISMATCH'
		});
		expect(fetcher).not.toHaveBeenCalled();
		expect((await getChatGptPlanStatus('user-1')).pending).toBe(true);
		const result = await completeChatGptPlanConnection('user-1', callback.toString());
		expect(result.ok).toBe(true);
		await attempt.completion;
	});

	it.each([
		['https://attacker.example/auth/callback?code=test-code&state=x', 'a non-loopback host'],
		['http://127.0.0.1:1234/other?code=test-code', 'a non-callback path'],
		['not-a-url', 'free text'],
		['', 'an empty value']
	])('rejects %s (%s) without exchanging', async (input) => {
		const { callback } = await authorize();
		const error = (await completeChatGptPlanConnection('user-1', input).catch(
			(value) => value
		)) as ChatGptPlanCompletionError;
		expect(error).toBeInstanceOf(ChatGptPlanCompletionError);
		expect(error.code).toBe('INVALID_CALLBACK_URL');
		expect(fetcher).not.toHaveBeenCalled();
		await completeChatGptPlanConnection('user-1', callback.toString());
	});

	it('refuses pasted URLs when no attempt is waiting or the user differs', async () => {
		const { attempt, callback } = await authorize();
		await expect(
			completeChatGptPlanConnection('user-2', callback.toString())
		).rejects.toMatchObject({ code: 'NO_ACTIVE_ATTEMPT' });
		expect(fetcher).not.toHaveBeenCalled();
		resetChatGptPlanForTests();
		await expect(
			completeChatGptPlanConnection('user-1', callback.toString())
		).rejects.toMatchObject({ code: 'NO_ACTIVE_ATTEMPT' });
		expect(fetcher).not.toHaveBeenCalled();
		expect(state.rows.size).toBe(0);
		void attempt.completion.catch(() => {});
	});
});
