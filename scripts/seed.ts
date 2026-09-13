import postgres from 'postgres';
import { randomBytes, scrypt as scryptCb, timingSafeEqual } from 'node:crypto';
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
const DEFAULT_PASSWORD = process.env.SEED_PASSWORD;
if (
	!DEFAULT_PASSWORD ||
	DEFAULT_PASSWORD === 'admin123' ||
	DEFAULT_PASSWORD.startsWith('replace-with-')
) {
	console.error('SEED_PASSWORD must be set to a non-default value');
	process.exit(1);
}

async function hashPassword(password: string) {
	const salt = randomBytes(16);
	const derived = await scrypt(password, salt, 64);
	return `scrypt:${salt.toString('hex')}:${derived.toString('hex')}`;
}

async function verifyPassword(password: string, stored: string | null) {
	if (!stored) return false;
	const [algo, saltHex, hashHex] = stored.split(':');
	if (algo !== 'scrypt' || !saltHex || !hashHex) return false;
	const expected = Buffer.from(hashHex, 'hex');
	const derived = await scrypt(password, Buffer.from(saltHex, 'hex'), expected.length);
	return derived.length === expected.length && timingSafeEqual(derived, expected);
}

// Re-running the seed is the documented way to change the bootstrap password, so
// SEED_PASSWORD is authoritative. Set SEED_KEEP_PASSWORD=true to preserve an
// intentional password change instead.
const keepPassword = /^(1|true|yes)$/i.test(process.env.SEED_KEEP_PASSWORD ?? '');

const passwordHash = await hashPassword(DEFAULT_PASSWORD);
await sql`
	insert into users (email, name, email_verified, role)
	values (${DEFAULT_EMAIL}, 'Admin', true, 'admin')
	on conflict (email) do update set
		name = excluded.name,
		email_verified = true,
		role = 'admin',
		updated_at = now()
`;
const [user] = await sql`select id from users where email = ${DEFAULT_EMAIL} limit 1`;
if (!user) throw new Error('Failed to create default user');

const [existing] =
	await sql`select password from accounts where issuer = 'local:credential' and account_id = ${user.id} limit 1`;
const passwordAlreadyMatches = existing
	? await verifyPassword(DEFAULT_PASSWORD, existing.password)
	: false;

if (existing && !passwordAlreadyMatches && keepPassword) {
	await sql`update accounts set updated_at = now() where issuer = 'local:credential' and account_id = ${user.id}`;
	console.warn(
		`SEED_KEEP_PASSWORD is set, so the existing password for ${DEFAULT_EMAIL} was left unchanged.`
	);
	console.warn('Unset SEED_KEEP_PASSWORD and re-run the seed to set it to SEED_PASSWORD.');
} else {
	await sql`
		insert into accounts (provider_id, issuer, account_id, user_id, password)
		values ('credential', 'local:credential', ${user.id}, ${user.id}, ${passwordHash})
		on conflict (issuer, account_id) do update set
			password = excluded.password,
			updated_at = now()
	`;
	if (existing && !passwordAlreadyMatches) {
		console.log(`Reset the password for ${DEFAULT_EMAIL} to the configured SEED_PASSWORD.`);
	}
}

// Claim existing unowned data for the default user so nothing is lost.
await sql`update projects set user_id = ${user.id} where user_id is null`;
await sql`update conversations set user_id = ${user.id} where user_id is null`;
await sql`update provider_settings set user_id = ${user.id} where user_id is null`;

let [project] =
	await sql`select id from projects where user_id = ${user.id} and name = 'Mimin Coding Agent' limit 1`;
if (!project) {
	const [created] =
		await sql`insert into projects (user_id, name, description) values (${user.id}, 'Mimin Coding Agent', 'Development workspace for designing and building a lightweight multi-agent coding system.') returning id`;
	project = created;
}
if (project) {
	await sql`insert into conversations (user_id, project_id, title, model, enabled_tools) select ${user.id}, ${project.id}, 'Welcome to Mimin', 'openai/gpt-4o-mini', '["project_knowledge_search"]'::jsonb where not exists (select 1 from conversations where title = 'Welcome to Mimin')`;
	console.log(`Seeded project ${project.id}`);
}
console.log(`Default user: ${DEFAULT_EMAIL}`);
await sql.end();
