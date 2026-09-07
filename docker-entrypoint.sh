#!/bin/sh
set -e

# If DATABASE_URL points to localhost/127.0.0.1 and postgres service is reachable, redirect to postgres service
if echo "$DATABASE_URL" | grep -qE '@(localhost|127\.0\.0\.1):5432'; then
  if getent hosts postgres >/dev/null 2>&1; then
    echo "Notice: Detected localhost in DATABASE_URL inside Docker container. Using postgres host instead..."
    DATABASE_URL=$(echo "$DATABASE_URL" | sed -E 's/@(localhost|127\.0\.0\.1):5432/@postgres:5432/')
    export DATABASE_URL
  fi
fi

# Ensure storage directory exists
STORAGE_DIR="${STORAGE_PATH:-/app/data/uploads}"
mkdir -p "$STORAGE_DIR"

# Warn and provide fallback if critical secrets are missing
if [ -z "$BETTER_AUTH_SECRET" ]; then
  echo "WARNING: BETTER_AUTH_SECRET is not set. Generating a random fallback secret for this session."
  echo "         To maintain persistent sessions across container restarts, set BETTER_AUTH_SECRET in .env."
  BETTER_AUTH_SECRET=$(node -e "import('node:crypto').then(c => console.log(c.randomBytes(32).toString('base64')))")
  export BETTER_AUTH_SECRET
fi

if [ -z "$PROVIDER_KEY_ENCRYPTION_SECRET" ]; then
  echo "WARNING: PROVIDER_KEY_ENCRYPTION_SECRET is not set. Generating a random fallback secret for this session."
  echo "         To persist encrypted provider keys across restarts, set PROVIDER_KEY_ENCRYPTION_SECRET in .env."
  PROVIDER_KEY_ENCRYPTION_SECRET=$(node -e "import('node:crypto').then(c => console.log(c.randomBytes(32).toString('hex')))")
  export PROVIDER_KEY_ENCRYPTION_SECRET
fi

# Set SvelteKit adapter-node ORIGIN from BETTER_AUTH_URL if not explicitly set
if [ -z "$ORIGIN" ] && [ -n "$BETTER_AUTH_URL" ]; then
  export ORIGIN="$BETTER_AUTH_URL"
fi

# Wait for PostgreSQL database connection if DATABASE_URL is set
if [ -n "$DATABASE_URL" ]; then
  echo "Waiting for PostgreSQL database connection..."
  node -e "
    import postgres from 'postgres';
    const url = process.env.DATABASE_URL;
    const maxRetries = 30;
    let retries = 0;
    async function waitDb() {
      while (retries < maxRetries) {
        try {
          const sql = postgres(url, { max: 1, connect_timeout: 2 });
          await sql\`SELECT 1\`;
          await sql.end();
          console.log('PostgreSQL database is ready.');
          process.exit(0);
        } catch (err) {
          retries++;
          await new Promise(res => setTimeout(res, 1000));
        }
      }
      console.error('Failed to connect to PostgreSQL after 30 retries.');
      process.exit(1);
    }
    waitDb();
  "
fi

# Automatically run database migrations on container start
if [ "${AUTO_MIGRATE:-true}" = "true" ]; then
  echo "Running database migrations..."
  node scripts/migrate.js
fi

# Automatically seed the initial admin account and default project
if [ "${AUTO_SEED:-true}" = "true" ]; then
  echo "Ensuring initial seed data..."
  node scripts/seed.js
fi

exec "$@"
