import { describe, expect, it } from 'vitest';
import { hashPassword, verifyPassword } from '../src/lib/server/password';

describe('password hashing', () => {
	it('hashes and verifies a password', async () => {
		const hash = await hashPassword('correct horse battery staple');
		expect(hash.startsWith('scrypt:')).toBe(true);
		expect(await verifyPassword('correct horse battery staple', hash)).toBe(true);
	});
	it('rejects a wrong password', async () => {
		const hash = await hashPassword('right-password');
		expect(await verifyPassword('wrong-password', hash)).toBe(false);
	});
	it('rejects a malformed stored hash', async () => {
		expect(await verifyPassword('anything', 'not-a-hash')).toBe(false);
	});
});
