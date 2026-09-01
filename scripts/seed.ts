import postgres from 'postgres';

const url = process.env.DATABASE_URL;
if (!url) throw new Error('DATABASE_URL is required');
const sql = postgres(url);
await sql`insert into projects (name, description) values ('Mimin Coding Agent', 'Development workspace for designing and building a lightweight multi-agent coding system.') on conflict do nothing`;
const [project] = await sql`select id from projects where name = 'Mimin Coding Agent' limit 1`;
await sql`insert into conversations (project_id, title, model, enabled_tools) select ${project.id}, 'Welcome to Mimin', 'openai/gpt-4o-mini', '["project_knowledge_search"]'::jsonb where not exists (select 1 from conversations where title = 'Welcome to Mimin')`;
console.log(`Seeded project ${project.id}`);
await sql.end();
