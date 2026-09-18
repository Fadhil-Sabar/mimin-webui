# Mimin API and tools

[Back to the README](../README.md) · [Architecture](architecture.md) · [Project knowledge](knowledge.md)

This guide documents authentication, the application API, streaming events, and
the server-side research tools. All data endpoints require an authenticated
session unless noted otherwise.

## Authentication

Authentication uses Better Auth 1.7.x with email/password, the Drizzle
PostgreSQL adapter, and the Admin plugin. Existing scrypt hashes are verified
in place, and all legacy sessions are invalidated by migration `0005_better_auth`.

```text
POST /api/auth/sign-in/email
POST /api/auth/sign-out
GET  /api/auth/get-session
POST /api/auth/request-password-reset
POST /api/auth/reset-password
```

- Passwords use scrypt with a per-user salt; migrated hashes remain usable
  without resets.
- Better Auth owns `/api/auth/*`, including CSRF/origin protections and
  HTTP-only session cookies.
- [`src/hooks.server.ts`](../src/hooks.server.ts) redirects unauthenticated
  page requests to `/login` and exposes `event.locals.user` and
  `event.locals.session`.
- Public registration is disabled. Administrators provision users from
  `/admin/users`; the page supports listing and initial account creation.
- Password reset is available to everyone. A link requested at
  `/forgot-password` is single-use, expires after one hour, and signs out all
  existing sessions when used. With `SMTP_HOST`, the app emails the link;
  without it, the link is written to the server log and administrators can
  create and copy one from `/admin/users`. Reset responses are identical for
  known and unknown addresses. `/api/admin/users/:id/reset-link` is
  administrator-only, and Better Auth rate-limits the public endpoint to three
  requests per minute per client in production.
- Every data API route requires a valid session and filters rows by `user_id`.
  Cross-user list, read, update, and delete operations return `404` so
  ownership cannot be probed.
- `/api/models` remains public because it exposes no user data and provides
  setup information for the sign-in screen.

Deploy the database migration and Better Auth environment variables together.
Every user must sign in again after cutover because legacy session cookies are
deliberately not accepted.

## Models and tools

```text
GET /api/models
GET /api/tools?projectId=:projectId
GET /api/tools?includeProjectTools=true
```

`/api/models` queries each configured provider's model-list endpoint and returns
normalized metadata: provider, context window, capabilities, source (`live` or
`catalog`), and server-side configuration status. Unconfigured providers retain
bundled catalog metadata for setup UI; configured providers expose only models
returned by their API. An authenticated response also reports whether the user
saved a key for each provider (`userConfigured`). Provider discovery failures
appear in an `errors` array.

Project-only tools such as `project_knowledge_search` appear when `projectId`
is supplied. `/api/tools` requires a session, and `projectId` must reference a
project owned by the signed-in user; another user's project returns `404`.
Callers without a single project, such as the Skills editor, request these
entries with `includeProjectTools=true`.

## Providers

```text
GET    /api/providers
POST   /api/providers
PUT    /api/providers/:provider
DELETE /api/providers/:provider
```

Users can save API keys for `openai`, `anthropic`, and `google`. Keys are
encrypted at rest with AES-256-GCM using a key derived from
`PROVIDER_KEY_ENCRYPTION_SECRET` and are never returned to the browser; the API
returns a masked value such as `•••• 4f2a`. Without a saved user key, the server
uses `OPENAI_API_KEY`, `ANTHROPIC_API_KEY`, or `GOOGLE_API_KEY`/`GEMINI_API_KEY`.
An optional `baseUrl` routes requests to a custom endpoint.

`POST /api/providers` creates a user-owned custom provider. The settings UI
offers templates for the supported Pi HTTP protocols: OpenAI Chat Completions,
OpenAI Responses, Anthropic Messages, Google Generative AI, Mistral
Conversations, Pi Messages, and Azure OpenAI Responses. Model IDs are fetched
when saving a connection or can be entered manually. API keys are optional for
keyless local servers.

```bash
curl -X PUT http://localhost:5173/api/providers/openai \
  -H 'content-type: application/json' \
  -d '{"apiKey":"sk-...","baseUrl":"https://gateway.example.com/v1"}'

curl -X DELETE http://localhost:5173/api/providers/openai
```

The provider settings page is at `/settings`.

Custom provider and search endpoints require operator approval through
`OUTBOUND_ALLOWED_ORIGINS`, a comma-separated list of exact origins (scheme,
hostname, and port):

```env
OUTBOUND_ALLOWED_ORIGINS=http://localhost:11434,https://gateway.example.com
```

Built-in OpenAI, Anthropic, Google, Tavily, DuckDuckGo, and default SearXNG
origins are already permitted. Origins configured through `SEARXNG_URL` or
`WEB_SEARCH_URL` are also permitted, including local services. Existing saved
custom endpoints must be added before use. Approval permits requests to paths
on that origin, so only approve services you trust. Search and model discovery
reject redirects and URLs with embedded credentials. Discovery reuses a saved
provider key only for its configured origin.

Overlapping message requests in one conversation return `409 CONVERSATION_BUSY`
without creating another message. Turn reservations and Stop operate within one
application process; multi-process deployments need shared coordination before
enabling concurrent instances.

## Projects

```text
GET    /api/projects
POST   /api/projects
GET    /api/projects/:id
PATCH  /api/projects/:id
DELETE /api/projects/:id
```

```bash
curl -X POST http://localhost:5173/api/projects \
  -H 'content-type: application/json' \
  -d '{"name":"Product launch","description":"Launch workspace"}'
```

## Project files

```text
GET    /api/projects/:id/files
POST   /api/projects/:id/files
DELETE /api/projects/:id/files/:fileId
```

Upload files as multipart form data:

```bash
curl -X POST http://localhost:5173/api/projects/PROJECT_ID/files \
  -F 'file=@README.md'
```

Project Knowledge initially supports `.txt`, `.md`, `.json`, and `.pdf` files.
The maximum file size is 25 MB. Filenames are sanitized and path traversal is
rejected.

## Skills

The Skills navigation creates reusable personal or project skills with
instructions, configurable tool presets, and up to 12 trigger phrases. Personal
skills work in any chat; project skills work only in that project. The Chat
skill picker activates a skill for future turns and replaces the selected tools
with its preset while keeping project knowledge enabled. Tools can still be
changed manually; removing a skill leaves the current tools selected.

Draft suggestions match trigger phrases locally and require confirmation.
Accepting a suggestion activates the skill without sending the draft. Dismissed
suggestions stay hidden until the draft is cleared or submitted. Editing or
deleting a skill does not change saved conversation or message snapshots;
selecting it again applies its latest version. Retries use the original turn's
skill instructions.

```text
GET    /api/skills
POST   /api/skills
GET    /api/skills/[id]
PATCH  /api/skills/[id]
DELETE /api/skills/[id]
```

- `GET /api/skills` lists owned skills; optional `projectId` includes personal
  skills and that project's skills.
- `POST /api/skills` accepts `name`, `description`, `instructions`, `projectId`,
  `enabledTools`, and `triggerPhrases`.
- `GET/PATCH/DELETE /api/skills/[id]` reads, updates, or deletes an owned skill.
- Conversation create/update accepts `skillId`: omit it to preserve the active
  skill, pass an ID to activate one, or pass `null` to remove it.

Apply migration `0011` with `npm run db:migrate` before using Skills on an
existing database.

## Conversations

```text
GET    /api/conversations
POST   /api/conversations
GET    /api/conversations/:id
PATCH  /api/conversations/:id
DELETE /api/conversations/:id
PATCH  /api/conversations/:id/settings
```

Standalone conversations use `projectId: null`. Project conversations store
`projectId` and automatically receive `project_knowledge_search`.

## Messages and streaming

```text
POST /api/conversations/:id/messages
POST /api/conversations/:id/stop
```

Message requests accept content, a model reference, and enabled tools. The
message endpoint returns `text/event-stream`.

### Chat attachments

The composer accepts up to five attachments per message. Supported formats are
`.txt`, `.md`, `.json`, `.pdf`, `.png`, `.jpg`, `.jpeg`, `.webp`, and `.gif`;
each file and the combined attachments are limited to 25 MB. Plain text and
extractable PDF text are included as bounded, clearly delimited reference
context for the agent, including attachments from earlier turns, without
changing visible or stored message text.

PDF extraction runs once at upload with limits of 100 pages, 500,000 extracted
characters, 10 seconds, and 16 MP per image resource. Empty, corrupt, and
password-protected PDFs remain stored with an extraction status/error; chat
attachments retain the existing visual fallback. Project Knowledge also runs
local OCR for sparse or image-only pages.

Images can be attached or pasted into the composer. They are sent as image
content, so the selected model must accept images; a model without vision fails
the turn with an explicit message. Image bytes are validated against their
declared type, capped at 8 MB each and 16 MB per turn, and served through
`GET /api/conversations/:id/attachments/:attachmentId` for transcript
thumbnails. Images are chat-only; project knowledge accepts text and PDF files.

Multipart requests use `content`, optional `model`, and repeated `files` fields:

```bash
curl -X POST http://localhost:5173/api/conversations/CONVERSATION_ID/messages \
  -F 'content=Summarize these notes' \
  -F 'files=@notes.md'
```

Application-level events are:

```text
turn.start
message.start
message.delta
message.end
tool.start
tool.update
tool.input
tool.end
turn.end
error
done
```

Pi internal event types are not exposed to the browser.

## Research tools

The browser bridge is optional. Setup, permissions, tab consent, interaction
behavior, and extension troubleshooting are documented in
[`browser-extension/README.md`](../browser-extension/README.md).

Mimin separates server-side research from explicit browser actions:

- **Web Search (`web_search`)** is the default server-side research provider:
  Tavily with DuckDuckGo fallback. General queries route here without touching
  the browser.
- **Web Fetch (`web_fetch`)** reads one specific public URL server-side and
  returns readable text, resolved title, and content type as a citation. HTML,
  JSON, XML, and plain text are supported.
- **Browser Search (`browser_search`)** performs explicit Google or Google
  Scholar searches through the user's browser.
- **Browser Open (`browser_open`)**, **Browser Tabs (`browser_tabs`)**,
  **Browser Read Tab (`browser_read_tab`)**, and **Browser Interact
  (`browser_interact`)** are available through the connected extension; see its
  README for the browser-side details.

When an explicit browser search intent is detected, `web_search` and
`web_fetch` are hidden for that turn and browser tools are exposed. This
per-turn gating keeps the model's available search tools unambiguous.

### `web_fetch` limits and safeguards

`web_fetch` reads at most 2 MB, returns at most 12,000 characters by default
(the model may request up to 50,000), follows at most five redirects, and gives
up after 15 seconds. It never runs JavaScript. JavaScript shells are read once
through the user's browser when the bridge is connected and labelled
`renderedBy: browser`; otherwise the shell and an explanation are returned.

Because the model chooses the URL, every request hop is validated:

- only `http(s)` URLs without embedded credentials are accepted;
- loopback, link-local (including `169.254.169.254` cloud metadata), private
  (`10/8`, `172.16/12`, `192.168/16`), carrier-grade NAT (`100.64/10`), IPv6
  unique-local, and link-local addresses are refused, along with `.localhost`,
  `.local`, and `.internal` names;
- the hostname is resolved before requesting it, so a public-looking name that
  resolves to a private address is refused;
- non-HTTPS origins must be approved in `OUTBOUND_ALLOWED_ORIGINS`, the same
  policy used by `web_search` and provider discovery; and
- binary responses such as PDFs are reported by content type instead of being
  returned as noise.

DuckDuckGo can be unreachable on networks where its DNS is blocked by an ISP.
Mimin resolves its real address over DNS over HTTPS. Its HTML endpoint can also
rate-limit a server IP with a CAPTCHA; use a Tavily key, set `SEARXNG_URL` to a
self-hosted SearXNG instance, or search through the user's browser when that
happens. `WEB_SEARCH_API_KEY` is optional; an empty value uses the DuckDuckGo
fallback.
