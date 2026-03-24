# Stage 1: Build
FROM oven/bun:1-alpine AS builder

WORKDIR /app

COPY package.json bun.lock ./
RUN bun install --frozen-lockfile --ignore-scripts

COPY . .
RUN bun run build

# Stage 2: Runtime
FROM oven/bun:1-alpine

WORKDIR /app

# Install ffmpeg for audio metadata extraction (provides ffprobe)
RUN apk add --no-cache ffmpeg

# Copy Nitro server output
COPY --from=builder /app/.output ./.output

# Copy package files and install production deps directly
COPY --from=builder /app/package.json ./package.json
COPY --from=builder /app/bun.lock ./bun.lock
RUN bun install --production --ignore-scripts

# Copy db config, migrations, and seed script
COPY --from=builder /app/drizzle.config.ts ./drizzle.config.ts
COPY --from=builder /app/tsconfig.json ./tsconfig.json
COPY --from=builder /app/src/db ./src/db
COPY --from=builder /app/drizzle ./drizzle

# Copy entrypoint
COPY scripts/docker-entrypoint.sh /app/scripts/
RUN chmod +x /app/scripts/docker-entrypoint.sh

# Create data directory for SQLite
RUN mkdir -p /app/data

ENV DATABASE_URL=/app/data/sqlite.db
ENV NODE_ENV=production

EXPOSE 3000

ENTRYPOINT ["/app/scripts/docker-entrypoint.sh"]
