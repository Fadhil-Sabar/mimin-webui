# Mimin WebUI

Mimin WebUI adalah workspace AI agent berbasis project. Aplikasi ini menggabungkan chat, project knowledge, model discovery, tool execution, dan persistent conversation dalam satu antarmuka minimal.

Frontend menggunakan **SvelteKit 5**, **TypeScript**, **Tailwind CSS v4**, dan **Lucide**. Backend berjalan di SvelteKit server routes dengan **PostgreSQL**, **Drizzle ORM**, `@earendil-works/pi-agent-core`, dan `@earendil-works/pi-ai`.

## Status implementasi

Sudah tersedia:

- Home workspace dengan chat composer
- Chat room dengan SSE response streaming
- Project dan conversation yang tersimpan secara persistent
- Model catalog dari Pi AI
- Tool registry ter-normalisasi
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
- Pemrosesan chat attachment
- Semantic embeddings dan pgvector
- Persistence citation penuh dari tool result ke assistant message
- Production deployment adapter eksplisit

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

Logic domain dan runtime dipisahkan di `src/lib/server`:

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

Route handler bertugas melakukan validasi dan orkestrasi service. Agent tidak dibuat secara ad hoc di setiap endpoint.

## Requirements

- Node.js 22+ atau Bun
- Docker, jika menggunakan setup PostgreSQL lokal
- PostgreSQL 17+
- Minimal satu provider key untuk live response:
  - `OPENAI_API_KEY`
  - `ANTHROPIC_API_KEY`
  - `GOOGLE_API_KEY`

Bun kompatibel dengan source code. Repository saat ini menggunakan npm dan lockfile agar setup reproducible.

## Setup lokal

```bash
git clone git@github.com:Fadhil-Sabar/mimin-webui.git
cd mimin-webui
npm install
cp .env.example .env
```

Isi `.env`:

```env
DATABASE_URL=postgres://mimin:mimin@localhost:5432/mimin
OPENAI_API_KEY=your-provider-key
STORAGE_DRIVER=local
STORAGE_PATH=./data/uploads
```

Provider key hanya dibaca server-side. Jangan menaruhnya di source code atau mengirimkannya ke browser.

Jalankan PostgreSQL, migration, seed, dan development server:

```bash
docker compose up -d postgres
npm run db:migrate
npm run db:seed
npm run dev
```

Buka `http://localhost:5173`.

Matikan database lokal dengan:

```bash
docker compose down
```

Data PostgreSQL disimpan di Docker volume `mimin-postgres`.

## Database

Schema Drizzle berada di:

```text
src/lib/server/db/schema.ts
```

Migration generated berada di:

```text
drizzle/
├── 0000_cynical_hardball.sql
└── meta/
```

Table utama:

- `projects`: metadata project dan instructions
- `project_files`: metadata file dan storage key
- `project_file_chunks`: text chunks untuk retrieval
- `conversations`: standalone atau project conversation
- `messages`: user, assistant, system, dan tool state
- `tool_calls`: lifecycle tool execution
- `sources`: sumber web atau file
- `message_citations`: relasi citation

Setelah mengubah schema:

```bash
npm run db:generate
npm run db:migrate
```

Seed script membuat project awal `Mimin Coding Agent` dan conversation `Welcome to Mimin`.

## API

### Models dan tools

```text
GET /api/models
GET /api/tools?projectId=:projectId
```

`/api/models` mengembalikan metadata model yang dinormalisasi, termasuk provider, context window, capabilities, dan status konfigurasi server.

Tool khusus project seperti `project_knowledge_search` hanya dikembalikan jika `projectId` diberikan.

### Projects

```text
GET    /api/projects
POST   /api/projects
GET    /api/projects/:id
PATCH  /api/projects/:id
DELETE /api/projects/:id
```

Contoh:

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

Upload menggunakan multipart form data:

```bash
curl -X POST http://localhost:5173/api/projects/PROJECT_ID/files \
  -F 'file=@README.md'
```

Format awal yang didukung:

```text
.txt · .md · .json · .pdf
```

Ukuran maksimum file adalah 25 MB. Filename disanitasi dan path traversal ditolak.

### Conversations

```text
GET    /api/conversations
POST   /api/conversations
GET    /api/conversations/:id
PATCH  /api/conversations/:id
DELETE /api/conversations/:id
PATCH  /api/conversations/:id/settings
```

Standalone conversation menggunakan `projectId: null`. Project conversation menyimpan `projectId` dan otomatis mendapatkan `project_knowledge_search`.

### Messages dan streaming

```text
POST /api/conversations/:id/messages
POST /api/conversations/:id/stop
```

Request message menerima content, model reference, dan enabled tools. Endpoint message mengembalikan `text/event-stream`.

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

Internal event type Pi tidak diteruskan ke browser.

## AI runtime

`src/lib/server/ai/agent.service.ts` menjadi adapter Pi untuk application domain:

- Memuat conversation history dari PostgreSQL
- Resolve model melalui `pi-ai`
- Membuat `Agent` dari `pi-agent-core`
- Mengaktifkan tool sesuai konteks conversation
- Memetakan Pi event menjadi application event
- Menyimpan assistant message dan tool calls
- Mendukung cancellation berdasarkan conversation ID

Provider yang diregistrasikan:

- OpenAI
- Anthropic
- Google

Provider key tidak pernah muncul di response model API atau browser code.

## Knowledge retrieval

Implementasi retrieval pertama menggunakan text search:

```text
upload file
    ↓
validasi dan simpan file
    ↓
extract TXT/MD/JSON
    ↓
chunk text
    ↓
simpan project_file_chunks
    ↓
project_knowledge_search
```

Seluruh isi file tidak diinjeksi ke setiap request model. Tool hanya mengembalikan chunk yang cocok dengan query. Embedding dan pgvector dapat ditambahkan kemudian tanpa mengubah kontrak tool.

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

## Verification terakhir

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
Project CRUD            create/read/delete verified
SSE provider guard      normalized error, no secret leak
```

## Dokumentasi bahasa Inggris

Lihat [README.md](README.md).

## Limitasi dan next steps

1. Tambahkan authentication dan ownership filter ke semua query.
2. Tambahkan PDF extraction dengan time dan memory limit.
3. Implementasikan adapter web search dan web fetch dengan SSRF protection.
4. Hubungkan citation service ke normalized source dari tool result.
5. Tambahkan chat attachment dan relasinya ke message.
6. Migrasikan project overview dan chat history sepenuhnya ke shared API state.
7. Tambahkan integration test dengan disposable PostgreSQL.
8. Tambahkan deployment adapter eksplisit, seperti Node atau Cloudflare.
