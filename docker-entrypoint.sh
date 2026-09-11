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

# Stable secrets are required so sessions and encrypted provider keys survive restarts.
case "${BETTER_AUTH_SECRET:-}" in
  ''|replace-with-*)
    echo "ERROR: Set BETTER_AUTH_SECRET to a stable random value." >&2
    exit 1
    ;;
esac
if [ "${#BETTER_AUTH_SECRET}" -lt 32 ]; then
  echo "ERROR: BETTER_AUTH_SECRET must be at least 32 characters." >&2
  exit 1
fi

case "${PROVIDER_KEY_ENCRYPTION_SECRET:-}" in
  ''|replace-with-*)
    echo "ERROR: Set PROVIDER_KEY_ENCRYPTION_SECRET to a stable random value." >&2
    exit 1
    ;;
esac
if [ "${#PROVIDER_KEY_ENCRYPTION_SECRET}" -lt 32 ]; then
  echo "ERROR: PROVIDER_KEY_ENCRYPTION_SECRET must be at least 32 characters." >&2
  exit 1
fi

if [ "${AUTO_SEED:-false}" = "true" ]; then
  case "${SEED_PASSWORD:-}" in
    ''|admin123|replace-with-*)
      echo "ERROR: AUTO_SEED=true requires a non-default SEED_PASSWORD." >&2
      exit 1
      ;;
  esac
  if [ "${#SEED_PASSWORD}" -lt 16 ]; then
    echo "ERROR: SEED_PASSWORD must be at least 16 characters." >&2
    exit 1
  fi
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
if [ "${AUTO_SEED:-false}" = "true" ]; then
  echo "Ensuring initial seed data..."
  node scripts/seed.js
fi

exec "$@"
