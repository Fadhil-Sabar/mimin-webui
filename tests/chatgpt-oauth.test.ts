import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { createServer } from 'node:http';
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
	disconnectChatGptPlanConnection,
	getChatGptAccessToken,
	getChatGptPlanStatus,
	resetChatGptPlanForTests,
	startChatGptPlanConnection
} from '../src/lib/server/ai/chatgpt-plan.service';

const realFetch = globalThis.fetch;
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
	fetcher = vi.fn(async (url: string | URL) => {
		if (String(url).endsWith('/openid-configuration'))
			return Response.json({ revocation_endpoint: 'https://auth.openai.com/revoke' });
		if (String(url).endsWith('/revoke')) return new Response(null, { status: 200 });
		return Response.json(tokenResponse);
	});
	vi.stubGlobal('fetch', fetcher);
});
afterEach(() => {
	resetChatGptPlanForTests();
	vi.unstubAllGlobals();
	vi.useRealTimers();
	delete process.env.CHATGPT_OAUTH_CALLBACK_PORT;
});
async function identity(nonce: string, overrides: Record<string, unknown> = {}) {
	return new SignJWT({ nonce, email: 'person@example.test', ...overrides })
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
	return { attempt, authorization, callback };
}

describe('ChatGPT local OAuth', () => {
	it('uses dynamic registration, validates a signed identity, and stores encrypted user-scoped tokens', async () => {
		const { attempt, authorization, callback } = await authorize();
		expect(authorization.searchParams.get('client_id')).toBe('dynamic_agent_client');
		expect(authorization.searchParams.get('code_challenge_method')).toBe('S256');
		expect(authorization.searchParams.get('ext_agent_host_id')).toMatch(/^urn:uuid:/);
		expect(authorization.searchParams.get('resource')).toBe('https://api.openai.com/v1');
		expect(callback.hostname).toBe('127.0.0.1');
		expect((await realFetch(callback)).status).toBe(200);
		await attempt.completion;
		expect(state.rows.get('user-1')?.accessToken).toBe('encrypted:test-access');
		expect((await getChatGptPlanStatus('user-1')).connected).toBe(true);
		expect((await getChatGptPlanStatus('user-2')).connected).toBe(false);
		const body = fetcher.mock.calls[0][1].body as URLSearchParams;
		expect(body.get('client_id')).toBe('oaiapp_test');
		expect(body.get('redirect_uri')).toBe(authorization.searchParams.get('redirect_uri'));
		expect(body.get('code_verifier')).toHaveLength(43);
	});
	it('rejects a mismatched state without exchanging or consuming the valid attempt', async () => {
		const { attempt, callback } = await authorize();
		const wrong = new URL(callback);
		wrong.searchParams.set('state', 'wrong');
		expect((await realFetch(wrong)).status).toBe(400);
		expect(fetcher).not.toHaveBeenCalled();
		await realFetch(callback);
		await attempt.completion;
		expect(fetcher).toHaveBeenCalledTimes(1);
	});
	it('consumes a valid callback once while token exchange is in flight', async () => {
		const { attempt, callback } = await authorize();
		let release!: () => void;
		const wait = new Promise<void>((resolve) => {
			release = resolve;
		});
		fetcher.mockImplementationOnce(async () => {
			await wait;
			return Response.json(tokenResponse);
		});
		const first = realFetch(callback);
		await vi.waitFor(() => expect(fetcher).toHaveBeenCalledTimes(1));
		expect((await realFetch(callback)).status).toBe(400);
		release();
		await first;
		await attempt.completion;
		expect(fetcher).toHaveBeenCalledTimes(1);
	});
	it.each([
		'scope',
		'nonce',
		'signature',
		'expiry',
		'missing-exp',
		'expired-jwt',
		'issuer',
		'audience'
	])('rejects invalid %s without attaching credentials', async (invalid) => {
		const { attempt, callback } = await authorize();
		if (invalid === 'scope') tokenResponse.scope = 'openid profile email';
		if (invalid === 'nonce') tokenResponse.id_token = await identity('wrong');
		if (invalid === 'signature') {
			const other = await generateKeyPair('RS256');
			tokenResponse.id_token = await new SignJWT({ nonce: 'anything' })
				.setProtectedHeader({ alg: 'RS256', kid: 'test-key' })
				.setIssuer('https://auth.openai.com')
				.setAudience('oaiapp_test')
				.setSubject('account-1')
				.setIssuedAt()
				.setExpirationTime('1h')
				.sign(other.privateKey);
		}
		if (invalid === 'expiry') tokenResponse.expires_in = -1;
		if (['missing-exp', 'expired-jwt', 'issuer', 'audience'].includes(invalid)) {
			const nonce = new URL(attempt.authorizationUrl).searchParams.get('nonce');
			let jwt = new SignJWT({ nonce })
				.setProtectedHeader({ alg: 'RS256', kid: 'test-key' })
				.setIssuer(invalid === 'issuer' ? 'https://wrong.example' : 'https://auth.openai.com')
				.setAudience(invalid === 'audience' ? 'different-client' : 'oaiapp_test')
				.setSubject('account-1')
				.setIssuedAt();
			if (invalid !== 'missing-exp')
				jwt = jwt.setExpirationTime(invalid === 'expired-jwt' ? '0s' : '1h');
			tokenResponse.id_token = await jwt.sign(privateKey);
		}
		const result = await realFetch(callback);
		expect(await result.text()).not.toContain('ChatGPT connected');
		await expect(attempt.completion).rejects.toThrow('could not be validated');
		expect(state.rows.size).toBe(0);
		expect((await getChatGptPlanStatus('user-1')).status).toBe('failed');
	});
	it('rejects concurrent attempts and cancellation prevents late token attachment', async () => {
		const { attempt, callback } = await authorize();
		await expect(startChatGptPlanConnection('user-2')).rejects.toMatchObject({
			code: 'CHATGPT_OAUTH_BUSY'
		});
		let release!: () => void;
		const wait = new Promise<void>((resolve) => {
			release = resolve;
		});
		fetcher.mockImplementationOnce(async () => {
			await wait;
			return Response.json(tokenResponse);
		});
		const request = realFetch(callback);
		await vi.waitFor(() => expect(fetcher).toHaveBeenCalledTimes(1));
		await disconnectChatGptPlanConnection('user-1');
		release();
		await request;
		await expect(attempt.completion).rejects.toThrow('cancelled');
		expect(state.rows.size).toBe(0);
	});
	it('expires abandoned authorization attempts and closes their listener', async () => {
		vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout', 'Date'] });
		const attempt = await startChatGptPlanConnection('user-1');
		await vi.advanceTimersByTimeAsync(5 * 60 * 1000 + 1);
		await expect(attempt.completion).rejects.toThrow('timeout');
		expect((await getChatGptPlanStatus('user-1')).pending).toBe(false);
		expect((await getChatGptPlanStatus('user-1')).error).toContain('timed out');
	});

	it('reports listener bind errors without leaving a pending attempt', async () => {
		const occupied = createServer();
		await new Promise<void>((resolve) => occupied.listen(0, '127.0.0.1', resolve));
		const address = occupied.address();
		process.env.CHATGPT_OAUTH_CALLBACK_PORT = String(typeof address === 'object' && address?.port);
		try {
			await expect(startChatGptPlanConnection('user-1')).rejects.toThrow();
		} finally {
			occupied.close();
		}
		expect((await getChatGptPlanStatus('user-1')).pending).toBe(false);
	});
	it('retains registration on disconnect, revokes tokens, and reuses the client without hints', async () => {
		const { attempt, callback, authorization } = await authorize();
		await realFetch(callback);
		await attempt.completion;
		await expect(disconnectChatGptPlanConnection('user-1')).resolves.toEqual({
			revocationConfirmed: true
		});
		expect(await getChatGptAccessToken('user-1')).toBeNull();
		expect(state.rows.get('user-1')?.clientId).toBe('oaiapp_test');
		const next = await startChatGptPlanConnection('user-1');
		const nextUrl = new URL(next.authorizationUrl);
		expect(nextUrl.searchParams.get('client_id')).toBe('oaiapp_test');
		expect(nextUrl.searchParams.has('id_token_hint')).toBe(false);
		expect(nextUrl.searchParams.has('agent_name_hint')).toBe(false);
		expect(nextUrl.searchParams.get('ext_agent_host_id')).toBe(
			authorization.searchParams.get('ext_agent_host_id')
		);
	});
	it('serializes refreshes and atomically replaces rotated credentials', async () => {
		const { attempt, callback } = await authorize();
		await realFetch(callback);
		await attempt.completion;
		state.rows.get('user-1')!.expiresAt = new Date(0);
		tokenResponse = {
			...tokenResponse,
			access_token: 'rotated-access',
			refresh_token: 'rotated-refresh'
		};
		fetcher.mockClear();
		expect(
			await Promise.all([getChatGptAccessToken('user-1'), getChatGptAccessToken('user-1')])
		).toEqual(['rotated-access', 'rotated-access']);
		expect(fetcher).toHaveBeenCalledTimes(1);
		expect(state.rows.get('user-1')?.refreshToken).toBe('encrypted:rotated-refresh');
	});
});
