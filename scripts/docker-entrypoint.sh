#!/bin/sh
set -e

echo "Allstarr - Starting up..."

# Ensure data directory exists
mkdir -p /app/data

# Run database seed (idempotent — skips if data already exists)
echo "Seeding database..."
node --import tsx/esm /app/src/db/seed.ts

# Start the application
echo "Starting Allstarr..."
exec node /app/.output/server/index.mjs
