#!/bin/sh
set -e

echo "Allstarr - Starting up..."

# Ensure data directory exists
mkdir -p /app/data

# Apply database migrations
echo "Running database migrations..."
bun run db:migrate

# Start the application
echo "Starting Allstarr..."
exec bun /app/.output/server/index.mjs
