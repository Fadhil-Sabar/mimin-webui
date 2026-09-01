import { randomBytes, scrypt as scryptCb, timingSafeEqual } from 'node:crypto';
import { promisify } from 'node:util';

const scrypt = promisify(scryptCb) as (
	password: string,
	salt: Buffer,
	keylen: number
) => Promise<Buffer>;

export async function hashPassword(password: string): Promise<string> {
	const salt = randomBytes(16);
	const derived = await scrypt(password, salt, 64);
	return `scrypt:${salt.toString('hex')}:${derived.toString('hex')}`;
}

export async function verifyPassword(password: string, stored: string): Promise<boolean> {
	const [algo, saltHex, hashHex] = stored.split(':');
	if (algo !== 'scrypt' || !saltHex || !hashHex) return false;
	const salt = Buffer.from(saltHex, 'hex');
	const expected = Buffer.from(hashHex, 'hex');
	const derived = await scrypt(password, salt, expected.length);
	return derived.length === expected.length && timingSafeEqual(derived, expected);
}
