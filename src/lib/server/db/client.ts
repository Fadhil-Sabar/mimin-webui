import { drizzle } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';
import { env } from '$env/dynamic/private';
import * as schema from './schema';

let db: ReturnType<typeof drizzle<typeof schema>> | undefined;

export function getDb() {
	if (db) return db;
	const url = env.DATABASE_URL;
	if (!url) throw new Error('DATABASE_URL is not configured');
	const client = postgres(url, { max: 10, prepare: false });
	db = drizzle(client, { schema });
	return db;
}

export { schema };
