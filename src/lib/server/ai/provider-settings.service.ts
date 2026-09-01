import { createCipheriv, createDecipheriv, randomBytes, scrypt as scryptCb } from 'node:crypto';
import { promisify } from 'node:util';
import { and, eq } from 'drizzle-orm';
import { env } from '$env/dynamic/private';
import { getDb, schema } from '$lib/server/db/client';

const scrypt = promisify(scryptCb) as (
	password: string,
	salt: Buffer,
	keylen: number
) => Promise<Buffer>;

function deriveKey(secret: string, salt: Buffer): Promise<Buffer> {
	return scrypt(secret, salt, 32) as Promise<Buffer>;
}

/**
 * Per-user provider credentials. Keys are encrypted at rest with a key derived
 * from `PROVIDER_KEY_ENCRYPTION_SECRET` so the database never stores plaintext
 * provider keys. When a user has no stored key, the server environment
 * variable is used as fallback, preserving the current single-tenant setup.
 */

export interface ProviderCredential {
	provider: string;
	apiKey: string | null;
	baseUrl: string | null;
	/** True when the effective key comes from a user setting, false when it falls back to the server env. */
	fromUser: boolean;
}

const PROVIDERS = ['openai', 'anthropic', 'google'] as const;
export type ProviderId = (typeof PROVIDERS)[number];

export const PROVIDER_ENV_KEY: Record<ProviderId, string> = {
	openai: 'OPENAI_API_KEY',
	anthropic: 'ANTHROPIC_API_KEY',
	google: 'GOOGLE_API_KEY'
};

/** Reads a server env var, preferring live process.env (works in tests and dev). */
function getEnv(name: string): string | undefined {
	const value = process.env[name] ?? env[name];
	return typeof value === 'string' && value.trim().length > 0 ? value : undefined;
}

export function isProviderId(value: string): value is ProviderId {
	return (PROVIDERS as readonly string[]).includes(value);
}

function encryptionKey(): string {
	const secret = getEnv('PROVIDER_KEY_ENCRYPTION_SECRET');
	if (!secret) throw new Error('PROVIDER_KEY_ENCRYPTION_SECRET is not configured');
	return secret;
}

/** Encrypt a provider key as `v1:<salt hex>:<iv hex>:<ciphertext hex>`. */
export async function encryptSecret(plaintext: string): Promise<string> {
	const salt = randomBytes(16);
	const iv = randomBytes(12);
	const key = await deriveKey(encryptionKey(), salt);
	const cipher = createCipheriv('aes-256-gcm', key, iv);
	const ciphertext = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()]);
	const tag = cipher.getAuthTag();
	return `v1:${salt.toString('hex')}:${iv.toString('hex')}:${ciphertext.toString('hex')}:${tag.toString('hex')}`;
}

/** Decrypt a value produced by `encryptSecret`. Returns null for malformed payloads. */
export async function decryptSecret(payload: string | null | undefined): Promise<string | null> {
	if (!payload) return null;
	const parts = payload.split(':');
	if (parts.length !== 5 || parts[0] !== 'v1') return null;
	const [, saltHex, ivHex, dataHex, tagHex] = parts;
	try {
		const key = await deriveKey(encryptionKey(), Buffer.from(saltHex, 'hex'));
		const decipher = createDecipheriv('aes-256-gcm', key, Buffer.from(ivHex, 'hex'));
		decipher.setAuthTag(Buffer.from(tagHex, 'hex'));
		return Buffer.concat([decipher.update(Buffer.from(dataHex, 'hex')), decipher.final()]).toString(
			'utf8'
		);
	} catch {
		return null;
	}
}

/** True when the provider has any usable key: user-stored or server env. */
export function providerKeyFromEnv(provider: ProviderId): string | undefined {
	return getEnv(PROVIDER_ENV_KEY[provider]);
}

export async function getProviderCredential(
	userId: string,
	provider: ProviderId
): Promise<ProviderCredential> {
	const [row] = await getDb()
		.select()
		.from(schema.providerSettings)
		.where(
			and(
				eq(schema.providerSettings.userId, userId),
				eq(schema.providerSettings.provider, provider)
			)
		);
	const apiKey = row ? await decryptSecret(row.apiKey) : null;
	const envKey = providerKeyFromEnv(provider);
	return {
		provider,
		apiKey: apiKey ?? envKey ?? null,
		baseUrl: row?.baseUrl ?? null,
		fromUser: Boolean(row && apiKey)
	};
}

export async function listProviderCredentials(userId: string): Promise<ProviderCredential[]> {
	const rows = await getDb()
		.select()
		.from(schema.providerSettings)
		.where(eq(schema.providerSettings.userId, userId));
	const byProvider = new Map(rows.map((row) => [row.provider, row]));
	return Promise.all(
		PROVIDERS.map(async (provider) => {
			const row = byProvider.get(provider);
			const apiKey = row ? await decryptSecret(row.apiKey) : null;
			const envKey = providerKeyFromEnv(provider);
			return {
				provider,
				apiKey: apiKey ?? envKey ?? null,
				baseUrl: row?.baseUrl ?? null,
				fromUser: Boolean(row && apiKey)
			};
		})
	);
}

export async function saveProviderCredential(
	userId: string,
	provider: ProviderId,
	input: { apiKey?: string | null; baseUrl?: string | null }
): Promise<void> {
	const apiKey = input.apiKey ? await encryptSecret(input.apiKey) : null;
	const baseUrl = input.baseUrl?.trim() || null;
	const db = getDb();
	const existing = await db
		.select({ id: schema.providerSettings.id })
		.from(schema.providerSettings)
		.where(
			and(
				eq(schema.providerSettings.userId, userId),
				eq(schema.providerSettings.provider, provider)
			)
		)
		.limit(1);
	if (existing[0]) {
		await db
			.update(schema.providerSettings)
			.set({ apiKey, baseUrl, updatedAt: new Date() })
			.where(eq(schema.providerSettings.id, existing[0].id));
	} else {
		await db.insert(schema.providerSettings).values({ userId, provider, apiKey, baseUrl });
	}
}

export async function deleteProviderCredential(
	userId: string,
	provider: ProviderId
): Promise<void> {
	await getDb()
		.delete(schema.providerSettings)
		.where(
			and(
				eq(schema.providerSettings.userId, userId),
				eq(schema.providerSettings.provider, provider)
			)
		);
}

/**
 * The last four characters of a stored key, e.g. `•••• 4f2a`. The suffix is
 * enough to confirm which key is configured without revealing it.
 */
export function maskKey(key: string | null | undefined): string | null {
	if (!key) return null;
	const suffix = key.slice(-4);
	return `•••• ${suffix}`;
}

export function isProbablyValidKey(key: string): boolean {
	return key.trim().length >= 8;
}
