import { execFileSync } from 'node:child_process';
import postgres from 'postgres';

function npmCommand() {
	return process.platform === 'win32' ? 'npm.cmd' : 'npm';
}

export default async function globalSetup() {
	const databaseUrl =
		process.env.PLAYWRIGHT_DATABASE_URL ??
		process.env.TEST_DATABASE_URL ??
		process.env.DATABASE_URL ??
		'postgres://mimin:mimin@127.0.0.1:5432/mimin_playwright';

	const env = {
		...process.env,
		DATABASE_URL: databaseUrl,
		TEST_DATABASE_URL: databaseUrl,
		SEED_PASSWORD: process.env.PLAYWRIGHT_SEED_PASSWORD ?? 'playwright-e2e-password'
	};

	execFileSync(npmCommand(), ['run', 'db:migrate'], { env, stdio: 'inherit' });

	// CI gives this suite a dedicated database. Resetting it makes local reruns just
	// as deterministic and prevents a previous browser run from changing the seed.
	if (/^(1|true|yes)$/i.test(process.env.PLAYWRIGHT_RESET_DB ?? '')) {
		const sql = postgres(databaseUrl, { max: 1 });
		try {
			await sql`truncate table users, projects, conversations, provider_settings restart identity cascade`;
		} finally {
			await sql.end();
		}
	}

	execFileSync(npmCommand(), ['run', 'db:seed'], { env, stdio: 'inherit' });
}
