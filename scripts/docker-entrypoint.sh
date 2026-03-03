#!/bin/sh
set -e

echo "Allstarr - Starting up..."

# Ensure data directory exists
mkdir -p /app/data

# Apply database migrations
echo "Running database migrations..."
bun /app/src/db/migrate.ts

# Run database seed (idempotent — skips if data already exists)
echo "Seeding database..."
bun /app/src/db/seed.ts

# Start the application
echo "Starting Allstarr..."
exec bun /app/.output/server/index.mjs
