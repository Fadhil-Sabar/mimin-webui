# Mimin WebUI

Mimin WebUI adalah workspace AI agent berbasis project dengan chat, project knowledge, penemuan model, eksekusi tool, dan riwayat percakapan yang tersimpan.

[English](README.md) · [Mulai cepat](#mulai-cepat) · [Dokumentasi](#dokumentasi) · [Kontribusi](CONTRIBUTING.md)

## Fitur

- **Chat:** respons streaming, riwayat percakapan, penghentian generasi, serta attachment file atau gambar.
- **Project:** kelompokkan percakapan, kelola file, dan terapkan instruksi project pada setiap giliran agent.
- **Knowledge:** ekstraksi teks PDF, OCR lokal, pencarian hybrid keyword/pgvector opsional, dan sitasi tersimpan dengan nomor halaman.
- **Provider:** temukan model OpenAI, Anthropic, Google, atau endpoint kustom; simpan API key terenkripsi per pengguna.
- **Riset:** pencarian web melalui Tavily, DuckDuckGo, atau SearXNG, serta pembacaan URL publik dengan fallback untuk halaman JavaScript saat extension browser tersambung.
- **Browser bridge:** extension Chromium/Firefox opsional untuk pencarian Google/Scholar serta pembacaan dan interaksi tab dengan izin pengguna.
- **Skill:** instruksi personal atau project yang dapat digunakan ulang, preset tool, dan saran berdasarkan frasa pemicu.
- **Akun:** login email/password, reset password, pembuatan pengguna oleh administrator, serta pembatasan akses project, percakapan, dan file berdasarkan pemilik.

Dibangun dengan Svelte 5/SvelteKit, TypeScript, Tailwind CSS v4, Lucide, PostgreSQL, Drizzle ORM, dan Pi (`pi-agent-core` / `pi-ai`).

## Persyaratan

- **Setup Docker:** Git dan Docker dengan Compose; image sudah menyertakan PostgreSQL 17 dengan pgvector dan Tesseract OCR.
- **Pengembangan lokal:** instal juga Node.js 22+ dan npm 10+. Instal Tesseract beserta data bahasa Inggris/Indonesia untuk OCR; lihat [panduan knowledge](docs/knowledge.md) (English).
- **Respons AI:** konfigurasikan provider melalui environment variable atau **Settings**. Provider bawaan memerlukan API key; endpoint lokal kustom dapat digunakan tanpa key.

Server PostgreSQL 17+ yang sudah ada dapat menggantikan database Compose, tetapi pgvector harus terpasang sebelum migrasi dijalankan. Repositori memakai npm dan lockfile agar setup konsisten; kode sumber juga kompatibel dengan Bun.

## Mulai cepat

### 1. Ambil kode dan atur environment

```bash
git clone https://github.com/Fadhil-Sabar/mimin-webui.git
cd mimin-webui
cp .env.example .env
```

Buat secret yang berbeda, lalu salin hasil setiap perintah ke variabel yang sesuai di `.env`:

```bash
openssl rand -hex 24     # POSTGRES_PASSWORD
openssl rand -base64 32  # BETTER_AUTH_SECRET
openssl rand -hex 32     # PROVIDER_KEY_ENCRYPTION_SECRET
openssl rand -base64 24  # SEED_PASSWORD
```

- Ganti semua nilai `replace-with-...`. Gunakan `POSTGRES_PASSWORD` yang sama dalam `DATABASE_URL`; secret lainnya harus berbeda.
- Isi `OPENAI_API_KEY`, `ANTHROPIC_API_KEY`, atau `GOOGLE_API_KEY` (`GEMINI_API_KEY` juga didukung), atau konfigurasikan provider setelah login.
- Untuk alamat selain URL localhost bawaan, isi `BETTER_AUTH_URL` dan `ORIGIN` dengan origin yang digunakan, termasuk skema dan port. Gunakan HTTPS untuk deployment publik.
- Simpan secret hanya di server dan jangan commit `.env`. Seluruh pengaturan opsional dijelaskan di [.env.example](.env.example).

Pilih salah satu cara menjalankan aplikasi di bawah. Baca [panduan deployment](docs/deployment.md) (English) sebelum membuka akses publik.

### 2a. Jalankan dengan Docker

```bash
docker compose up -d --build
```

Buka **http://localhost:3000** (atau port dari `HOST_PORT` / `PORT`). Saat startup, aplikasi menunggu PostgreSQL, menerapkan migrasi, dan membuat administrator awal jika `AUTO_SEED=true` serta `SEED_PASSWORD` non-default sudah diatur.

### 2b. Jalankan secara lokal

```bash
npm ci --legacy-peer-deps
npm run playwright:install
docker compose up -d postgres
npm run db:migrate
npm run db:seed
npm run dev
```

Buka **http://localhost:5173**. `DATABASE_URL` harus mengarah ke database lokal; sesuaikan jika kredensial atau port database berubah. OCR lokal memerlukan Tesseract, atau atur `PDF_OCR_ENABLED=false` untuk menonaktifkannya.

### 3. Login dan selesaikan bootstrap

Login sebagai **`admin@mimin.local`** dengan **`SEED_PASSWORD`** Anda. Setelah bootstrap pertama berhasil, atur `AUTO_SEED=false`, hapus `SEED_PASSWORD` dari environment runtime, lalu restart atau buat ulang container aplikasi agar perubahan berlaku.

Menjalankan seed kembali akan mereset password akun tersebut ke nilai yang diberikan. Gunakan `SEED_KEEP_PASSWORD=true` untuk mempertahankan password yang sudah diubah melalui UI.

Hentikan layanan Compose dengan `docker compose down`. Data tetap tersimpan di `mimin-postgres` (database) dan, untuk stack Docker lengkap, `mimin-data` (upload). Upload lokal memakai `STORAGE_PATH`, dengan default `./data/uploads`.

## Menggunakan Mimin

### Akun dan provider

Registrasi publik dinonaktifkan; administrator membuat pengguna melalui `/admin/users`. Tautan reset password hanya berlaku sekali selama satu jam dan mengakhiri sesi yang ada saat digunakan. Konfigurasikan SMTP untuk mengirim tautan lewat email, atau minta administrator membuat dan menyalinnya. Lihat [email reset password](docs/deployment.md#password-reset-email) (English).

Simpan koneksi provider di **Settings**. API key pengguna disimpan terenkripsi dan diprioritaskan dibanding key dari environment server. Origin provider/pencarian kustom memerlukan persetujuan operator melalui `OUTBOUND_ALLOWED_ORIGINS`; lihat [referensi provider](docs/api.md#providers) (English).

### Attachment dan project knowledge

| Upload            | Format yang didukung                                                     | Batas                                      |
| ----------------- | ------------------------------------------------------------------------ | ------------------------------------------ |
| Chat              | `.txt`, `.md`, `.json`, `.pdf`, `.png`, `.jpg`, `.jpeg`, `.webp`, `.gif` | 5 file; 25 MB per file dan total per pesan |
| Gambar chat       | Format gambar di atas; memerlukan model dengan kemampuan vision          | 8 MB per gambar; total 16 MB per giliran   |
| Project knowledge | `.txt`, `.md`, `.json`, `.pdf`                                           | 25 MB per file; PDF maksimal 100 halaman   |

PDF project mendukung OCR lokal dan sitasi halaman yang dapat diklik. Pencarian semantik diaktifkan secara opsional melalui `KNOWLEDGE_EMBEDDINGS_ENABLED=true` dan mengirim kutipan hasil ekstraksi ke provider embedding yang dikonfigurasi; pencarian keyword tetap tersedia jika embedding dinonaktifkan atau gagal. Gunakan **Reindex** pada file lama setelah mengubah pengaturan ekstraksi atau embedding. Lihat [panduan knowledge](docs/knowledge.md) (English) untuk setup, upgrade, dan batasannya.

### Extension browser opsional

Buka **Settings → Browser Extension**, aktifkan bridge, lalu instal paket untuk browser Anda. Muat ulang Mimin di browser tersebut dan pastikan statusnya **Connected**. Paket menyesuaikan origin tempat Anda mengunduhnya; isi `MIMIN_EXTENSION_ORIGINS` untuk origin tambahan.

Berikan izin **Tab reading & interaction** melalui popup extension untuk membaca situs publik lain. Akses tab yang sudah terbuka juga memerlukan persetujuan di chat: **allow just once** atau **allow for this conversation**. Bridge nonaktif secara default dan tidak mengakses alamat privat/lokal. Lihat [panduan extension browser](browser-extension/README.md) untuk izin, instalasi, dan troubleshooting, serta [tool riset](docs/api.md#research-tools) untuk pencarian dan pembacaan URL di server (keduanya English).

## Pengembangan

| Perintah                                     | Kegunaan                                            |
| -------------------------------------------- | --------------------------------------------------- |
| `npm run dev`                                | Menjalankan server pengembangan                     |
| `npm run check`                              | Memeriksa tipe dan komponen Svelte                  |
| `npm test`                                   | Menjalankan unit test                               |
| `npm run build`                              | Membuat build produksi                              |
| `npm run lint` / `npm run format`            | Memeriksa format/aturan lint atau menerapkan format |
| `npm run db:generate` / `npm run db:migrate` | Membuat atau menerapkan migrasi schema              |

Lihat [CONTRIBUTING.md](CONTRIBUTING.md#quality-checks) (English) untuk pemeriksaan lengkap, termasuk integrasi database dan validasi extension browser.

## Dokumentasi

Panduan referensi berikut tersedia dalam bahasa Inggris:

- [Deployment](docs/deployment.md): secret, SMTP, HTTPS, backup, scaling, dan update.
- [API dan tool](docs/api.md): autentikasi, provider, skill, attachment, streaming, dan tool riset.
- [Arsitektur](docs/architecture.md): struktur aplikasi, database, runtime AI, dan route.
- [Project knowledge](docs/knowledge.md): OCR, embedding, pencarian, sitasi, dan petunjuk migrasi.
- [Extension browser](browser-extension/README.md): instalasi, izin, protokol, dan pemeriksaan browser.

## Batasan saat ini

- Registrasi mandiri untuk publik belum tersedia.
- Koordinasi giliran dan persetujuan browser berlaku per proses; beberapa instance memerlukan koordinasi tambahan. Lihat [batas scaling](docs/deployment.md#5-scaling-limits) (English).
- Indexing bervolume tinggi memerlukan background worker yang persisten; panduan deployment saat ini mencakup Node adapter dan Docker Compose pada satu host.
- Integrasi penyimpanan sitasi dengan sumber web yang dinormalisasi masih direncanakan.

## Komunitas dan lisensi

Kontribusi dipersilakan: baca [CONTRIBUTING.md](CONTRIBUTING.md) dan [Code of Conduct](CODE_OF_CONDUCT.md). Laporkan kerentanan melalui [SECURITY.md](SECURITY.md), dan baca [PRIVACY.md](PRIVACY.md) sebelum menyediakan layanan untuk pengguna lain.

Menggunakan lisensi [GNU Affero General Public License v3.0 atau lebih baru](LICENSE). Deployment versi modifikasi melalui jaringan harus menyediakan kode sumber yang sesuai kepada pengguna.
