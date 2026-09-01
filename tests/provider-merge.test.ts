import { beforeAll, describe, expect, it, vi } from 'vitest';

beforeAll(() => {
	process.env.PROVIDER_KEY_ENCRYPTION_SECRET = 'test-secret-for-merge-tests';
});

const { encryptSecret, saveProviderCredential } =
	await import('../src/lib/server/ai/provider-settings.service');

function fakeDb(initialRow: { id: string; apiKey: string | null; baseUrl: string | null } | null) {
	const state = {
		row: initialRow,
		updated: null as Record<string, unknown> | null,
		inserted: null as Record<string, unknown> | null
	};
	const db = {
		select: () => ({
			from: () => ({
				where: () => ({ limit: async () => (state.row ? [state.row] : []) })
			})
		}),
		update: () => ({
			set: (values: Record<string, unknown>) => {
				state.updated = values;
				return { where: async () => undefined };
			}
		}),
		insert: () => ({
			values: (values: Record<string, unknown>) => {
				state.inserted = values;
				return { returning: () => Promise.resolve([]) };
			}
		})
	};
	return { db, state };
}

vi.mock('../src/lib/server/db/client', () => ({
	getDb: vi.fn(),
	schema: {
		providerSettings: {
			id: 'id',
			userId: 'user_id',
			provider: 'provider',
			apiKey: 'api_key',
			baseUrl: 'base_url',
			updatedAt: 'updated_at'
		}
	}
}));
const { getDb } = await import('../src/lib/server/db/client');

describe('saveProviderCredential merge semantics', () => {
	it('preserves the stored key when only the base URL is provided', async () => {
		const encrypted = await encryptSecret('sk-original-key-123456');
		const { db, state } = fakeDb({ id: 'row-1', apiKey: encrypted, baseUrl: null });
		vi.mocked(getDb).mockReturnValue(db as never);
		await saveProviderCredential('user-1', 'openai', { baseUrl: 'https://gateway.example.com/v1' });
		expect(state.updated?.apiKey).toBe(encrypted);
		expect(state.updated?.baseUrl).toBe('https://gateway.example.com/v1');
	});

	it('preserves the stored base URL when only a key is provided', async () => {
		const { db, state } = fakeDb({
			id: 'row-2',
			apiKey: null,
			baseUrl: 'https://gateway.example.com/v1'
		});
		vi.mocked(getDb).mockReturnValue(db as never);
		await saveProviderCredential('user-1', 'openai', { apiKey: 'sk-new-key-123456' });
		expect(state.updated?.apiKey).not.toBeNull();
		expect(state.updated?.baseUrl).toBe('https://gateway.example.com/v1');
	});

	it('clears the base URL when null is sent', async () => {
		const encrypted = await encryptSecret('sk-keep-key-123456');
		const { db, state } = fakeDb({
			id: 'row-3',
			apiKey: encrypted,
			baseUrl: 'https://gateway.example.com/v1'
		});
		vi.mocked(getDb).mockReturnValue(db as never);
		await saveProviderCredential('user-1', 'openai', { baseUrl: null });
		expect(state.updated?.apiKey).toBe(encrypted);
		expect(state.updated?.baseUrl).toBeNull();
	});

	it('inserts a fresh row when none exists', async () => {
		const { db, state } = fakeDb(null);
		vi.mocked(getDb).mockReturnValue(db as never);
		await saveProviderCredential('user-1', 'openai', { apiKey: 'sk-fresh-123456' });
		expect(state.inserted?.userId).toBe('user-1');
		expect(state.inserted?.provider).toBe('openai');
		expect(state.inserted?.apiKey).not.toBeNull();
	});
});
