import 'dotenv/config';
import postgres from 'postgres';
import { drizzle } from 'drizzle-orm/postgres-js';
import { migrate } from 'drizzle-orm/postgres-js/migrator';

const url = process.env.DATABASE_URL;
if (!url) {
	console.error('DATABASE_URL is required');
	process.exit(1);
}

const sql = postgres(url, { max: 1 });
const db = drizzle(sql);

try {
	console.log('Applying database migrations...');
	await migrate(db, { migrationsFolder: './drizzle' });
	console.log('Database migrations completed successfully.');
} catch (error) {
	console.error('Migration failed:', error);
	process.exit(1);
} finally {
	await sql.end();
}
