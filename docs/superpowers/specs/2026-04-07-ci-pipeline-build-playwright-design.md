# CI Pipeline Build and Playwright Design

Date: 2026-04-07
Status: Approved design

## Goal

Reduce CI wall-clock time without adding avoidable workflow complexity, while keeping Docker validation in place and improving confidence that Playwright exercises the production app build rather than the dev server.

## Current State

The CI workflow currently defines six independent jobs:

- `lint`
- `typecheck`
- `unit`
- `build`
- `e2e`
- `docker-verify`

They already run in parallel because the workflow does not declare any `needs:` relationships between them.

Two sources of overlap exist:

- `build` validates that the application can compile.
- `e2e` starts the app through `vite dev`, so it does not currently validate the production build output.

`docker-verify` also builds the app indirectly as part of the Dockerfile, but that is a separate artifact path and should not be treated as duplicate coverage of the plain app build.

## Decision

Remove the standalone `build` job and move application build validation into the `e2e` job.

After the change, CI will keep these jobs:

- `lint`
- `typecheck`
- `unit`
- `e2e`
- `docker-verify`

All five jobs remain dependency-free so GitHub Actions can continue scheduling them in parallel.

## Responsibilities

### `e2e`

`e2e` becomes the authority for validating that:

- `bun run build` succeeds
- the built server can boot successfully
- the app behaves correctly end-to-end under the existing seeded test harness

This makes the Playwright job responsible for the production app build path instead of the development server path.

### `docker-verify`

`docker-verify` remains the authority for validating that:

- the `Dockerfile` builds successfully
- the Alpine-based image can assemble the runtime correctly
- production dependencies install correctly in the container path
- the container packaging path stays healthy

This is intentionally separate from `e2e`, because Docker validates a different artifact and environment.

## Playwright Runtime Design

The Playwright harness will stop launching:

```bash
bun --bun vite dev --port <port>
```

Instead, the workflow will run `bun run build` before Playwright starts, and each worker fixture will launch the built server via:

```bash
bun .output/server/index.mjs
```

The rest of the current e2e harness remains unchanged:

- per-worker SQLite test database setup
- fake external services for download clients, indexers, and Hardcover
- `BETTER_AUTH_*`, `DATABASE_URL`, and related environment injection
- startup wait logic
- `/api/__test-reset` cache reset behavior

This keeps the isolation model intact while swapping only the application runtime from development mode to built-output mode.

## Redundancy Analysis

### Removed redundancy

The dedicated `build` job is redundant once `e2e` owns `bun run build` and boots the built app.

### Retained non-redundancy

`docker-verify` still performs a Docker build, but that is acceptable and intentional because it validates:

- Dockerfile correctness
- builder and runtime image stages
- container dependency installation
- image assembly behavior on Alpine

That is not equivalent to validating a non-container app build on the GitHub runner.

## Error Handling Expectations

- If `bun run build` fails, `e2e` fails before Playwright begins.
- If the built app fails to boot, the existing worker startup timeout fails the test job clearly.
- If Playwright tests fail, the workflow still preserves artifact-level signal from the successful lint, typecheck, unit, or Docker jobs that completed in parallel.
- If the Docker image fails to build, `docker-verify` fails independently without blocking the faster code-quality jobs.

## Verification Plan

Implementation should verify the following:

- the CI workflow still has no `needs:` edges between `lint`, `typecheck`, `unit`, `e2e`, and `docker-verify`
- the `build` job has been removed from the CI workflow
- the `e2e` job runs `bun run build` before Playwright execution
- the Playwright fixture launches the built server instead of `vite dev`
- local validation covers at least `bun run build`, `bun run test`, and the e2e suite or a representative subset if full e2e runtime is too heavy

## Out of Scope

- Running Playwright against the Docker container
- Sharing built artifacts between jobs
- Refactoring the fake-service harness into containers
- Changing release or Docker publish workflows

## Rationale

This design optimizes for shorter CI time first, while keeping maintenance cost low:

- no additional workflow artifacts
- no new job dependencies
- no container orchestration added to Playwright
- better e2e signal because tests run against the built app rather than the dev server

It preserves a clean split between application validation and container validation instead of collapsing them into a single slower path.
