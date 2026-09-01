# Mimin WebUI

SvelteKit frontend and application backend for a project-based AI agent workspace.

## Current architecture

```text
SvelteKit UI
    │ fetch + Server-Sent Events
    ▼
SvelteKit API routes
    ├── projects / conversations / files
    ├── models / tools
    └── conversation message stream
          │
          ├── Drizzle ORM → PostgreSQL
          ├── local file storage
          └── pi-agent-core → pi-ai → provider APIs
```

The UI remains the source of truth for the visual behavior. Domain logic is kept under `src/lib/server`, and route handlers only validate and orchestrate services.

## Requirements

- Node.js 22+ or Bun
- PostgreSQL 17+
- At least one provider key for live responses: `OPENAI_API_KEY`, `ANTHROPIC_API_KEY`, or `GOOGLE_API_KEY`

## Setup

```bash
cp .env.example .env
# edit .env and set DATABASE_URL plus a provider key
npm install

docker compose up -d postgres
npm run db:migrate
npm run db:seed
npm run dev
```

Default local database:

```text
postgres://mimin:mimin@localhost:5432/mimin
```

Bun is compatible with the application and can be used for the dev server and package installation. The current lockfile and scripts use npm for reproducible setup.

## API

```text
GET    /api/models
GET    /api/tools?projectId=:id

GET    /api/projects
POST   /api/projects
GET    /api/projects/:id
PATCH  /api/projects/:id
DELETE /api/projects/:id

GET    /api/projects/:id/files
POST   /api/projects/:id/files
DELETE /api/projects/:id/files/:fileId

GET    /api/conversations
POST   /api/conversations
GET    /api/conversations/:id
PATCH  /api/conversations/:id/settings

POST   /api/conversations/:id/messages  # SSE stream
POST   /api/conversations/:id/stop
```

SSE events are application-level events, not Pi internals:

```text
turn.start
message.start
message.delta
message.end
tool.start
tool.update
tool.end
turn.end
error
done
```

## Persistence

PostgreSQL is the source of truth. The initial migration includes:

- `projects`
- `project_files`
- `project_file_chunks`
- `conversations`
- `messages`
- `tool_calls`
- `sources`
- `message_citations`

Text and Markdown files are stored under `STORAGE_PATH` and chunked for basic project knowledge search. PDF metadata and bytes are stored, but PDF text extraction is the next increment.

## AI runtime

- `@earendil-works/pi-agent-core` owns the agent loop and cancellation.
- `@earendil-works/pi-ai` owns provider/model catalogs and streaming.
- Provider keys are only read server-side.
- Project conversations automatically receive `project_knowledge_search`.
- Web Search and Web Fetch currently expose normalized tool metadata; provider-backed implementations are intentionally not faked when no search credential is configured.

## Development commands

```bash
npm run dev
npm run check
npm test
npm run build
npm run db:generate
npm run db:migrate
npm run db:seed
npm run lint
```

## Tests

Unit tests currently cover request validation and tool registry behavior. Provider calls are not run in unit tests. Database and live provider integration tests should be added with a disposable test database and recorded provider adapters.

## Known limitations

- Authentication/user ownership is not implemented yet.
- PDF extraction is not implemented yet.
- Web Search/Web Fetch provider adapters are not implemented yet; no fake results are returned.
- Frontend project loading is partially connected; the remaining static project overview and history views will be migrated to shared API state next.
- Provider credentials and database configuration are required for the live chat path.
