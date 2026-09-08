#!/usr/bin/env bash
set -euo pipefail

# Use TEST_DATABASE_URL when CI or a developer already provides a database.
cleanup() {
	if [[ -n "${container_id:-}" ]]; then
		docker stop "$container_id" >/dev/null
	fi
}
trap cleanup EXIT

if [[ -z "${TEST_DATABASE_URL:-}" ]]; then
	image="mimin-webui-postgres:integration"
	docker build --quiet -f Dockerfile.postgres -t "$image" . >/dev/null
	container_id=$(docker run --rm -d -P \
		-e POSTGRES_USER=mimin \
		-e POSTGRES_PASSWORD=mimin \
		-e POSTGRES_DB=mimin_test \
		"$image")
	port=''
	for _ in {1..60}; do
		port=$(docker inspect --format '{{(index (index .NetworkSettings.Ports "5432/tcp") 0).HostPort}}' "$container_id" 2>/dev/null || true)
		if [[ -n "$port" ]] && docker exec "$container_id" pg_isready -U mimin -d mimin_test >/dev/null 2>&1; then
			break
		fi
		sleep 1
done
	if [[ -z "$port" ]] || ! docker exec "$container_id" pg_isready -U mimin -d mimin_test >/dev/null 2>&1; then
		echo 'PostgreSQL did not become ready' >&2
		exit 1
	fi
	export TEST_DATABASE_URL="postgres://mimin:mimin@127.0.0.1:${port}/mimin_test"
fi

export DATABASE_URL="${DATABASE_URL:-$TEST_DATABASE_URL}"
npm run db:migrate
npx vitest run tests/document-processing.integration.test.ts tests/knowledge-pgvector.integration.test.ts
