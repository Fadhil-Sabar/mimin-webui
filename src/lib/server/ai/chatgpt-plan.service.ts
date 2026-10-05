import { createHash, randomBytes, randomUUID } from 'node:crypto';
import { createServer } from 'node:http';
import { and, eq } from 'drizzle-orm';
import { jwtVerify, createRemoteJWKSet } from 'jose';
import { env } from '$env/dynamic/private';
import { getDb, schema } from '$lib/server/db/client';
import { decryptSecret, encryptSecret } from './provider-settings.service';
import { fetchChatGptPlanModels, type ChatGptPlanModel } from './model-discovery';

const AUTHORIZATION_ENDPOINT = 'https://auth.openai.com/api/accounts/authorize';
const TOKEN_ENDPOINT = 'https://auth.openai.com/api/accounts/oauth/token';
const jwks = createRemoteJWKSet(new URL('https://auth.openai.com/.well-known/jwks.json'));
const ISSUER = 'https://auth.openai.com';
const RESOURCE = 'https://api.openai.com/v1';
const REQUIRED_SCOPES = [
	'openid',
	'profile',
	'email',
	'offline_access',
	'resource.invoke',
	'chatgpt.tokens.use.direct'
];
const CALLBACK_PATH = '/auth/callback';
const ATTEMPT_TTL_MS = 5 * 60_000;
const TOKEN_MARGIN_MS = 60_000;

type Tokens = {
	clientId: string;
	subject: string;
	email: string | null;
	accessToken: string;
	refreshToken: string;
	idToken: string;
	scopes: string[];
	expiresAt: number;
	hostId: string;
};
type TokenResponse = {
	access_token?: string;
	refresh_token?: string;
	id_token?: string;
	token_type?: string;
	expires_in?: number;
	scope?: string;
};
type Attempt = {
	userId: string;
	state: string;
	nonce: string;
	verifier: string;
	redirectUri: string;
	clientId: string;
	expectedSubject?: string;
	idTokenHint?: string;
	createdAt: number;
	status: 'pending' | 'exchanging' | 'completed' | 'failed';
	error?: string;
	finish: (value: Tokens) => void;
	fail: (error: Error) => void;
	listener: ReturnType<typeof createServer>;
	timeout: ReturnType<typeof setTimeout>;
};
let pending: Attempt | undefined;
let refreshQueue = new Map<string, Promise<string>>();
const disconnecting = new Set<string>();
const attemptResults = new Map<
	string,
	{ status: 'pending' | 'failed'; error?: string; expiresAt: number }
>();

function cleanAttempts() {
	const now = Date.now();
	for (const [userId, result] of attemptResults)
		if (result.expiresAt <= now) attemptResults.delete(userId);
}

function sanitizedError(error: string) {
	if (error === 'timeout') return 'ChatGPT authorization timed out.';
	if (error === 'cancelled') return 'ChatGPT connection was cancelled.';
	return 'ChatGPT connection could not be completed.';
}

function callbackPort() {
	const value = process.env.CHATGPT_OAUTH_CALLBACK_PORT ?? env.CHATGPT_OAUTH_CALLBACK_PORT ?? '0';
	const port = Number(value);
	if (!Number.isInteger(port) || port < 0 || port > 65535)
		throw new Error('Invalid ChatGPT OAuth callback port');
	return port;
}

async function hostId() {
	const db = getDb();
	const key = 'chatgpt_oauth_host_id';
	let [setting] = await db
		.select()
		.from(schema.appSettings)
		.where(eq(schema.appSettings.key, key))
		.limit(1);
	if (!setting) {
		await db
			.insert(schema.appSettings)
			.values({ key, value: `urn:uuid:${randomUUID()}` })
			.onConflictDoNothing();
		[setting] = await db
			.select()
			.from(schema.appSettings)
			.where(eq(schema.appSettings.key, key))
			.limit(1);
	}
	if (!setting) throw new Error('Could not initialize ChatGPT host identity');
	return setting.value;
}

function html(success: boolean) {
	const heading = success ? 'ChatGPT connected' : 'Connection not completed';
	const message = success
		? 'You can close this window and return to Mimin.'
		: 'The connection could not be completed. Return to Mimin and try again.';
	return `<!doctype html><html lang="en"><meta charset="utf-8"><title>${heading}</title><body><main><h1>${heading}</h1><p>${message}</p></main></body></html>`;
}
async function tokenRequest(body: URLSearchParams): Promise<TokenResponse> {
	const response = await fetch(TOKEN_ENDPOINT, {
		method: 'POST',
		headers: { 'content-type': 'application/x-www-form-urlencoded', accept: 'application/json' },
		body,
		redirect: 'error',
		signal: AbortSignal.timeout(15_000)
	});
	if (!response.ok) throw new Error('ChatGPT token request failed');
	const value: unknown = await response.json();
	if (!value || typeof value !== 'object' || Array.isArray(value))
		throw new Error('Invalid ChatGPT token response');
	return value as TokenResponse;
}
function tokenExpiry(response: TokenResponse): number {
	if (
		typeof response.expires_in !== 'number' ||
		!Number.isFinite(response.expires_in) ||
		response.expires_in <= 0
	)
		throw new Error('Invalid ChatGPT token expiry');
	return Date.now() + response.expires_in * 1000;
}

async function revoke(connection: Tokens): Promise<boolean> {
	try {
		const discovery = await fetch('https://auth.openai.com/.well-known/openid-configuration', {
			redirect: 'error',
			signal: AbortSignal.timeout(5000)
		});
		if (!discovery.ok) return false;
		const configuration = await discovery.json();
		const endpoint = new URL(configuration.revocation_endpoint);
		if (endpoint.protocol !== 'https:' || endpoint.host !== 'auth.openai.com') return false;
		const response = await fetch(endpoint, {
			method: 'POST',
			redirect: 'error',
			signal: AbortSignal.timeout(5000),
			headers: { 'content-type': 'application/x-www-form-urlencoded' },
			body: new URLSearchParams({
				token: connection.refreshToken,
				token_type_hint: 'refresh_token',
				client_id: connection.clientId
			})
		});
		return response.status === 200;
	} catch {
		return false;
	}
}

function scopesFrom(value?: string) {
	return [...new Set((value ?? '').split(/\s+/).filter(Boolean))];
}
function requireScopes(scopes: string[]) {
	if (!REQUIRED_SCOPES.every((scope) => scopes.includes(scope)))
		throw new Error('ChatGPT did not grant required plan scopes');
}
async function verifiedIdentity(idToken: string, clientId: string, nonce?: string) {
	const { payload } = await jwtVerify(idToken, jwks, {
		issuer: ISSUER,
		audience: clientId,
		requiredClaims: ['exp', 'iat', 'sub']
	});
	if (
		typeof payload.sub !== 'string' ||
		!payload.sub ||
		typeof payload.exp !== 'number' ||
		typeof payload.iat !== 'number' ||
		(nonce && payload.nonce !== nonce)
	)
		throw new Error('Invalid ChatGPT identity token');
	return { subject: payload.sub, email: typeof payload.email === 'string' ? payload.email : null };
}
async function save(userId: string, tokens: Tokens) {
	const db = getDb();
	const values = {
		userId,
		clientId: tokens.clientId,
		subject: tokens.subject,
		email: tokens.email,
		accessToken: await encryptSecret(tokens.accessToken),
		refreshToken: await encryptSecret(tokens.refreshToken),
		idToken: await encryptSecret(tokens.idToken),
		scopes: tokens.scopes,
		expiresAt: new Date(tokens.expiresAt),
		hostId: tokens.hostId,
		updatedAt: new Date()
	};
	await db
		.insert(schema.chatgptPlanConnections)
		.values(values)
		.onConflictDoUpdate({ target: schema.chatgptPlanConnections.userId, set: values });
}

export async function getChatGptPlanConnection(userId: string) {
	const [row] = await getDb()
		.select()
		.from(schema.chatgptPlanConnections)
		.where(eq(schema.chatgptPlanConnections.userId, userId))
		.limit(1);
	if (!row || !row.accessToken || !row.refreshToken || !row.idToken) return null;
	const [accessToken, refreshToken, idToken] = await Promise.all([
		decryptSecret(row.accessToken),
		decryptSecret(row.refreshToken),
		decryptSecret(row.idToken)
	]);
	if (!accessToken || !refreshToken || !idToken)
		throw new Error('ChatGPT credentials could not be decrypted');
	return {
		clientId: row.clientId,
		subject: row.subject,
		email: row.email,
		accessToken,
		refreshToken,
		idToken,
		scopes: row.scopes,
		expiresAt: row.expiresAt.getTime(),
		hostId: row.hostId
	} satisfies Tokens;
}

export async function startChatGptPlanConnection(userId: string) {
	cleanAttempts();
	if (pending || disconnecting.has(userId))
		throw Object.assign(
			new Error('A ChatGPT connection attempt is already active on this server.'),
			{ code: 'CHATGPT_OAUTH_BUSY' }
		);
	const listener = createServer();
	let finish!: (tokens: Tokens) => void;
	let fail!: (error: Error) => void;
	const completion = new Promise<Tokens>((resolve, reject) => {
		finish = resolve;
		fail = reject;
	});
	const attempt: Attempt = {
		userId,
		state: randomBytes(32).toString('base64url'),
		nonce: randomBytes(32).toString('base64url'),
		verifier: randomBytes(32).toString('base64url'),
		redirectUri: '',
		clientId: 'dynamic_agent_client',
		createdAt: Date.now(),
		status: 'pending',
		finish,
		fail,
		listener,
		timeout: setTimeout(() => {}, 0)
	};
	pending = attempt;
	attemptResults.set(userId, { status: 'pending', expiresAt: Date.now() + ATTEMPT_TTL_MS });
	const cleanup = () => {
		clearTimeout(attempt.timeout);
		listener.close();
		if (pending === attempt) pending = undefined;
	};
	const completed = completion.finally(cleanup);
	attempt.timeout = setTimeout(() => {
		if (pending === attempt) {
			attempt.status = 'failed';
			attemptResults.set(userId, {
				status: 'failed',
				error: 'timeout',
				expiresAt: Date.now() + ATTEMPT_TTL_MS
			});
			attempt.fail(new Error('timeout'));
		}
	}, ATTEMPT_TTL_MS);
	// Observe rejection even when a caller disconnects before awaiting completion.
	void completed.catch(() => {});
	try {
		await new Promise<void>((resolve, reject) => {
			const onError = (error: Error) => reject(error);
			listener.on('error', onError);
			listener.listen(callbackPort(), '127.0.0.1', () => {
				listener.removeListener('error', onError);
				listener.on('error', () => {
					if (pending === attempt && attempt.status !== 'completed') {
						attempt.status = 'failed';
						attemptResults.set(userId, {
							status: 'failed',
							error: 'authorization',
							expiresAt: Date.now() + ATTEMPT_TTL_MS
						});
						attempt.fail(new Error('ChatGPT callback listener failed'));
					}
				});
				resolve();
			});
		});
		const address = listener.address();
		if (!address || typeof address === 'string')
			throw new Error('Could not start ChatGPT callback listener');
		attempt.redirectUri = `http://127.0.0.1:${address.port}${CALLBACK_PATH}`;
		listener.on('request', async (request, response) => {
			let url: URL;
			try {
				url = new URL(request.url ?? '/', attempt.redirectUri);
			} catch {
				response.writeHead(400).end('Invalid callback');
				return;
			}
			const headers = {
				'content-type': 'text/html; charset=utf-8',
				'cache-control': 'no-store',
				'content-security-policy': "default-src 'none'; base-uri 'none'; frame-ancestors 'none'"
			};
			if (request.method !== 'GET' || url.pathname !== CALLBACK_PATH) {
				response.writeHead(404).end('Not found');
				return;
			}
			if (
				pending !== attempt ||
				attempt.status !== 'pending' ||
				Date.now() - attempt.createdAt > ATTEMPT_TTL_MS ||
				url.searchParams.get('state') !== attempt.state
			) {
				response.writeHead(400, headers).end(html(false));
				return;
			}
			if (url.searchParams.has('error')) {
				response.writeHead(200, headers).end(html(false));
				attempt.status = 'failed';
				attemptResults.set(userId, {
					status: 'failed',
					error: 'authorization',
					expiresAt: Date.now() + ATTEMPT_TTL_MS
				});
				attempt.fail(new Error('ChatGPT authorization was declined'));
				return;
			}
			const code = url.searchParams.get('code');
			const callbackClientId = url.searchParams.get('client_id');
			if (
				!code ||
				(attempt.clientId === 'dynamic_agent_client' &&
					(!callbackClientId || callbackClientId === 'dynamic_agent_client')) ||
				(callbackClientId &&
					callbackClientId !== attempt.clientId &&
					attempt.clientId !== 'dynamic_agent_client')
			) {
				response.writeHead(400, headers).end(html(false));
				attempt.status = 'failed';
				attemptResults.set(userId, {
					status: 'failed',
					error: 'authorization',
					expiresAt: Date.now() + ATTEMPT_TTL_MS
				});
				attempt.fail(new Error('Invalid ChatGPT callback'));
				return;
			}
			const clientId =
				attempt.clientId === 'dynamic_agent_client' ? callbackClientId! : attempt.clientId;
			attempt.status = 'exchanging';
			try {
				const token = await tokenRequest(
					new URLSearchParams({
						grant_type: 'authorization_code',
						client_id: clientId,
						code,
						code_verifier: attempt.verifier,
						redirect_uri: attempt.redirectUri,
						resource: RESOURCE
					})
				);
				if (pending !== attempt || attempt.status !== 'exchanging') {
					response.writeHead(400, headers).end(html(false));
					return;
				}
				if (
					!token.access_token ||
					!token.refresh_token ||
					!token.id_token ||
					token.token_type?.toLowerCase() !== 'bearer'
				)
					throw new Error('Incomplete token response');
				const scopes = scopesFrom(token.scope);
				requireScopes(scopes);
				const identity = await verifiedIdentity(token.id_token, clientId, attempt.nonce);
				if (pending !== attempt || attempt.status !== 'exchanging') {
					response.writeHead(400, headers).end(html(false));
					return;
				}
				if (attempt.expectedSubject && identity.subject !== attempt.expectedSubject)
					throw new Error('ChatGPT account changed');
				const tokens: Tokens = {
					...identity,
					clientId,
					accessToken: token.access_token,
					refreshToken: token.refresh_token,
					idToken: token.id_token,
					scopes,
					expiresAt: tokenExpiry(token),
					hostId: await hostId()
				};
				if (pending !== attempt || attempt.status !== 'exchanging') {
					response.writeHead(400, headers).end(html(false));
					return;
				}
				await save(userId, tokens);
				if (pending !== attempt || attempt.status !== 'exchanging') {
					await deleteIfRefreshMatches(userId, tokens.refreshToken);
					response.writeHead(400, headers).end(html(false));
					return;
				}
				attempt.status = 'completed';
				attemptResults.delete(userId);
				response.writeHead(200, headers).end(html(true));
				attempt.finish(tokens);
			} catch {
				if (!response.writableEnded) response.writeHead(200, headers).end(html(false));
				if (pending === attempt && attempt.status === 'exchanging') {
					attempt.status = 'failed';
					attemptResults.set(userId, {
						status: 'failed',
						error: 'authorization',
						expiresAt: Date.now() + ATTEMPT_TTL_MS
					});
					attempt.fail(new Error('ChatGPT connection could not be validated'));
				}
			}
		});
		const [saved] = await getDb()
			.select()
			.from(schema.chatgptPlanConnections)
			.where(eq(schema.chatgptPlanConnections.userId, userId))
			.limit(1);
		if (pending !== attempt || attempt.status !== 'pending')
			throw new Error('ChatGPT authorization cancelled');
		attempt.clientId = saved?.clientId ?? 'dynamic_agent_client';
		if (saved) {
			attempt.expectedSubject = saved.subject;
			attempt.idTokenHint = (await decryptSecret(saved.idToken)) ?? undefined;
		}
		const currentHostId = await hostId();
		if (pending !== attempt || attempt.status !== 'pending')
			throw new Error('ChatGPT authorization cancelled');
		const authorize = new URL(AUTHORIZATION_ENDPOINT);
		const params = new URLSearchParams({
			client_id: attempt.clientId,

			ext_agent_host_id: currentHostId,
			response_type: 'code',
			redirect_uri: attempt.redirectUri,
			scope: REQUIRED_SCOPES.join(' '),
			resource: RESOURCE,
			state: attempt.state,
			nonce: attempt.nonce,
			code_challenge_method: 'S256',
			code_challenge: createHash('sha256').update(attempt.verifier).digest('base64url')
		});
		if (attempt.clientId === 'dynamic_agent_client') params.set('agent_name_hint', 'Mimin WebUI');
		if (attempt.idTokenHint) params.set('id_token_hint', attempt.idTokenHint);
		if (saved?.email) params.set('login_hint', saved.email);
		authorize.search = params.toString();
		return {
			authorizationUrl: authorize.toString(),
			callbackPort: address.port,
			completion: completed
		};
	} catch (error) {
		if (attempt.status === 'pending') {
			attempt.status = 'failed';
			attemptResults.set(userId, {
				status: 'failed',
				error: error instanceof Error && error.message === 'timeout' ? 'timeout' : 'authorization',
				expiresAt: Date.now() + ATTEMPT_TTL_MS
			});
			attempt.fail(new Error('ChatGPT callback listener could not be started'));
		}
		cleanup();
		throw error;
	}
}

export async function disconnectChatGptPlanConnection(userId: string) {
	disconnecting.add(userId);
	try {
		if (pending?.userId === userId) {
			const attempt = pending;
			attempt.status = 'failed';
			attemptResults.set(userId, {
				status: 'failed',
				error: 'cancelled',
				expiresAt: Date.now() + ATTEMPT_TTL_MS
			});
			attempt.fail(new Error('ChatGPT authorization cancelled'));
			clearTimeout(attempt.timeout);
			attempt.listener.close();
			if (pending === attempt) pending = undefined;
		}
		const refresh = refreshQueue.get(userId);
		refreshQueue.delete(userId);
		await refresh?.catch(() => {});
		let revocationConfirmed = true;
		try {
			const connection = await getChatGptPlanConnection(userId);
			if (connection) revocationConfirmed = await revoke(connection);
		} catch {
			revocationConfirmed = false;
		}
		await getDb()
			.update(schema.chatgptPlanConnections)
			.set({ accessToken: null, refreshToken: null, idToken: null, updatedAt: new Date() })
			.where(eq(schema.chatgptPlanConnections.userId, userId));
		return { revocationConfirmed };
	} finally {
		disconnecting.delete(userId);
	}
}

export async function getChatGptPlanStatus(userId: string) {
	cleanAttempts();
	const connection = await getChatGptPlanConnection(userId);
	const result = attemptResults.get(userId);
	return {
		connected: Boolean(connection),
		account: connection ? { email: connection.email } : null,
		pending: Boolean(pending?.userId === userId),
		status: pending?.userId === userId ? pending.status : (result?.status ?? null),
		error: result?.error ? sanitizedError(result.error) : null
	};
}

async function deleteIfRefreshMatches(userId: string, refreshToken: string) {
	const db = getDb();
	const [row] = await db
		.select({ refreshToken: schema.chatgptPlanConnections.refreshToken })
		.from(schema.chatgptPlanConnections)
		.where(eq(schema.chatgptPlanConnections.userId, userId))
		.limit(1);
	if (row?.refreshToken && (await decryptSecret(row.refreshToken)) === refreshToken)
		await db
			.update(schema.chatgptPlanConnections)
			.set({ accessToken: null, refreshToken: null, idToken: null, updatedAt: new Date() })
			.where(
				and(
					eq(schema.chatgptPlanConnections.userId, userId),
					eq(schema.chatgptPlanConnections.refreshToken, row.refreshToken)
				)
			);
}
export async function getChatGptAccessToken(userId: string): Promise<string | null> {
	if (disconnecting.has(userId)) return null;
	const connection = await getChatGptPlanConnection(userId);
	if (!connection) return null;
	if (connection.expiresAt > Date.now() + TOKEN_MARGIN_MS) return connection.accessToken;
	const ongoing = refreshQueue.get(userId);
	if (ongoing) return ongoing;
	const refresh = (async () => {
		const response = await tokenRequest(
			new URLSearchParams({
				grant_type: 'refresh_token',
				client_id: connection.clientId,
				refresh_token: connection.refreshToken,
				resource: RESOURCE
			})
		);
		if (
			!response.access_token ||
			!response.refresh_token ||
			!response.id_token ||
			response.token_type?.toLowerCase() !== 'bearer'
		)
			throw new Error('ChatGPT token refresh failed');
		const scopes = response.scope ? scopesFrom(response.scope) : connection.scopes;
		requireScopes(scopes);
		const identity = await verifiedIdentity(response.id_token, connection.clientId);
		if (identity.subject !== connection.subject)
			throw new Error('ChatGPT identity changed during refresh');
		const updated: Tokens = {
			...connection,
			...identity,
			accessToken: response.access_token,
			refreshToken: response.refresh_token,
			idToken: response.id_token,
			scopes,
			expiresAt: tokenExpiry(response)
		};
		const db = getDb();
		if (disconnecting.has(userId) || pending?.userId === userId)
			throw new Error('ChatGPT connection changed during refresh');
		const [row] = await db
			.select({ refreshToken: schema.chatgptPlanConnections.refreshToken })
			.from(schema.chatgptPlanConnections)
			.where(eq(schema.chatgptPlanConnections.userId, userId))
			.limit(1);
		if (!row?.refreshToken || (await decryptSecret(row.refreshToken)) !== connection.refreshToken)
			throw new Error('ChatGPT connection changed during refresh');
		const encrypted = {
			accessToken: await encryptSecret(updated.accessToken),
			refreshToken: await encryptSecret(updated.refreshToken),
			idToken: await encryptSecret(updated.idToken)
		};
		const changed = await db
			.update(schema.chatgptPlanConnections)
			.set({
				...encrypted,
				scopes: updated.scopes,
				expiresAt: new Date(updated.expiresAt),
				email: updated.email,
				updatedAt: new Date()
			})
			.where(
				and(
					eq(schema.chatgptPlanConnections.userId, userId),
					eq(schema.chatgptPlanConnections.refreshToken, row.refreshToken),
					eq(schema.chatgptPlanConnections.clientId, connection.clientId)
				)
			)
			.returning({ userId: schema.chatgptPlanConnections.userId });
		if (!changed.length) throw new Error('ChatGPT connection changed during refresh');
		return updated.accessToken;
	})();
	refreshQueue.set(userId, refresh);
	try {
		return await refresh;
	} finally {
		if (refreshQueue.get(userId) === refresh) refreshQueue.delete(userId);
	}
}
export async function listChatGptPlanModels(userId: string): Promise<ChatGptPlanModel[]> {
	const token = await getChatGptAccessToken(userId);
	return token ? fetchChatGptPlanModels(token) : [];
}
export function resetChatGptPlanForTests() {
	if (pending) {
		pending.status = 'failed';
		pending.fail(new Error('reset'));
		pending.listener.close();
		clearTimeout(pending.timeout);
	}
	pending = undefined;
	refreshQueue = new Map();
	attemptResults.clear();
	disconnecting.clear();
}
