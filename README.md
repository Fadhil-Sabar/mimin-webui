# Mimin WebUI

Mimin WebUI is a project-based AI agent workspace with chat, project knowledge, model discovery, tool execution, and persistent conversations.

[Bahasa Indonesia](README.id.md) · [Quick start](#quick-start) · [Documentation](#documentation) · [Contributing](CONTRIBUTING.md)

## Features

- **Chat:** streamed responses, conversation history, stop generation, and file or image attachments.
- **Projects:** organize conversations, manage files, and apply project instructions to every turn.
- **Knowledge:** PDF text extraction, local OCR, optional hybrid keyword/pgvector search, and persistent page-aware citations.
- **Providers:** discover models from OpenAI, Anthropic, Google, or custom endpoints; save encrypted per-user API keys.
- **Research:** web search via Tavily, DuckDuckGo, or SearXNG, plus public URL reading with a fallback for JavaScript pages when the browser extension is connected. Cited web sources are persisted with the message and survive reloads.
- **Browser bridge:** optional Chromium/Firefox extension for Google/Scholar search and permission-controlled tab reading and interaction.
- **Skills:** reusable personal or project instructions, tool presets, and trigger suggestions.
- **Accounts:** email/password sign-in, password reset, administrator-provisioned users, and ownership isolation for projects, conversations, and files.

Built with Svelte 5/SvelteKit, TypeScript, Tailwind CSS v4, Lucide, PostgreSQL, Drizzle ORM, and Pi (`pi-agent-core` / `pi-ai`).

## Requirements

- **Docker setup:** Git and Docker with Compose; the images include PostgreSQL 17 with pgvector and Tesseract OCR.
- **Local development:** also install Node.js 22+ and npm 10+. Install Tesseract with English/Indonesian language data for OCR; see the [knowledge guide](docs/knowledge.md).
- **AI responses:** configure a provider through environment variables or **Settings**. Built-in providers require an API key; custom local endpoints may be keyless.

An existing PostgreSQL 17+ server can replace the Compose database, but it must have pgvector installed before migrations run. The repository uses npm and its lockfile for reproducible setup; Bun is also source-compatible.

## Quick start

### 1. Get the code and configure the environment

```bash
git clone https://github.com/Fadhil-Sabar/mimin-webui.git
cd mimin-webui
cp .env.example .env
```

Generate independent secrets, then paste each command's output into the matching variable in `.env`:

```bash
openssl rand -hex 24     # POSTGRES_PASSWORD
openssl rand -base64 32  # BETTER_AUTH_SECRET
openssl rand -hex 32     # PROVIDER_KEY_ENCRYPTION_SECRET
openssl rand -base64 24  # SEED_PASSWORD
```

- Replace every `replace-with-...` value. Use the same `POSTGRES_PASSWORD` in `DATABASE_URL`; keep the other secrets independent.
- Set `OPENAI_API_KEY`, `ANTHROPIC_API_KEY`, or `GOOGLE_API_KEY` (`GEMINI_API_KEY` is also supported), or configure a provider after signing in.
- For an address other than the default localhost URL, set `BETTER_AUTH_URL` and `ORIGIN` to the exact origin you use, including scheme and port. Use HTTPS for public deployments.
- Keep secrets server-side and `.env` out of version control. All optional settings are documented in [.env.example](.env.example).

Choose one startup method below. Review the [deployment guide](docs/deployment.md) before exposing the app publicly.

### 2a. Run with Docker

```bash
docker compose up -d --build
```

Open **http://localhost:3000** (or the port set by `HOST_PORT` / `PORT`). Startup waits for PostgreSQL, applies migrations, and creates the initial administrator when `AUTO_SEED=true` and a non-default `SEED_PASSWORD` is configured.

### 2b. Run locally

```bash
npm ci --legacy-peer-deps
npm run playwright:install
docker compose up -d postgres
npm run db:migrate
npm run db:seed
npm run dev
```

Open **http://localhost:5173**. `DATABASE_URL` must point to your local database; adjust it if you changed the database credentials or port. Local OCR needs Tesseract, or set `PDF_OCR_ENABLED=false` to disable it.

### 3. Sign in and finish bootstrap

Sign in as **`admin@mimin.local`** using your **`SEED_PASSWORD`**. After the first successful bootstrap, set `AUTO_SEED=false`, remove `SEED_PASSWORD` from the runtime environment, and restart or recreate the app to apply the changes.

Re-running the seed resets that account to the supplied password. Use `SEED_KEEP_PASSWORD=true` to preserve a password already changed in the UI.

Stop Compose services with `docker compose down`. Data persists in `mimin-postgres` (database) and, for the full Docker stack, `mimin-data` (uploads). Local uploads use `STORAGE_PATH`, defaulting to `./data/uploads`.

## Using Mimin

### Accounts and providers

Public registration is disabled; administrators create users at `/admin/users`. Password reset links are single-use, expire after one hour, and sign out existing sessions when used. Configure SMTP to email links, or ask an administrator to create and copy one. See [password reset email](docs/deployment.md#password-reset-email).

Save provider connections in **Settings**. User API keys are encrypted at rest and take precedence over server environment keys. Custom provider/search origins require operator approval through `OUTBOUND_ALLOWED_ORIGINS`; see the [provider reference](docs/api.md#providers).

### Attachments and project knowledge

| Upload            | Supported formats                                                        | Limits                                           |
| ----------------- | ------------------------------------------------------------------------ | ------------------------------------------------ |
| Chat              | `.txt`, `.md`, `.json`, `.pdf`, `.png`, `.jpg`, `.jpeg`, `.webp`, `.gif` | 5 files; 25 MB per file and combined per message |
| Chat images       | Image formats above; requires a vision-capable model                     | 8 MB per image; 16 MB combined per turn          |
| Project knowledge | `.txt`, `.md`, `.json`, `.pdf`                                           | 25 MB per file; PDFs up to 100 pages             |

Project PDFs support local OCR and clickable page citations. Semantic retrieval is opt-in through `KNOWLEDGE_EMBEDDINGS_ENABLED=true` and sends extracted passages to the configured embedding provider; keyword search remains available if embeddings are disabled or fail. Use **Reindex** for existing files after changing extraction or embedding settings. See the [knowledge guide](docs/knowledge.md) for setup, upgrades, and limits.

### Optional browser extension

Open **Settings → Browser Extension**, enable the bridge, and install the package for your browser. Reload Mimin in that browser and check for **Connected**. Packages match the origin used to download them; set `MIMIN_EXTENSION_ORIGINS` for additional origins.

Grant **Tab reading & interaction** in the extension popup to read other public websites. Access to existing tabs also requires chat consent: **allow just once** or **allow for this conversation**. The bridge is off by default and excludes private/local addresses. See the [browser extension guide](browser-extension/README.md) for permissions, installation, and troubleshooting, and [research tools](docs/api.md#research-tools) for server-side search and URL reading.

## Development

| Command                                      | Purpose                                         |
| -------------------------------------------- | ----------------------------------------------- |
| `npm run dev`                                | Start the development server                    |
| `npm run check`                              | Check types and Svelte components               |
| `npm test`                                   | Run unit tests                                  |
| `npm run build`                              | Build for production                            |
| `npm run lint` / `npm run format`            | Check formatting/lint rules or apply formatting |
| `npm run db:generate` / `npm run db:migrate` | Generate or apply schema migrations             |

See [CONTRIBUTING.md](CONTRIBUTING.md#quality-checks) for the complete checks, including database integration and browser-extension validation.

## Documentation

- [Deployment](docs/deployment.md): secrets, SMTP, HTTPS, backups, scaling, and updates.
- [API and tools](docs/api.md): authentication, providers, skills, attachments, streaming, and research tools.
- [Architecture](docs/architecture.md): application structure, database, AI runtime, and routes.
- [Project knowledge](docs/knowledge.md): OCR, embeddings, retrieval, citations, and migration instructions.
- [Browser extension](browser-extension/README.md): installation, permissions, protocol, and browser checks.

## Known limitations

- Public self-registration is not available.
- Turn coordination, stop requests, browser consent grants, and question/consent prompts are coordinated through the database (`active_turns`, `browser_consent_grants`, `pending_turn_requests`), so multiple instances behind a load balancer share one live turn per conversation and answers reach the waiter whichever instance serves the POST. See [scaling notes](docs/deployment.md#5-scaling-limits).
- Deployment recipes target the Node adapter and single-host Docker Compose.

## Community and license

Contributions are welcome: read [CONTRIBUTING.md](CONTRIBUTING.md) and the [Code of Conduct](CODE_OF_CONDUCT.md). Report vulnerabilities through [SECURITY.md](SECURITY.md), and review [PRIVACY.md](PRIVACY.md) before hosting for others.

Licensed under the [GNU Affero General Public License v3.0 or later](LICENSE). Network deployments of modified versions must offer their corresponding source to users.
