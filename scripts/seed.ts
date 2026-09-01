import postgres from 'postgres';
import { randomBytes, scrypt as scryptCb } from 'node:crypto';
import { promisify } from 'node:util';

const scrypt = promisify(scryptCb) as (
	password: string,
	salt: Buffer,
	keylen: number
) => Promise<Buffer>;

const url = process.env.DATABASE_URL;
if (!url) throw new Error('DATABASE_URL is required');
const sql = postgres(url);

const DEFAULT_EMAIL = 'admin@mimin.local';
const DEFAULT_PASSWORD = process.env.SEED_PASSWORD || 'admin123';

async function hashPassword(password: string) {
	const salt = randomBytes(16);
	const derived = await scrypt(password, salt, 64);
	return `scrypt:${salt.toString('hex')}:${derived.toString('hex')}`;
}

const passwordHash = await hashPassword(DEFAULT_PASSWORD);
await sql`
	insert into users (email, name, password_hash)
	values (${DEFAULT_EMAIL}, 'Admin', ${passwordHash})
	on conflict (email) do update set name = excluded.name
`;
const [user] = await sql`select id from users where email = ${DEFAULT_EMAIL} limit 1`;
if (!user) throw new Error('Failed to create default user');

// Claim existing unowned data for the default user so nothing is lost.
await sql`update projects set user_id = ${user.id} where user_id is null`;
await sql`update conversations set user_id = ${user.id} where user_id is null`;
await sql`update provider_settings set user_id = ${user.id} where user_id is null`;

await sql`insert into projects (user_id, name, description) values (${user.id}, 'Mimin Coding Agent', 'Development workspace for designing and building a lightweight multi-agent coding system.') on conflict do nothing`;
const [project] = await sql`select id from projects where name = 'Mimin Coding Agent' limit 1`;
await sql`insert into conversations (user_id, project_id, title, model, enabled_tools) select ${user.id}, ${project.id}, 'Welcome to Mimin', 'openai/gpt-4o-mini', '["project_knowledge_search"]'::jsonb where not exists (select 1 from conversations where title = 'Welcome to Mimin')`;
console.log(`Seeded project ${project.id}`);
console.log(`Default user: ${DEFAULT_EMAIL} / ${DEFAULT_PASSWORD}`);
await sql.end();
