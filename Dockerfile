# Stage 1: Build
FROM node:24-alpine AS builder

WORKDIR /app

# Install build dependencies (needed for better-sqlite3 native module)
RUN apk add --no-cache curl bash python3 make g++

# Install bun
RUN curl -fsSL https://bun.sh/install | bash
ENV PATH="/root/.bun/bin:${PATH}"

# Install dependencies (cached layer - only re-runs when lockfile changes)
COPY package.json bun.lock ./
RUN bun install --frozen-lockfile

# Copy source and build
COPY . .
RUN bun run build

# Prune to production dependencies after build
RUN bun install --frozen-lockfile --production

# Stage 2: Runtime
FROM node:24-alpine AS runner

WORKDIR /app

# Install runtime deps for better-sqlite3
RUN apk add --no-cache python3 make g++

# Copy Nitro server output
COPY --from=builder /app/.output ./.output

# Copy production node_modules (includes better-sqlite3 native bindings)
COPY --from=builder /app/node_modules ./node_modules

# Copy package files and db config for seed script
COPY --from=builder /app/package.json ./package.json
COPY --from=builder /app/drizzle.config.ts ./drizzle.config.ts
COPY --from=builder /app/tsconfig.json ./tsconfig.json
COPY --from=builder /app/src/db ./src/db

# Copy entrypoint
COPY scripts/docker-entrypoint.sh ./scripts/docker-entrypoint.sh
RUN chmod +x ./scripts/docker-entrypoint.sh

# Create data directory for SQLite
RUN mkdir -p /app/data

ENV NODE_ENV=production
ENV DATABASE_URL=/app/data/sqlite.db

EXPOSE 3000

ENTRYPOINT ["/app/scripts/docker-entrypoint.sh"]
