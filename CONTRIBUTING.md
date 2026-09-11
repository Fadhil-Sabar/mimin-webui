# Contributing to Mimin WebUI

Thanks for contributing. Small, focused pull requests are easier to review and maintain.

## Before you start

- Search existing issues and pull requests before opening a new one.
- Use an issue to discuss substantial features, schema changes, or security-sensitive redesigns first.
- Do not open a public issue for a vulnerability. Follow [SECURITY.md](SECURITY.md).
- By contributing, you agree that your contribution is licensed under the [GNU Affero General Public License v3.0 or later](LICENSE).

## Development setup

Requirements:

- Node.js 22+
- npm 10+
- Docker, for the PostgreSQL development service and integration tests
- Tesseract with English and Indonesian language data for OCR integration coverage

```bash
git clone https://github.com/Fadhil-Sabar/mimin-webui.git
cd mimin-webui
npm ci --legacy-peer-deps
cp .env.example .env
```

Replace every `replace-with-...` value in `.env`, then start PostgreSQL and initialize the database:

```bash
docker compose up -d postgres
npm run db:migrate
npm run db:seed
npm run dev
```

## Making changes

1. Create a branch from `main`.
2. Keep changes scoped to one concern.
3. Add or update tests for behavior changes.
4. Update English and Indonesian documentation when user-facing behavior changes.
5. Never commit credentials, `.env`, uploaded files, generated extension packages, or database data.

Generated Drizzle migrations under `drizzle/` must be committed with their schema change. Do not edit an already-released migration.

## Quality checks

Run these before opening a pull request:

```bash
npm run check
npm run lint
npm test
npm run build
npm run bundle:budget
npm audit --audit-level=high
```

Database or retrieval changes must also pass:

```bash
npm run test:integration
```

Browser-extension changes should also pass the relevant checks documented in [`browser-extension/README.md`](browser-extension/README.md):

```bash
npm run extension:validate
npm run extension:probe
npm run extension:e2e:chrome
```

## Pull requests

Explain the problem, the chosen approach, verification performed, and any migration or deployment impact. Include screenshots for visible UI changes. A maintainer may ask for changes before merging.
