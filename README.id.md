# Mimin WebUI

Mimin WebUI adalah workspace AI agent berbasis project. Aplikasi ini menggabungkan chat, project knowledge, model discovery, tool execution, dan persistent conversation dalam satu antarmuka minimal.

[Dokumentasi](#requirements) · [Kontribusi](CONTRIBUTING.md) · [Keamanan](SECURITY.md) · [Privasi](PRIVACY.md) · [Lisensi](LICENSE)

Frontend menggunakan **SvelteKit 5**, **TypeScript**, **Tailwind CSS v4**, dan **Lucide**. Backend berjalan di SvelteKit server routes dengan **PostgreSQL**, **Drizzle ORM**, `@earendil-works/pi-agent-core`, dan `@earendil-works/pi-ai`.

## Status implementasi

Sudah tersedia:

- Home workspace dengan chat composer
- Chat room dengan SSE response streaming
- Project dan conversation yang tersimpan secara persistent
- Discovery model live untuk provider OpenAI, Anthropic, dan Google yang dikonfigurasi
- Tool registry ter-normalisasi
- Bridge opsional Chrome/Chromium dan Firefox agar agent membuka tab dan mencari lewat Google/Scholar
- `web_fetch` untuk membaca satu URL publik tertentu (HTML, JSON, atau teks) dengan proteksi SSRF
- `project_knowledge_search` untuk project conversation
- Upload dan delete file project
- Text extraction sederhana untuk `.txt`, `.md`, dan `.json`
- PDF text extraction terbatas untuk chat attachment dan project knowledge
- Chunking project knowledge untuk basic text search
- Stop generation dengan `AbortController` dan Pi agent abort
- CRUD project dan conversation
- UI Projects lengkap untuk membuat, mengedit, menghapus, mencari, mengunggah knowledge, dan memulai chat project
- Instruksi project diterapkan pada setiap agent turn dan project knowledge aktif secara otomatis
- Status ekstraksi, jumlah halaman/chunk, dan error file project tersimpan secara persisten
- Pengaturan API key provider per pengguna dengan penyimpanan terenkripsi, masking, dan env fallback
- Attachment per message di chat dengan metadata persisten dan konteks riwayat percakapan
- PostgreSQL migration dan seed script
- Normalized API errors
- Unit tests untuk validation, password hashing, tool registry, dan provider settings

Belum tersedia:

- Registration dan password reset
- Rendering JavaScript untuk `web_fetch`; halaman yang dirender di sisi klien memerlukan browser bridge

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
  - `GOOGLE_API_KEY` atau `GEMINI_API_KEY`
- `PROVIDER_KEY_ENCRYPTION_SECRET` untuk mengenkripsi provider key milik pengguna

Bun kompatibel dengan source code. Repository saat ini menggunakan npm dan lockfile agar setup reproducible.

## Self-hosting dengan Docker

Untuk melakukan self-host seluruh sistem (PostgreSQL + Mimin WebUI) menggunakan Docker Compose:

1. Salin `.env.example` ke `.env` dan konfigurasikan API key provider serta secret:
   ```bash
   cp .env.example .env
   ```
   Ganti semua nilai `replace-with-...`. Gunakan perintah pembuat secret yang terdokumentasi di [`docs/deployment.md`](docs/deployment.md).
2. Jalankan seluruh aplikasi:
   ```bash
   docker compose up -d --build
   ```
   Container menunggu PostgreSQL, menerapkan migrasi, dan hanya membuat admin awal ketika `AUTO_SEED=true` serta `SEED_PASSWORD` non-default sudah diatur.
3. Buka `http://localhost:3000` (atau port yang disesuaikan pada `PORT` / `HOST_PORT`).
   Login awal:
   ```text
   email:    admin@mimin.local
   password: nilai SEED_PASSWORD
   ```
   Setelah bootstrap berhasil, atur `AUTO_SEED=false` dan hapus `SEED_PASSWORD` dari environment runtime.
4. Menghentikan service:
   ```bash
   docker compose down
   ```
   Data tersimpan secara persisten di Docker volume `mimin-postgres` (database) dan `mimin-data` (file upload).

## Setup lokal

```bash
git clone https://github.com/Fadhil-Sabar/mimin-webui.git
cd mimin-webui
npm ci --legacy-peer-deps
cp .env.example .env
```

Isi `.env`:

```env
DATABASE_URL=postgres://mimin:mimin@localhost:5432/mimin
OPENAI_API_KEY=your-provider-key
PROVIDER_KEY_ENCRYPTION_SECRET=$(openssl rand -hex 32)
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

### Extension browser opsional

Buka **Settings → Browser Extension**, aktifkan bridge, lalu pasang paket sesuai browser. Muat ulang Mimin di browser yang sama dan pastikan status **Connected**.

Mimin membedakan beberapa kapabilitas riset dan browser:

- **Web Search (`web_search`)**: Provider riset server-side default (Tavily dengan fallback DuckDuckGo). Permintaan riset umum (misalnya “cari berita terbaru OpenAI” atau “research agentic coding benchmark”) otomatis diarahkan ke `web_search` tanpa membuka browser.
- **Web Fetch (`web_fetch`)**: Membaca satu URL publik tertentu di sisi server (misalnya “baca https://example.com/docs” atau salah satu hasil `web_search`) dan mengembalikan teks yang dapat dibaca beserta judul dan content type sebagai sitasi. Mendukung HTML, JSON, XML, dan teks biasa.
- **Browser Search (`browser_search`)**: Pencarian Google atau Google Scholar melalui browser asli pengguna. Hanya aktif jika permintaan secara eksplisit menyebut Google atau Scholar (misalnya “cari di Google tentang WebMCP” atau “cari paper ini di Google Scholar”). Mengembalikan hasil pencarian terstruktur.
- **Browser Open (`browser_open`)**: Membuka dan membaca halaman web publik HTTP/HTTPS melalui browser (misalnya “buka https://example.com” atau meninjau hasil pencarian). Membaca website umum memerlukan izin baca website publik yang diberikan pengguna di popup extension.

Gating tool deterministik per-turn memastikan model tidak menerima dua tool pencarian yang saling tumpang tindih. Ketika intent browser terdeteksi, `web_search` dan `web_fetch` disembunyikan untuk giliran tersebut dan tool browser ditampilkan.

#### Batasan `web_fetch`

`web_fetch` membaca maksimal 2 MB per respons dan mengembalikan maksimal 12 000 karakter teks secara default (model dapat meminta hingga 50 000), mengikuti maksimal 5 redirect, dan berhenti setelah 15 detik. Tool ini tidak menjalankan JavaScript, jadi halaman yang membangun kontennya di sisi klien hanya mengembalikan kerangka loading beserta catatan bahwa kontennya tidak terbaca; gunakan browser bridge untuk halaman seperti itu.

Karena URL ditentukan oleh model, setiap hop divalidasi dan permintaannya tidak dapat diarahkan ke jaringan server sendiri:

- hanya URL `http(s)` tanpa kredensial yang diterima, dan rantai redirect divalidasi ulang satu per satu, sehingga URL publik tidak dapat memantulkan permintaan ke alamat yang diblokir
- alamat loopback, link-local (termasuk metadata cloud `169.254.169.254`), privat (`10/8`, `172.16/12`, `192.168/16`), carrier-grade NAT (`100.64/10`), IPv6 unique-local, dan link-local ditolak, begitu juga nama `.localhost`, `.local`, dan `.internal`
- hostname di-resolve sebelum permintaan dikirim, sehingga nama yang terlihat publik tetapi mengarah ke alamat privat tetap ditolak
- origin non-HTTPS tetap harus disetujui di `OUTBOUND_ALLOWED_ORIGINS`, kebijakan yang sama dengan `web_search` dan provider discovery
- respons biner seperti PDF dilaporkan lewat content type-nya alih-alih dikembalikan sebagai teks acak; lampirkan filenya ke chat

Fitur mati secara default dan diaktifkan per browser. Tool browser hanya tersedia untuk giliran chat yang terhubung. Secara default, extension memiliki host permissions untuk Google dan Google Scholar. Untuk membaca website publik lainnya, pengguna dapat memberikan izin opsional melalui popup extension pada bagian **Public website reading**. Jika izin belum diberikan, `browser_open` menavigasi ke halaman tetapi mengembalikan `{ readable: false, reason: "host_permission_required" }` tanpa membaca konten halaman. Tab yang sudah ada, riwayat browsing, serta alamat lokal/jaringan privat tetap terlindungi dan tidak pernah diakses. Jika muncul CAPTCHA, selesaikan sendiri; Mimin tidak mencoba membypass CAPTCHA. Biarkan chat terbuka selama tool bekerja.

Jika sebelumnya memasang popup Mimin Search, ganti/muat ulang extension dengan paket baru dan muat ulang Mimin. Untuk server selain lokal, isi `MIMIN_EXTENSION_ORIGINS` saat build dengan origin Mimin yang dipisahkan koma. Default: `http://localhost:5173` dan `http://127.0.0.1:5173`.

Paket dibuat otomatis saat development dan production build. Paket juga dapat dibuat langsung:

```bash
npm run extension:build
```

Petunjuk instalasi lokal tersedia di [`browser-extension/README.md`](browser-extension/README.md).
Untuk production, paket perlu ditandatangani dan didistribusikan melalui Chrome Web Store serta
Mozilla Add-ons agar pengguna mendapat proses instalasi normal dan pembaruan otomatis.

Perintah browser dikirim lewat stream chat dan hasilnya dikembalikan melalui callback sekali pakai
yang memeriksa identitas pengguna. Permintaan tertunda disimpan di proses server; deployment
multi-instance memerlukan sticky routing untuk chat dan hasil browser, atau broker bersama.

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
- `project_files`: metadata file, storage key, status ekstraksi, dan jumlah chunk terindeks
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

`/api/models` menanyakan endpoint daftar model provider yang dikonfigurasi dan mengembalikan metadata model yang dinormalisasi, termasuk provider, context window, capabilities, source (`live` atau `catalog`), dan status konfigurasi server. Provider yang belum dikonfigurasi tetap mengembalikan metadata catalog bawaan untuk UI setup, sedangkan provider yang dikonfigurasi hanya menampilkan model yang dikembalikan API-nya. Jika ada sesi, endpoint ini juga melaporkan apakah pengguna menyimpan key sendiri untuk tiap provider (`userConfigured`). Kegagalan discovery provider dikembalikan dalam array `errors`.

Tool khusus project seperti `project_knowledge_search` hanya dikembalikan jika `projectId` diberikan.

### Providers

```text
GET    /api/providers
POST   /api/providers
PUT    /api/providers/:provider
DELETE /api/providers/:provider
```

Pengguna dapat menyimpan API key sendiri per provider (saat ini `openai`, `anthropic`, dan `google`). Key dienkripsi saat disimpan dengan AES-256-GCM menggunakan key turunan dari `PROVIDER_KEY_ENCRYPTION_SECRET`, dan tidak pernah dikirim kembali ke browser; API merespons dalam bentuk tersamarkan seperti `•••• 4f2a`. Jika tidak ada key tersimpan, environment variable server dipakai sebagai fallback (`OPENAI_API_KEY`, `ANTHROPIC_API_KEY`, dan `GOOGLE_API_KEY` atau `GEMINI_API_KEY` untuk Google). `baseUrl` opsional dapat disimpan untuk mengarahkan request provider ke endpoint khusus.

`POST /api/providers` membuat provider kustom milik pengguna. UI pengaturan menyediakan template untuk semua protokol HTTP Pi yang cocok dengan koneksi API key/base URL: OpenAI Chat Completions, OpenAI Responses, Anthropic Messages, Google Generative AI, Mistral Conversations, Pi Messages, dan Azure OpenAI Responses. ID model diambil secara otomatis dari endpoint saat menyimpan koneksi, atau dapat diisi secara manual. API key bersifat opsional untuk server lokal tanpa autentikasi.

```bash
curl -X PUT http://localhost:5173/api/providers/openai \
  -H 'content-type: application/json' \
  -d '{"apiKey":"sk-...","baseUrl":"https://gateway.example.com/v1"}'

curl -X DELETE http://localhost:5173/api/providers/openai
```

Halaman pengaturan provider tersedia di `/settings`.

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

#### Attachment chat

Composer chat menerima maksimal 5 attachment per message. Format yang didukung adalah `.txt`, `.md`, `.json`, dan `.pdf`; batas setiap file dan total attachment dalam satu message adalah 25 MB. Teks plain text dan teks PDF yang berhasil diekstrak dimasukkan sebagai context referensi yang dibatasi dan diberi delimiter jelas untuk agent (termasuk attachment dari turn sebelumnya), tanpa mengubah teks message yang terlihat atau disimpan. Ekstraksi PDF dilakukan sekali saat upload dengan batas 100 halaman, 500.000 karakter, 10 detik, dan 16 MP per resource gambar. PDF kosong, rusak, atau terlindungi password tetap disimpan dengan status/error ekstraksi; PDF yang hanya berisi gambar belum menghasilkan teks.

Request multipart menggunakan field `content`, `model` (opsional), dan field `files` berulang:

```bash
curl -X POST http://localhost:5173/api/conversations/CONVERSATION_ID/messages \
  -F 'content=Ringkas catatan ini' \
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
- Provider buatan pengguna dengan template protokol Pi yang didukung

Provider key tidak pernah muncul di response model API atau browser code.

## Knowledge retrieval

Project Knowledge kini mendukung OCR lokal dengan Tesseract untuk halaman PDF hasil pemindaian, chunk dengan nomor halaman, embedding pgvector, dan pencarian hybrid semantic/keyword. Text search tetap tersedia saat embedding dinonaktifkan atau gagal. Sitasi menyimpan nama file, halaman, dan kutipan teks; klik sumber di bawah jawaban untuk membuka file asli yang dilindungi autentikasi.

Jalankan migrasi database setelah memasang pgvector. Docker Compose membangun PostgreSQL 17 Alpine dengan pgvector tanpa mengganti volume lama. Embedding bersifat opt-in melalui `KNOWLEDGE_EMBEDDINGS_ENABLED=true`; lihat `.env.example` untuk endpoint/model/key. Gunakan tombol **Reindex** pada file lama untuk menambahkan OCR, nomor halaman, dan embedding. Percakapan dan file lama tetap kompatibel.

Panduan konfigurasi, batas OCR, keamanan, migrasi, dan pemulihan tersedia di [Knowledge retrieval (English)](README.md#knowledge-retrieval).

## Frontend routes

```text
/                                  Home composer
/chat                              Chat room dan SSE response
/projects                          Project dashboard
/projects/:id                     Project overview dan knowledge
```

Chat frontend menggunakan `src/lib/client/api.ts` untuk membuat conversation dan membaca SSE stream. Halaman Projects menggunakan state API live yang terautentikasi dan menampilkan status loading, kesehatan ekstraksi, empty state, serta kegagalan secara eksplisit.

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

## Verifikasi

Workflow CI menjalankan type checking, format dan lint, unit test, integration test PostgreSQL/pgvector disposable, production build, validasi extension, bundle budget, container build, serta dependency audit. Sebelum membuka pull request, jalankan pemeriksaan yang tercantum di [CONTRIBUTING.md](CONTRIBUTING.md).

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

1. Tambahkan registration dan password reset.
2. Tambahkan antrean indexing durable untuk instalasi berskala besar.
3. Hubungkan persistence sitasi ke sumber web yang ter-normalisasi.
4. Tambahkan resep deployment untuk platform managed; panduan saat ini menargetkan Node adapter dan Docker Compose satu host.

## Komunitas dan lisensi

- Kontribusi terbuka. Baca [CONTRIBUTING.md](CONTRIBUTING.md) dan [Code of Conduct](CODE_OF_CONDUCT.md).
- Laporkan kerentanan secara privat melalui [SECURITY.md](SECURITY.md).
- Baca [PRIVACY.md](PRIVACY.md) sebelum mengoperasikan deployment untuk pengguna lain.
- Mimin WebUI menggunakan [GNU Affero General Public License v3.0 atau versi setelahnya](LICENSE). Deployment network dari versi modifikasi wajib menawarkan corresponding source kepada pengguna.
