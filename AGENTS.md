# Repository Guidelines

## Project Structure & Module Organization
Application code lives in `src/`. Use `src/routes` for TanStack Start route files, `src/components` for UI and feature components, `src/lib` and `src/hooks` for shared client logic, and `src/server` for backend integrations, schedulers, and utilities. Database schema code is under `src/db/schema`, with Drizzle migrations in `drizzle/`. Static assets belong in `public/`; sample and runtime data live in `data/`. End-to-end coverage is in `e2e/`, with shared fixtures and helpers alongside `e2e/tests/*.spec.ts`.

## Build, Test, and Development Commands
Install dependencies with `bun install`, then copy `.env.example` to `.env`.

- `bun run dev`: start the Vite/TanStack Start dev server.
- `bun run build`: create the production bundle in `.output/`.
- `bun run start`: run the built server locally.
- `bun run lint` / `bun run lint:fix`: run Biome checks or apply fixes.
- `bun run typecheck`: run TypeScript without emitting files.
- `bun run test`: execute Vitest unit tests.
- `bun run test:e2e`: install Chromium and run Playwright tests.
- `bun run db:migrate` or `bun run db:push`: apply Drizzle schema changes.

## Coding Style & Naming Conventions
This repo uses TypeScript with Biome for formatting and linting. Follow the existing formatter output: tabs for indentation, organized imports, and no default React imports; use named imports such as `import { useState } from "react"`. Keep route files aligned with URL structure (`src/routes/setup.tsx`, `src/routes/_authed/index.tsx`). Use lowercase kebab-case for component files (`movie-card.tsx`), and suffix tests with `.test.ts` or `.spec.ts`.

## Testing Guidelines
Place unit and integration tests near the server code in `src/server/__tests__` and name them `*.test.ts`. Put browser flows in `e2e/tests` with ordered `*.spec.ts` filenames when sequence matters. Run `bun run test`, `bun run typecheck`, and `bun run lint` before opening a PR; add `bun run test:e2e` for routing, auth, or UI workflow changes.

## Commit & Pull Request Guidelines
Commit messages must follow Conventional Commits with a required scope, for example `feat(auth): add session refresh` or `ci(release): pin workflow sha`. Lefthook runs Biome on staged files and commitlint on commit messages. PRs should describe user-visible changes, mention any schema or env updates, link related issues, and include screenshots or recordings for UI changes.

## Security & Configuration Tips
Do not commit `.env` or production secrets. Prefer `.env.example` for documenting new variables. Build production artifacts on the target platform, or use Docker, because native dependencies such as `sharp` can break across OS or CPU boundaries.
