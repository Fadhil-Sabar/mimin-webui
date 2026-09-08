# Stage 1: Build stage
FROM node:22-bookworm-slim AS builder

WORKDIR /app

# Install all dependencies including devDependencies for build
COPY package*.json ./
RUN npm ci

# Copy full application source
COPY . .

# Build browser extensions and SvelteKit application
RUN npm run build

# Stage 2: Runtime stage
FROM node:22-bookworm-slim AS runner

WORKDIR /app

ENV NODE_ENV=production
ENV PORT=3000
ENV HOST=0.0.0.0
ENV BODY_SIZE_LIMIT=30M

# Install curl for container healthcheck
RUN apt-get update && apt-get install -y --no-install-recommends curl tesseract-ocr tesseract-ocr-eng tesseract-ocr-ind \
    && rm -rf /var/lib/apt/lists/*

# Install production dependencies only
COPY package*.json ./
RUN npm ci --omit=dev && npm cache clean --force

# Copy built application and assets
COPY --from=builder /app/build ./build
COPY --from=builder /app/static ./static

# Copy database schema migrations and maintenance scripts
COPY drizzle ./drizzle
COPY scripts ./scripts

# Copy container entrypoint script
COPY docker-entrypoint.sh ./docker-entrypoint.sh
RUN chmod +x ./docker-entrypoint.sh

# Prepare directory for uploads
RUN mkdir -p /app/data/uploads

EXPOSE 3000

HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
  CMD curl -fsS http://localhost:3000/login || exit 1

ENTRYPOINT ["./docker-entrypoint.sh"]
CMD ["node", "build"]
