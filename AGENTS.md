# Repository Guidelines

## Workflow Guidelines
- Always make sure you start new work in a separate worktree in `.worktrees/` (unless doing follow up work on a worktree in here already).
- When using the superpowers workflow, we should automatically accept the spec and implementation manual review steps. Then, start implementing using subagents.
- Install dependencies with `bun install`, then copy `.env.example` to `.env`.
- Check if the dev server is already running before running `bun run dev`.

## Coding Style & Naming Conventions
- This repo uses TypeScript with Biome for formatting and linting. After making changes, use existing lint/format commands to apply fixes rather than manually updating. Ensure that we do not contribute additional lint errors or warnings.
- Do not use biome or typescript ignore comments.
- Do not use default React imports; use named imports such as `import { useState } from "react"`.
- Keep route files aligned with URL structure (`src/routes/setup.tsx`, `src/routes/_authed/index.tsx`).
- Use lowercase kebab-case for component files (`movie-card.tsx`), and suffix unit tests with `.test.ts` (or `.browser.test.tsx` for browser tests). Playwright tests should be suffixed with `.spec.ts`.

## Testing Guidelines
- For complex features or risky changes, ensure we have sufficient Playwright e2e test coverage. Add/update tests as needed.
- All changes should have sufficient unit test coverage and not lower the baseline coverage percentage.

## Commit & Pull Request Guidelines
Commit messages must follow Conventional Commits with a required scope, for example `feat(auth): add session refresh` or `ci(release): pin workflow sha`. Lefthook runs Biome on staged files and commitlint on commit messages. PRs should describe user-visible changes, mention any schema or env updates, link related issues, and include screenshots or recordings for UI changes.
