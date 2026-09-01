# Mimin WebUI

Mimin WebUI adalah workspace AI agent berbasis project. Aplikasi ini menggabungkan chat, project knowledge, model registry, tool execution, dan persistent conversation dalam satu antarmuka minimal.

Frontend menggunakan **SvelteKit 5**, **TypeScript**, **Tailwind CSS v4**, dan **Lucide**. Backend berjalan di SvelteKit server routes dengan **PostgreSQL**, **Drizzle ORM**, `@earendil-works/pi-agent-core`, dan `@earendil-works/pi-ai`.

## Status implementasi

Sudah tersedia:

- Home workspace dengan chat composer
- Chat room dengan SSE response stream
- Persistent project dan conversation
- Model catalog dari Pi AI
- Tool registry
- `project_knowledge_search` untuk project conversation
- Upload dan delete file project
- Text extraction sederhana untuk `.txt`, `.md`, dan `.json`
- Chunking project knowledge untuk basic text search
- Stop generation dengan `AbortController` dan Pi agent abort
- CRUD project dan conversation
- PostgreSQL migration dan seed script
- Normalized API errors
- Unit tests untuk validation dan tool registry

Belum tersedia:

- Authentication dan user ownership
- PDF text extraction
- Provider adapter untuk web search dan web fetch
- Chat attachment processing
- Semantic embeddings dan pgvector
- Citation persistence penuh dari tool result ke assistant message
- Production deployment adapter

## Arsitektur

```text
┌────────────────────────────────────────────┐
│ SvelteKit UI                               │
│ Home · Chat · Projects · Project Overview  │
└──────────────────┬─────────────────────────┘
                   │ REST + Server-Sent Events
┌──────────────────▼─────────────────────────┐
│ SvelteKit API routes                       │
│ Projects · Conversations · Files           │
│ Models · Tools · Messages · Stop           │
└──────┬──────────────────────┬───────────────┘
       │                      │
┌──────▼───────┐      ┌───────▼────────────────┐
│ PostgreSQL   │      │ Application AI layer    │
│ Drizzle ORM  │      │ Agent service           │
│              │      │ pi-agent-core           │
│ projects     │      │ pi-ai model/provider    │
│ conversations│      │ Tool registry           │
│ messages     │      └─────────────────────────┘
│ tool_calls   │
│ sources      │      ┌─────────────────────────┐
│ knowledge    │      │ Local file storage       │
└──────────────┘      │ STORAGE_PATH             │
                      └─────────────────────────┘
```

Domain dan runtime dipisahkan di `src/lib/server`:

```text
src/
├── lib/
│   ├── client/api.ts
│   └── server/
│       ├── ai/
│       │   ├── agent.service.ts
│       │   ├── model.service.ts
│       │   └── tools/
│       ├── db/
│       │   ├── client.ts
│       │   └── schema.ts
│       ├── files/storage.ts
│       ├── api.ts
│       └── validation.ts
└── routes/
    └── api/
```

Route handler melakukan validasi dan orkestrasi. Agent tidak dibuat langsung dari setiap endpoint.

## Requirements

- Node.js 22+ atau Bun
- Docker, jika ingin memakai PostgreSQL compose lokal
- PostgreSQL 17+
- Minimal satu provider key untuk live response:
  - `OPENAI_API_KEY`
  - `ANTHROPIC_API_KEY`
  - `GOOGLE_API_KEY`

Bun kompatibel dengan source code. Lockfile dan script repository saat ini menggunakan npm agar setup konsisten.

## Setup lokal

1. Clone repository dan masuk ke folder project:

```bash
git clone git@github.com:Fadhil-Sabar/mimin-webui.git
cd mimin-webui
```

2. Install dependency dan buat environment file:

```bash
npm install
cp .env.example .env
```

3. Isi `.env`:

```env
DATABASE_URL=postgres://mimin:mimin@localhost:5432/mimin
OPENAI_API_KEY=your-provider-key
STORAGE_DRIVER=local
STORAGE_PATH=./data/uploads
```

Provider key tetap hanya dibaca server-side. Jangan menaruhnya di source code atau mengirimnya ke browser.

4. Jalankan PostgreSQL lokal:

```bash
docker compose up -d postgres
```

5. Jalankan migration dan seed:

```bash
npm run db:migrate
npm run db:seed
```

6. Jalankan development server:

```bash
npm run dev
```

Buka `http://localhost:5173`.

Untuk mematikan database lokal:

```bash
docker compose down
```

Data PostgreSQL disimpan di Docker volume `mimin-postgres`.

## Database

Schema Drizzle berada di:

```text
src/lib/server/db/schema.ts
```

Migration berada di:

```text
drizzle/
├── 0000_cynical_hardball.sql
└── meta/
```

Table utama:

- `projects`: metadata project dan instructions
- `project_files`: metadata file dan storage key
- `project_file_chunks`: text chunks untuk retrieval
- `conversations`: chat standalone atau project chat
- `messages`: user, assistant, system, dan tool state
- `tool_calls`: lifecycle tool execution
- `sources`: sumber web atau file
- `message_citations`: relasi citation ke message

Setelah mengubah schema:

```bash
npm run db:generate
npm run db:migrate
```

Seed membuat project awal `Mimin Coding Agent` dan satu conversation `Welcome to Mimin`.

## API

### Models dan tools

```text
GET /api/models
GET /api/tools?projectId=:projectId
```

`/api/models` mengembalikan model normalized seperti:

```json
{
	"id": "gpt-4o-mini",
	"provider": "openai",
	"name": "GPT-4o Mini",
	"contextWindow": 128000,
	"capabilities": {
		"vision": true,
		"tools": true,
		"reasoning": false
	},
	"configured": false
}
```

Tool project-only seperti `project_knowledge_search` hanya muncul jika `projectId` diberikan.

### Projects

```text
GET    /api/projects
POST   /api/projects
GET    /api/projects/:id
PATCH  /api/projects/:id
DELETE /api/projects/:id
```

Contoh create:

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

Upload memakai multipart form dengan field `file`:

```bash
curl -X POST http://localhost:5173/api/projects/PROJECT_ID/files \
  -F 'file=@README.md'
```

Format awal yang diterima:

```text
.txt · .md · .json · .pdf
```

Ukuran maksimum adalah 25 MB. File disimpan di `STORAGE_PATH`. Filename disanitasi dan path traversal ditolak.

### Conversations

```text
GET    /api/conversations
POST   /api/conversations
GET    /api/conversations/:id
PATCH  /api/conversations/:id
DELETE /api/conversations/:id
PATCH  /api/conversations/:id/settings
```

Conversation standalone memakai `projectId: null`. Project conversation menyimpan `projectId` dan otomatis mendapatkan tool `project_knowledge_search`.

### Messages dan streaming

```text
POST /api/conversations/:id/messages
POST /api/conversations/:id/stop
```

Request message:

```json
{
	"content": "Summarize the project architecture",
	"model": "openai/gpt-4o-mini",
	"enabledTools": ["project_knowledge_search"]
}
```

Endpoint message mengembalikan `text/event-stream`. Event yang digunakan aplikasi:

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

Contoh delta:

```text
event: message.delta
data: {"type":"message.delta","messageId":"...","delta":"Project ini"}
```

Contoh error ter-normalisasi:

```json
{
	"type": "error",
	"error": {
		"code": "PROVIDER_NOT_CONFIGURED",
		"message": "This provider is not configured on the server."
	}
}
```

Stop request membatalkan agent yang sedang aktif dan meneruskan abort ke Pi runtime serta request provider jika didukung.

## AI runtime

`src/lib/server/ai/agent.service.ts` adalah adapter aplikasi terhadap Pi:

- Mengambil conversation dan history dari PostgreSQL
- Resolve model melalui `pi-ai`
- Membuat `Agent` dari `pi-agent-core`
- Mengaktifkan tool sesuai konteks project
- Mengubah Pi events menjadi application events
- Menyimpan assistant message dan tool calls
- Menyediakan cancellation berdasarkan conversation ID

Provider yang diregistrasikan:

- OpenAI
- Anthropic
- Google

API key tidak pernah dikirim melalui API response model.

## Knowledge retrieval

Tahap pertama menggunakan text retrieval:

```text
upload file
    ↓
validate + store file
    ↓
extract TXT/MD/JSON
    ↓
chunk text
    ↓
store project_file_chunks
    ↓
project_knowledge_search
```

`project_knowledge_search` tidak mengirim seluruh file ke model. Tool hanya mengembalikan chunk yang cocok dengan query. Embedding dan pgvector dapat ditambahkan kemudian tanpa mengubah kontrak tool.

## Frontend routes

```text
/                                  Home composer
/chat                              Chat room dan SSE response
/projects                          Project dashboard
/projects/mimin-coding-agent       Project overview dan knowledge
```

Chat frontend menggunakan `src/lib/client/api.ts` untuk membuat conversation dan membaca SSE stream. Projects dashboard mencoba mengambil data dari API dan mempertahankan fallback visual jika backend belum dikonfigurasi.

## Development commands

```bash
npm run dev          # development server
npm run check        # Svelte/type check
npm test             # Vitest unit tests
npm run build        # production build
npm run lint         # Prettier + ESLint
npm run format       # format source

npm run db:generate  # generate migration dari schema
npm run db:migrate   # apply migration ke DATABASE_URL
npm run db:seed      # seed project dan conversation awal
```

## Verification

Verifikasi terakhir yang dijalankan:

```text
npm test
4 tests passed

npm run check
0 errors, 0 warnings

npm run build
success
```

Smoke-test PostgreSQL dan API:

```text
GET /api/projects       200
GET /api/models         200
GET /api/tools          200
CRUD project            create/read/delete verified
SSE provider guard      normalized error, no secret leak
```

## Known limitations dan next steps

1. Tambahkan authentication dan filter ownership di semua query.
2. Tambahkan PDF extractor dengan batas waktu dan batas memory.
3. Implementasikan adapter web search dan web fetch dengan SSRF protection.
4. Hubungkan citation service ke normalized source dari tool result.
5. Tambahkan chat attachments dan relasi attachment ke message.
6. Migrasikan project overview dan chat history sepenuhnya ke shared API state.
7. Tambahkan integration test dengan disposable PostgreSQL.
8. Tambahkan adapter deployment yang eksplisit, misalnya Node atau Cloudflare.
