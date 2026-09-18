# Mimin architecture

[Back to the README](../README.md) · [API reference](api.md) · [Project knowledge](knowledge.md)

Mimin separates the SvelteKit UI and route handlers from domain and runtime
logic under [`src/lib/server`](../src/lib/server). Route handlers validate input
and orchestrate services; agents are not constructed ad hoc inside every
endpoint.

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

The main server boundaries are:

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

## Database

The authoritative Drizzle schema is
[`src/lib/server/db/schema.ts`](../src/lib/server/db/schema.ts). Generated
migrations live in [`drizzle/`](../drizzle/); the directory also contains the
migration metadata used by Drizzle. The schema and migration history are the
source of truth rather than any abbreviated table list here.

The primary tables are:

- `users`, `accounts`, `sessions`, and `verifications`: Better Auth identity,
  credential, session, and verification records;
- `provider_settings`: encrypted per-user provider keys and base URLs;
- `projects`, `project_files`, and `project_file_chunks`: project metadata,
  uploaded-file state, and retrieval chunks;
- `conversations`, `messages`, and `tool_calls`: conversation, message, and
  tool execution state; and
- `sources` and `message_citations`: web/file sources and citation
  relationships.

After changing the schema, generate and apply a migration:

```bash
npm run db:generate
npm run db:migrate
```

The seed script creates `admin@mimin.local`, claims existing rows for that
account, and seeds the initial `Mimin Coding Agent` project with a `Welcome to
Mimin` conversation. See the [bootstrap instructions](../README.md#3-sign-in-and-finish-bootstrap) for the required explicit
`SEED_PASSWORD` behavior.

## AI runtime

[`src/lib/server/ai/agent.service.ts`](../src/lib/server/ai/agent.service.ts)
adapts Pi to the application domain. For each turn it:

- loads conversation history from PostgreSQL;
- resolves models through `pi-ai`;
- creates an `Agent` from `pi-agent-core`;
- enables tools from the conversation context;
- maps Pi events into application events;
- persists assistant messages and tool calls; and
- supports cancellation by conversation ID.

Registered providers are OpenAI, Anthropic, Google, and user-defined providers
using the supported Pi protocol templates. Provider keys never appear in model
API responses or browser code. Each turn resolves the owning user's saved
provider key first, then the corresponding server environment variable.

## Frontend routes

```text
/login                             Sign in
/forgot-password                   Request a password reset link
/reset-password?token=...          Choose a new password
/                                  Home composer
/chat                              Chat room and SSE response
/projects                          Project dashboard
/projects/:id                      Project overview and knowledge
/settings                          Provider API key settings
```

The chat frontend uses
[`src/lib/client/api.ts`](../src/lib/client/api.ts) to create conversations
and read SSE streams. Project pages use authenticated live API state and expose
loading, extraction-health, empty, and failure states.
