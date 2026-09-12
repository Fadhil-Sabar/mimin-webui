# Production deployment

The Docker Compose file is suitable for a single-host deployment. Review this checklist before exposing Mimin WebUI to the internet.

## 1. Configure secrets

Copy `.env.example` to `.env` and replace every `replace-with-...` value. Generate independent values:

```bash
openssl rand -base64 32  # BETTER_AUTH_SECRET
openssl rand -hex 32     # PROVIDER_KEY_ENCRYPTION_SECRET
openssl rand -hex 24     # POSTGRES_PASSWORD
openssl rand -base64 24  # SEED_PASSWORD
```

Do not reuse credentials. Keep `.env` out of version control and readable only by the service operator. Back up `PROVIDER_KEY_ENCRYPTION_SECRET` securely because saved provider keys cannot be recovered without it.

`DATABASE_URL` must contain the same value generated for `POSTGRES_PASSWORD`. The other generated secrets must remain independent.

Set the public HTTPS origin explicitly:

```env
BETTER_AUTH_URL=https://mimin.example.com
ORIGIN=https://mimin.example.com
```

Compose bakes `BETTER_AUTH_URL` into the downloadable browser extension as its allowed origin, so the
package only bridges the origin you set here. If the app is reachable at another origin as well (a bare
IP and port, for example), list every origin in `MIMIN_EXTENSION_ORIGINS` instead. Changing it requires a
rebuild, and users must download the extension package again from **Settings → Browser Extension**.

## 2. Start and bootstrap

```bash
docker compose up -d --build
```

With `AUTO_SEED=true`, startup creates `admin@mimin.local` using `SEED_PASSWORD`. Sign in immediately, create a named administrator account if needed, then set `AUTO_SEED=false` and remove `SEED_PASSWORD` from the runtime environment. Do not expose a deployment using example credentials.

`AUTO_MIGRATE=true` is convenient for a single instance. For controlled or multi-instance releases, run migrations once as a release step and set `AUTO_MIGRATE=false` for application replicas.

## 3. Network and TLS

- Put the application behind a maintained reverse proxy that terminates HTTPS.
- Forward the original host and protocol headers.
- Restrict direct access to port 3000 with a firewall when the proxy is on another host.
- PostgreSQL is bound to `127.0.0.1` by default. Remove its host port entirely when only containers need access.
- Do not put private provider or search services in `OUTBOUND_ALLOWED_ORIGINS` unless Mimin is expected to reach them.

Example health target: `GET /login` should return a successful response.

## 4. Data and backups

Back up both named volumes:

- `mimin-postgres`: accounts, sessions, projects, conversations, extracted knowledge, settings
- `mimin-data`: uploaded originals and attachments

Test restoration regularly. Keep database and file-storage snapshots from the same point in time where possible. Encrypt backups and define a retention period.

## 5. Scaling limits

Conversation turn reservations, stop requests, browser-extension pending requests, and browser consent are process-local. A multi-instance deployment requires sticky routing for related requests or a shared coordination/broker implementation. Document indexing runs synchronously and is bounded; use a durable worker before increasing OCR or upload limits for high-volume use.

## 6. Updates

Before updating:

1. back up PostgreSQL and uploaded files
2. review release notes and migrations
3. build or pull the intended immutable image
4. run the quality and integration checks
5. apply migrations once
6. deploy and verify login, model discovery, upload, chat streaming, and health checks

Keep Node.js, PostgreSQL/pgvector, Tesseract packages, browser-extension dependencies, and base container images patched.
