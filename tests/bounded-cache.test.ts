import { describe, expect, it, vi } from 'vitest';
import { BoundedTtlLruCache, hashSecret } from '../src/lib/server/cache';
import { credentialCacheKey } from '../src/lib/server/ai/model.service';

describe('BoundedTtlLruCache', () => {
	it('evicts the least recently used entry when capacity is exceeded', () => {
		const cache = new BoundedTtlLruCache<string, number>({ maxEntries: 2, ttlMs: 10_000 });
		cache.set('a', 1);
		cache.set('b', 2);
		expect(cache.get('a')).toBe(1);
		cache.set('c', 3);
		expect(cache.get('b')).toBeUndefined();
		expect(cache.get('a')).toBe(1);
		expect(cache.get('c')).toBe(3);
	});

	it('expires entries and removes them during cleanup', () => {
		vi.useFakeTimers();
		const cache = new BoundedTtlLruCache<string, number>({ maxEntries: 2, ttlMs: 100 });
		cache.set('a', 1);
		vi.advanceTimersByTime(101);
		expect(cache.get('a')).toBeUndefined();
		cache.set('b', 2);
		cache.set('c', 3);
		expect(cache.cleanup()).toBe(0);
		vi.useRealTimers();
	});

	it('hashes credentials without retaining the secret or its suffix', () => {
		const key = hashSecret('secret-key-123456');
		expect(key).not.toContain('secret-key-123456');
		expect(key).not.toContain('123456');
		expect(key).toMatch(/^[a-f0-9]{64}$/);
	});

	it('uses different credential fingerprints for same-length keys with same suffix', () => {
		const first = credentialCacheKey('user', 'openai', 'prefix-one-secret', null);
		const second = credentialCacheKey('user', 'openai', 'prefix-two-secret', null);
		expect(first).not.toBe(second);
		expect(first).not.toContain('secret');
		expect(second).not.toContain('secret');
	});
});
