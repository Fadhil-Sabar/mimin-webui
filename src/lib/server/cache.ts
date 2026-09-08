import { createHash } from 'node:crypto';

type CacheEntry<V> = { value: V; expiresAt: number };

export type BoundedTtlLruCacheOptions = {
	maxEntries: number;
	ttlMs: number;
	now?: () => number;
};

/** A small in-memory cache with explicit TTL expiry and LRU capacity eviction. */
export class BoundedTtlLruCache<K, V> {
	private readonly entries = new Map<K, CacheEntry<V>>();
	private readonly now: () => number;
	private readonly maxEntries: number;
	private readonly ttlMs: number;

	constructor(options: BoundedTtlLruCacheOptions) {
		if (!Number.isInteger(options.maxEntries) || options.maxEntries < 1)
			throw new Error('maxEntries must be a positive integer');
		if (!Number.isFinite(options.ttlMs) || options.ttlMs < 0)
			throw new Error('ttlMs must be a non-negative number');
		this.maxEntries = options.maxEntries;
		this.ttlMs = options.ttlMs;
		this.now = options.now ?? Date.now;
	}

	get size(): number {
		this.cleanup();
		return this.entries.size;
	}

	get(key: K): V | undefined {
		const entry = this.entries.get(key);
		if (!entry) return undefined;
		if (entry.expiresAt <= this.now()) {
			this.entries.delete(key);
			return undefined;
		}
		this.entries.delete(key);
		this.entries.set(key, entry);
		return entry.value;
	}

	set(key: K, value: V, ttlMs = this.ttlMs): void {
		this.entries.delete(key);
		this.entries.set(key, { value, expiresAt: this.now() + ttlMs });
		this.cleanup();
		while (this.entries.size > this.maxEntries) {
			const oldest = this.entries.keys().next().value as K;
			this.entries.delete(oldest);
		}
	}

	delete(key: K): boolean {
		return this.entries.delete(key);
	}

	clear(): void {
		this.entries.clear();
	}

	cleanup(): number {
		const now = this.now();
		let removed = 0;
		for (const [key, entry] of this.entries) {
			if (entry.expiresAt <= now) {
				this.entries.delete(key);
				removed += 1;
			}
		}
		return removed;
	}
}

/** Return a one-way credential fingerprint suitable for cache keys. */
export function hashSecret(secret: string): string {
	return createHash('sha256').update(secret).digest('hex');
}
