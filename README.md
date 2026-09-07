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
- Live model discovery for configured OpenAI, Anthropic, and Google providers
- Normalized tool registry
- `web_search` with Tavily support and a free DuckDuckGo fallback
- Optional Chrome/Chromium and Firefox bridge for agent-driven tabs and Google/Scholar research
- `project_knowledge_search` for project conversations
- Project file upload and deletion
- Basic text extraction for `.txt`, `.md`, and `.json`
- Bounded PDF text extraction for chat attachments and project knowledge
- Project knowledge chunking for basic text search
- Stop generation with `AbortController` and Pi agent abort
- Project and conversation CRUD
- Complete Projects UI for create, edit, delete, knowledge health, search, uploads, and project chats
- Project instructions applied to every agent turn, with project knowledge enabled automatically
- Persisted project-file extraction status, page/chunk counts, and errors
- Per-message chat attachments with persisted metadata and conversation history context
- Per-user provider API key settings with encrypted storage, masking, and env fallback
- PostgreSQL migration and seed script
- Normalized API errors
- Unit tests for validation, password hashing, tool registry, and provider settings

Not yet available:

- Registration and password reset
- OCR for image-only PDFs
- Provider adapter for web fetch
- Semantic embeddings and pgvector
- Full citation persistence from tool results to assistant messages

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
  - `GOOGLE_API_KEY` or `GEMINI_API_KEY`
- `PROVIDER_KEY_ENCRYPTION_SECRET` to encrypt user-saved provider keys at rest

Bun is compatible with the source code. The repository currently uses npm and a package lockfile for reproducible setup.

## Self-hosting with Docker

To self-host the entire stack (PostgreSQL + Mimin WebUI) using Docker Compose:

1. Copy `.env.example` to `.env` and set your provider keys and secrets:
   ```bash
   cp .env.example .env
   ```
2. Start the full application:
   ```bash
   docker compose up -d --build
   ```
   The container automatically waits for PostgreSQL, applies schema migrations, and provisions the default admin account.
3. Open `http://localhost:3000` (or `http://localhost:<PORT>` if `PORT` or `HOST_PORT` is customized).
   Default login:
   ```text
   email:    admin@mimin.local
   password: admin123
   ```
   (Set `SEED_PASSWORD` in `.env` to override the initial password).
4. Stop the services:
   ```bash
   docker compose down
   ```
   Persistent data is stored in the `mimin-postgres` (database) and `mimin-data` (file uploads) Docker volumes.

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
# Optional: improves web_search quality. Empty uses DuckDuckGo fallback.
WEB_SEARCH_API_KEY=your-tavily-key
PROVIDER_KEY_ENCRYPTION_SECRET=$(openssl rand -hex 32)
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

### Optional browser extension

Open **Settings → Browser Extension**, enable the bridge, and install the package for your browser. Reload Mimin in that same browser and check for **Connected**.

Mimin distinguishes three research and browser capabilities:

- **Web Search (`web_search`)**: Default server-side research provider (Tavily with DuckDuckGo fallback). General queries (e.g. “cari berita terbaru OpenAI” or “research agentic coding benchmark”) automatically route to `web_search` without touching the browser.
- **Browser Search (`browser_search`)**: Explicit Google or Google Scholar search through the user's real browser. Available only when the query explicitly targets Google or Scholar (e.g. “cari di Google tentang WebMCP” or “search Scholar for LLM hallucination”). Returns structured search results.
- **Browser Open (`browser_open`)**: Opens and reads public HTTP/HTTPS web pages through the browser (e.g. “buka https://example.com” or inspecting search results). Generic page reading requires user-granted website reading permission in the extension popup.

Deterministic per-turn tool gating ensures the model never receives ambiguous interchangeable search tools. When an explicit browser search intent is detected, `web_search` is hidden for that turn and browser tools are exposed.

The bridge is off by default and enabled per browser. Only a connected chat turn receives browser tools. By default, the extension has host permissions for Google and Google Scholar. For other public HTTP(S) websites, users can grant optional host permissions directly from the extension popup under **Public website reading**. If permission has not been granted, `browser_open` navigates to the page and returns `{ readable: false, reason: "host_permission_required" }` without reading page content. Existing tabs, browsing history, local addresses, and private networks are strictly protected and never accessed. CAPTCHA challenges require the user to complete them manually; Mimin never bypasses them. Keep the chat open while a browser tool runs.

If you installed an earlier Mimin Search popup, replace/reload it with the new package and reload Mimin. For hosted instances, build with `MIMIN_EXTENSION_ORIGINS` set to the comma-separated exact Mimin origins. Default origins are `http://localhost:5173` and `http://127.0.0.1:5173`.

The packages are generated automatically for development and production builds. You can also
generate them directly:

```bash
npm run extension:build
```

For local installation details, see [`browser-extension/README.md`](browser-extension/README.md).
Production releases should be signed and distributed through the Chrome Web Store and Mozilla
Add-ons so users receive normal installation prompts and automatic updates.

Browser commands travel over the chat SSE stream and results return through an authenticated,
one-time callback. Pending requests live in the server process; multi-instance deployments need
sticky routing for chat and result requests or a shared request broker.

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

- `users`: Better Auth users with UUID IDs, roles, verification, and ban metadata
- `accounts`: Better Auth credential accounts containing the migrated scrypt hashes
- `sessions`: Better Auth database sessions with metadata and 30-day expiry
- `verifications`: Better Auth verification records
- `provider_settings`: encrypted per-user provider keys and base URLs
- `projects`: project metadata and instructions, owned by a user
- `project_files`: file metadata, storage keys, extraction health, and indexed chunk counts
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

Authentication uses Better Auth 1.7.x with email/password, the Drizzle PostgreSQL adapter, and the Admin plugin. Existing scrypt hashes are verified in place and all legacy sessions are invalidated by migration `0005_better_auth`.

```text
POST /api/auth/sign-in/email
POST /api/auth/sign-out
GET  /api/auth/get-session
```

- Passwords are hashed with scrypt and a per-user salt; migrated hashes remain usable without resets.
- Better Auth owns `/api/auth/*`, including CSRF/origin protections and HTTP-only session cookies.
- `src/hooks.server.ts` redirects unauthenticated page requests to `/login` and exposes `event.locals.user` plus `event.locals.session`.
- Public registration is disabled. Administrators provision users from `/admin/users`; the page supports only listing and initial account creation.
- Every data API route requires a valid session and filters rows by `user_id`. Cross-user access returns `404` for list, read, update, and delete operations, so ownership cannot be probed.
- `/api/models` and `/api/tools` stay public because they expose no user data.

Deploy the migration and the Better Auth environment variables together. Every user must sign in again after cutover because legacy session cookies are deliberately not accepted.

## API

### Models and tools

```text
GET /api/models
GET /api/tools?projectId=:projectId
```

`/api/models` queries each configured provider's model-list endpoint and returns normalized model metadata, including provider, context window, capabilities, source (`live` or `catalog`), and server-side configuration status. Unconfigured providers retain their bundled catalog metadata for setup UI, while configured providers expose only models returned by their API. When a session is present, it also reports whether the user saved their own key for each provider (`userConfigured`). Provider discovery failures are returned in an `errors` array.

Project-only tools such as `project_knowledge_search` are returned only when `projectId` is provided.

### Providers

```text
GET    /api/providers
POST   /api/providers
PUT    /api/providers/:provider
DELETE /api/providers/:provider
```

Users can save their own API keys per provider (currently `openai`, `anthropic`, and `google`). Keys are encrypted at rest with AES-256-GCM using a key derived from `PROVIDER_KEY_ENCRYPTION_SECRET`, and never returned to the browser; the API responds with a masked form such as `•••• 4f2a`. When no user key is saved, the server environment variable is used as fallback (`OPENAI_API_KEY`, `ANTHROPIC_API_KEY`, and `GOOGLE_API_KEY` or `GEMINI_API_KEY` for Google). An optional `baseUrl` can be saved to route provider requests to a custom endpoint.

`POST /api/providers` creates a user-owned custom provider. The settings UI includes templates for every Pi HTTP protocol that fits an API key/base URL connection: OpenAI Chat Completions, OpenAI Responses, Anthropic Messages, Google Generative AI, Mistral Conversations, Pi Messages, and Azure OpenAI Responses. Model IDs are automatically retrieved from the endpoint when saving the connection, or can be specified manually. API keys are optional for keyless local servers.

```bash
curl -X PUT http://localhost:5173/api/providers/openai \
  -H 'content-type: application/json' \
  -d '{"apiKey":"sk-...","baseUrl":"https://gateway.example.com/v1"}'

curl -X DELETE http://localhost:5173/api/providers/openai
```

The provider settings page lives at `/settings`.

Custom provider and search endpoints must be approved by the server operator using
`OUTBOUND_ALLOWED_ORIGINS`. Set a comma-separated list of exact origins (scheme,
hostname, and port), for example:

```env
OUTBOUND_ALLOWED_ORIGINS=http://localhost:11434,https://gateway.example.com
```

The built-in OpenAI, Anthropic, Google, Tavily, DuckDuckGo, and default SearXNG
origins are already permitted. Origins configured through `SEARXNG_URL` or
`WEB_SEARCH_URL` are also permitted, including local services. Custom public
endpoints need approval just like local endpoints; existing saved custom endpoints
must be added before they can be used. Only approve services you trust: approval
permits requests to paths on that origin. Search and model discovery reject
redirects and URLs containing embedded credentials. Discovery only reuses a saved
provider key for its configured origin.

Overlapping message requests in one conversation return `409 CONVERSATION_BUSY`
without creating another message. Turn reservations and Stop currently operate
within one application process; a deployment with multiple server processes needs
shared coordination before enabling concurrent instances.

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

### Skills

Use **Skills** in the navigation to create reusable personal or project skills with instructions, configurable tool presets, and up to 12 trigger phrases. Personal skills work in any chat; project skills work only in that project. The Chat skill picker activates a skill for future turns and replaces the selected tools with its preset, while keeping project knowledge enabled. Tools can still be changed manually; removing a skill leaves the current tools selected.

Draft suggestions match trigger phrases locally and require confirmation. Accepting a suggestion activates the skill without sending the draft. Dismissed suggestions stay hidden until the draft is cleared or submitted. Editing or deleting a skill does not change saved conversation or message snapshots; selecting it again applies its latest version. Retries use the original turn's skill instructions.

- `GET /api/skills`: list owned skills; optional `projectId` includes personal skills and that project's skills.
- `POST /api/skills`: create a skill with `name`, `description`, `instructions`, `projectId`, `enabledTools`, and `triggerPhrases`.
- `GET/PATCH/DELETE /api/skills/[id]`: read, update, or delete an owned skill.
- Conversation create/update accepts `skillId`: omit to preserve, pass an ID to activate, or pass `null` to remove.

Apply the new `0011` migration with `npm run db:migrate` before using Skills on an existing database.

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

#### Chat attachments

The chat composer accepts up to 5 attachments per message. Supported formats are `.txt`, `.md`, `.json`, and `.pdf`; each file and the combined attachments are limited to 25 MB. Plain-text and extractable PDF text are included as bounded, clearly delimited reference context for the agent (including attachments from earlier turns) without changing the visible or stored message text. PDF extraction runs once at upload with limits of 100 pages, 500,000 extracted characters, 10 seconds, and 16 MP per image resource. Empty, corrupt, and password-protected PDFs remain stored with an extraction status/error; image-only PDFs currently produce no text.

Multipart requests use `content`, optional `model`, and repeated `files` fields:

```bash
curl -X POST http://localhost:5173/api/conversations/CONVERSATION_ID/messages \
  -F 'content=Summarize these notes' \
  -F 'files=@notes.md'
```

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
- User-defined providers using the supported Pi protocol templates

Provider keys never appear in model API responses or browser code. Each conversation turn resolves the provider key for the owning user: a key saved in the user's provider settings wins, otherwise the server environment variable is used.

## Knowledge retrieval

The first retrieval implementation uses text search:

```text
upload file
    ↓
validate and store file
    ↓
extract TXT/MD/JSON/PDF
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
/settings                          Provider API key settings
```

The chat frontend uses `src/lib/client/api.ts` to create conversations and read SSE streams. Projects pages use authenticated live API state and surface loading, extraction-health, empty, and failure states explicitly.

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
19 tests passed

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
Provider settings       save/encrypt/mask/delete verified
```

## Known limitations and next steps

1. Add registration and password reset flows.
2. Add OCR for image-only PDFs.
3. Add web fetch with SSRF protection and connect citation persistence to normalized web sources.
4. Add integration tests with disposable PostgreSQL.
5. Add an explicit deployment adapter, such as Node or Cloudflare.

## Indonesian documentation

See [README.id.md](README.id.md) for the Indonesian version.
