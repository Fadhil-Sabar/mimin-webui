# Stage 1: Build stage
FROM node:22-bookworm-slim AS builder

WORKDIR /app

# Install all dependencies including devDependencies for build
COPY package*.json ./
RUN --mount=type=cache,target=/root/.npm npm ci --legacy-peer-deps

# Copy full application source
COPY . .

# Origins for the unpacked packages in static/extensions, which local tooling loads
# (npm run extension:probe, npm run extension:e2e:chrome, web-ext run). The package a
# user downloads from Settings → Browser Extension is rebuilt for the origin they are
# on, so a hosted instance does not need this. Unset means the local development origins.
ARG MIMIN_EXTENSION_ORIGINS
ENV MIMIN_EXTENSION_ORIGINS=${MIMIN_EXTENSION_ORIGINS}

# Build browser extensions and SvelteKit application
RUN npm run build

# Stage 2: Runtime stage
FROM node:22-bookworm-slim AS runner

WORKDIR /app

ENV NODE_ENV=production
ENV PORT=3000
ENV HOST=0.0.0.0
ENV BODY_SIZE_LIMIT=30M
ENV PLAYWRIGHT_BROWSERS_PATH=/ms-playwright

# Install curl for the container healthcheck and OCR runtimes.
RUN apt-get update && apt-get install -y --no-install-recommends curl tesseract-ocr tesseract-ocr-eng tesseract-ocr-ind \
    && rm -rf /var/lib/apt/lists/*

# Install production dependencies only
COPY package*.json ./
RUN --mount=type=cache,target=/root/.npm npm ci --omit=dev --legacy-peer-deps \
    && npx playwright install --with-deps chromium \
    && chmod -R a+rX /ms-playwright \
    && npm cache clean --force \
    && rm -rf /var/lib/apt/lists/*

# Copy built application and assets
COPY --from=builder --chown=node:node /app/build ./build
COPY --from=builder --chown=node:node /app/static ./static

# Copy database schema migrations and maintenance scripts
COPY --chown=node:node drizzle ./drizzle
COPY --chown=node:node scripts ./scripts

# Copy container entrypoint script
COPY --chown=node:node docker-entrypoint.sh ./docker-entrypoint.sh
RUN chmod +x ./docker-entrypoint.sh && mkdir -p /app/data/uploads && chown -R node:node /app/data

USER node

EXPOSE 3000

HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
  CMD curl -fsS http://localhost:3000/login || exit 1

ENTRYPOINT ["./docker-entrypoint.sh"]
CMD ["node", "build"]
