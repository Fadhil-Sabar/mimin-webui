# Mimin WebUI

Mimin WebUI is a project-based AI agent workspace. It combines chat, project knowledge, model discovery, tool execution, and persistent conversations in one minimal interface.

The frontend uses **SvelteKit 5**, **TypeScript**, **Tailwind CSS v4**, and **Lucide**. The backend runs on SvelteKit server routes with **PostgreSQL**, **Drizzle ORM**, `@earendil-works/pi-agent-core`, and `@earendil-works/pi-ai`.

## Implementation status

Available:

- Authentication with email/password and session cookies
- Ownership filters on all projects, conversations, and files
- Home workspace with chat composer
- Chat room with SSE response streaming
- Persistent projects and conversations
- Model catalog from Pi AI
- Normalized tool registry
- `project_knowledge_search` for project conversations
- Project file upload and deletion
- Basic text extraction for `.txt`, `.md`, and `.json`
- Project knowledge chunking for basic text search
- Stop generation with `AbortController` and Pi agent abort
- Project and conversation CRUD
- Projects dashboard and project overview pages on live API state (list, create, upload, delete, start chat)
- PostgreSQL migration and seed script
- Normalized API errors
- Unit tests for validation, password hashing, and tool registry

Not yet available:

- Registration and password reset
- PDF text extraction
- Provider adapters for web search and web fetch
- Chat attachment processing
- Semantic embeddings and pgvector
- Full citation persistence from tool results to assistant messages
- Explicit production deployment adapter

## Architecture

```text
┌────────────────────────────────────────────┐
│ SvelteKit UI                               │
│ Login · Home · Chat · Projects · Overview  │
└──────────────────┬─────────────────────────┘
                   │ REST + Server-Sent Events
┌──────────────────▼─────────────────────────┐
│ SvelteKit API routes                       │
│ Auth · Projects · Conversations · Files    │
│ Models · Tools · Messages · Stop           │
└──────┬──────────────────────┬───────────────┘
       │                      │
┌──────▼───────┐      ┌───────▼────────────────┐
│ PostgreSQL   │      │ Application AI layer    │
│ Drizzle ORM  │      │ Agent service           │
│              │      │ pi-agent-core           │
│ users        │      │ pi-ai model/provider    │
│ sessions     │      │ Tool registry           │
│ projects     │      └─────────────────────────┘
│ conversations│
│ messages     │      ┌─────────────────────────┐
│ tool_calls   │      │ Local file storage       │
│ sources      │      │ STORAGE_PATH             │
│ knowledge    │      └─────────────────────────┘
└──────────────┘
```

Domain and runtime logic are separated under `src/lib/server`:

```text
src/
├── lib/
│   ├── client/api.ts
│   └── server/
│       ├── ai/
│       │   ├── agent.service.ts
│       │   ├── model.service.ts
│       │   └── tools/
│       ├── auth.ts
│       ├── password.ts
│       ├── db/
│       │   ├── client.ts
│       │   └── schema.ts
│       ├── files/storage.ts
│       ├── api.ts
│       └── validation.ts
├── hooks.server.ts
└── routes/
    ├── login/
    └── api/
```

Route handlers validate input and orchestrate services. Agents are not constructed ad hoc inside every endpoint.

## Requirements

- Node.js 22+ or Bun
- Docker, when using the local PostgreSQL compose setup
- PostgreSQL 17+
- At least one provider key for live responses:
  - `OPENAI_API_KEY`
  - `ANTHROPIC_API_KEY`
  - `GOOGLE_API_KEY`

Bun is compatible with the source code. The repository currently uses npm and a package lockfile for reproducible setup.

## Local setup

```bash
git clone git@github.com:Fadhil-Sabar/mimin-webui.git
cd mimin-webui
npm install
cp .env.example .env
```

Set the required values in `.env`:

```env
DATABASE_URL=postgres://mimin:mimin@localhost:5432/mimin
OPENAI_API_KEY=your-provider-key
STORAGE_DRIVER=local
STORAGE_PATH=./data/uploads
```

Provider keys are read only on the server. Do not put them in source code or send them to the browser.

Start PostgreSQL, apply the schema, seed initial data, and start the app:

```bash
docker compose up -d postgres
npm run db:migrate
npm run db:seed
npm run dev
```

Open `http://localhost:5173`.

The seed script creates a default account:

```text
email:    admin@mimin.local
password: admin123
```

Set `SEED_PASSWORD` in the environment before running `npm run db:seed` to override the default password.

Stop the local database with:

```bash
docker compose down
```

PostgreSQL data is stored in the `mimin-postgres` Docker volume.

## Database

The Drizzle schema is located at:

```text
src/lib/server/db/schema.ts
```

Generated migrations are located under:

```text
drizzle/
├── 0000_cynical_hardball.sql
└── meta/
```

Main tables:

- `users`: accounts with scrypt password hashes
- `sessions`: bearer tokens (SHA-256 hashes) with expiry
- `projects`: project metadata and instructions, owned by a user
- `project_files`: file metadata and storage keys
- `project_file_chunks`: text chunks for retrieval
- `conversations`: standalone or project conversations, owned by a user
- `messages`: user, assistant, system, and tool state
- `tool_calls`: tool execution lifecycle
- `sources`: web or file sources
- `message_citations`: citation relationships

After changing the schema:

```bash
npm run db:generate
npm run db:migrate
```

The seed script creates the default `admin@mimin.local` account, claims existing rows for it, and seeds the initial `Mimin Coding Agent` project with a `Welcome to Mimin` conversation.

## Authentication

Authentication uses email and password with scrypt password hashing and HTTP-only session cookies.

```text
POST /api/auth/login
POST /api/auth/logout
GET  /api/auth/session
```

- Passwords are hashed with scrypt and a per-user salt; only the hash is stored.
- Session tokens are random 256-bit values; only their SHA-256 hashes are stored, and they expire after 30 days.
- The session cookie is `HttpOnly`, `SameSite=Lax`, and scoped to the app path.
- `src/hooks.server.ts` redirects unauthenticated page requests to `/login` and exposes `event.locals.user`.
- Every data API route requires a valid session and filters rows by `user_id`. Cross-user access returns `404` for list, read, update, and delete operations, so ownership cannot be probed.
- `/api/models` and `/api/tools` stay public because they expose no user data.

## API

### Models and tools

```text
GET /api/models
GET /api/tools?projectId=:projectId
```

`/api/models` returns normalized model metadata, including provider, context window, capabilities, and server-side configuration status.

Project-only tools such as `project_knowledge_search` are returned only when `projectId` is provided.

### Projects

```text
GET    /api/projects
POST   /api/projects
GET    /api/projects/:id
PATCH  /api/projects/:id
DELETE /api/projects/:id
```

Example:

```bash
curl -X POST http://localhost:5173/api/projects \
  -H 'content-type: application/json' \
  -d '{"name":"Product launch","description":"Launch workspace"}'
```

### Project files

```text
GET    /api/projects/:id/files
POST   /api/projects/:id/files
DELETE /api/projects/:id/files/:fileId
```

Upload files using multipart form data:

```bash
curl -X POST http://localhost:5173/api/projects/PROJECT_ID/files \
  -F 'file=@README.md'
```

Supported initial formats:

```text
.txt · .md · .json · .pdf
```

The maximum file size is 25 MB. Filenames are sanitized and path traversal is rejected.

### Conversations

```text
GET    /api/conversations
POST   /api/conversations
GET    /api/conversations/:id
PATCH  /api/conversations/:id
DELETE /api/conversations/:id
PATCH  /api/conversations/:id/settings
```

Standalone conversations use `projectId: null`. Project conversations store `projectId` and automatically receive `project_knowledge_search`.

### Messages and streaming

```text
POST /api/conversations/:id/messages
POST /api/conversations/:id/stop
```

Message requests accept content, a model reference, and enabled tools. The message endpoint returns `text/event-stream`.

Application-level events:

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

Pi internal event types are not exposed to the browser.

## AI runtime

`src/lib/server/ai/agent.service.ts` adapts Pi to the application domain:

- Loads conversation history from PostgreSQL
- Resolves models through `pi-ai`
- Creates an `Agent` from `pi-agent-core`
- Enables tools based on the conversation context
- Maps Pi events into application events
- Persists assistant messages and tool calls
- Supports cancellation by conversation ID

Registered providers:

- OpenAI
- Anthropic
- Google

Provider keys never appear in model API responses or browser code.

## Knowledge retrieval

The first retrieval implementation uses text search:

```text
upload file
    ↓
validate and store file
    ↓
extract TXT/MD/JSON
    ↓
chunk text
    ↓
store project_file_chunks
    ↓
project_knowledge_search
```

The full file is not injected into every model request. The tool returns only chunks matching the search query. Embeddings and pgvector can be added later without changing the tool contract.

## Frontend routes

```text
/login                             Sign in
/                                  Home composer
/chat                              Chat room and SSE response
/projects                          Project dashboard
/projects/:id                      Project overview and knowledge
```

The chat frontend uses `src/lib/client/api.ts` to create conversations and read SSE streams. The projects dashboard attempts to load data from the API and keeps a visual fallback when the backend is not configured.

## Development commands

```bash
npm run dev
npm run check
npm test
npm run build
npm run lint
npm run format

npm run db:generate
npm run db:migrate
npm run db:seed
```

## Verification

The latest verified commands:

```text
npm test
7 tests passed

npm run check
0 errors, 0 warnings

npm run build
success
```

PostgreSQL and API smoke tests verified:

```text
GET /api/projects       401 without session
GET /api/models         200
GET /api/tools          200
Login                   200 with default account
Cross-user project      404
Cross-user conversation 404
Project CRUD            create/read/delete verified
SSE provider guard      normalized error, no secret leak
```

## Known limitations and next steps

1. Add registration and password reset flows.
2. Add PDF extraction with time and memory limits.
3. Implement web search and web fetch adapters with SSRF protection.
4. Connect citation service to normalized tool sources.
5. Add chat attachments and message attachment relationships.
6. Add integration tests with disposable PostgreSQL.
7. Add an explicit deployment adapter, such as Node or Cloudflare.

## Indonesian documentation

See [README.id.md](README.id.md) for the Indonesian version.
