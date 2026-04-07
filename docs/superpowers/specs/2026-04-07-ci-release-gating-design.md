# CI And Release Gating — Design Spec

## Overview

Add a stricter GitHub Actions pipeline that validates code quality, tests, type safety, build output, and Docker buildability before any release automation or image publishing can proceed.

The normal release path must be fully gated by successful CI. That means:

- pull requests to `main` run the full validation suite
- pushes to `main` run the same full validation suite
- the changeset release workflow only runs after that suite passes on `main`
- Docker publishing only happens for formal releases/tags, never for ordinary `main` pushes

Manual `v*` tag pushes remain supported as an edge case, but they must run a reduced validation suite before publishing. That reduced suite excludes Playwright and keeps the rest of the required checks.

## Goals

- Make `CI` the authoritative validation gate for pull requests and `main`
- Block the changeset release flow when any required check fails
- Publish Docker images only for formal releases/tags
- Add an explicit typecheck step rather than relying on build output alone
- Validate the Dockerfile in CI without pushing an image
- Cover manual `v*` tag pushes with a reduced pre-publish validation path

## Non-Goals

- Reworking the release strategy beyond gating and publish timing
- Introducing deployment environments or multi-stage release approvals
- Splitting Playwright into multiple suites in this change
- Replacing Changesets with another release system

## Current State

The repository currently has three workflows:

- `ci.yml` runs only `bun run build`
- `release.yml` runs after successful `CI` on `main`, versions packages with Changesets, pushes the release commit, and creates a GitHub Release
- `docker-publish.yml` publishes on successful `CI` for `main` and also on direct `v*` tag pushes

This leaves three gaps:

1. The main CI gate is too narrow and does not cover lint, typecheck, unit tests, Playwright, or Docker build verification.
2. Docker publishing can happen after any successful `main` CI run, even if the push is not a formal release.
3. A manually pushed `v*` tag can publish without rerunning any validation.

## Proposed Workflow Architecture

### 1. `ci.yml` Becomes The Canonical Validation Workflow

`CI` runs on:

- `pull_request` targeting `main`
- `push` to `main`

It contains separate required jobs so failures are isolated and branch protection remains clear:

- `lint` runs `bun run lint`
- `typecheck` runs `bun run typecheck`
- `unit` runs `bun run test`
- `build` runs `bun run build`
- `e2e` runs `bun run test:e2e`
- `docker-verify` runs a non-push `docker build`

These jobs should run independently after dependency installation instead of chaining all commands in one job. That keeps diagnostics specific and allows GitHub required checks to be explicit.

### 2. `release.yml` Stays Downstream Of `CI`

`Release` continues to use `workflow_run` on `CI`, limited to successful `main` push events.

Its responsibility stays narrow:

- verify upstream `CI` succeeded
- perform `changeset version`
- commit and push the release bump if there are changes
- create the GitHub Release for the computed version

If `CI` fails, `release.yml` does nothing. This directly satisfies the requirement that the changeset flow must not proceed after any failed required step.

### 3. `docker-publish.yml` Publishes Only For Formal Releases/Tags

Docker publish should no longer run after ordinary successful pushes to `main`.

Instead it runs from formal release/tag triggers:

- `release.published` for the normal gated Changesets release path
- `push.tags` matching `v*` for manual tag pushes

The workflow has two distinct paths:

- **Release-backed publish path:** when triggered by `release.published`, publish the Docker image without rerunning Playwright or the full CI suite. That path is already protected because `release.yml` only runs after successful `CI`.
- **Manual tag publish path:** when triggered by `push.tags`, run a reduced validation suite first, then publish only if those jobs pass.

To avoid duplicate publishes when a release creation also creates a tag, the tag-triggered path must detect whether the tag already has an associated GitHub Release. If a release exists, the workflow skips the manual-tag validation/publish path and leaves publishing to the `release.published` trigger.

## Validation Suites

### Full CI Suite

Used for:

- pull requests to `main`
- pushes to `main`

Required checks:

- Biome lint
- TypeScript typecheck
- Unit tests
- App build
- Playwright end-to-end tests
- Docker build verification

### Reduced Tag Suite

Used only for direct manual `v*` tag pushes that do not already correspond to a GitHub Release.

Required checks:

- Biome lint
- TypeScript typecheck
- Unit tests
- App build
- Docker build verification

Explicitly excluded:

- Playwright end-to-end tests

This matches the requested tradeoff: manual tag publishes still receive strong protection, but skip the slowest and potentially flakiest suite.

## Script Changes

Add a dedicated `typecheck` script to `package.json`:

- `typecheck`: `tsc --noEmit`

The workflows should prefer project scripts for app-level checks:

- `bun run lint`
- `bun run typecheck`
- `bun run test`
- `bun run build`
- `bun run test:e2e`

Docker verification remains a workflow-level command because it is CI-specific behavior rather than a normal local development script.

## Why Both `bun run build` And Docker Verify

Both checks should exist.

`bun run build` is the fastest and clearest application-level validation. It catches bundling and compile errors with direct feedback that is easy to diagnose.

`docker build` validates the supported deployment path described in the repository README. It covers Dockerfile regressions and native dependency issues that a normal app build can miss.

These checks overlap partially, but not enough to replace one another.

## Job Boundaries

### CI Jobs

Each validation concern should be its own job:

- clear failure reporting in GitHub
- easier required-check configuration
- parallel execution where possible
- easier future tuning if one job becomes unstable or too slow

Shared setup per job:

- checkout repository
- install Bun
- install dependencies with `bun install --frozen-lockfile`

The Docker verify job also needs Docker Buildx setup if the chosen build command depends on it, though a plain `docker build` may be sufficient for initial implementation.

### Docker Publish Workflow Jobs

The publish workflow should model the gate explicitly:

1. detect event context
2. optionally skip manual-tag path if a release already exists for the tag
3. run reduced validation jobs for manual tags
4. run publish job only after the applicable gate succeeds

The publish job must `needs` its upstream validation or eligibility jobs so the release/publish relationship is expressed structurally in YAML instead of only through shell conditionals.

## Event Flow

### Pull Request

1. Developer opens or updates a PR targeting `main`
2. `CI` runs full validation suite
3. PR is mergeable only if required jobs succeed

### Normal Release Path

1. A change with a Changeset lands on `main`
2. `CI` runs full validation suite
3. If `CI` succeeds, `release.yml` runs
4. `release.yml` versions packages, pushes the release commit, and creates a GitHub Release
5. `docker-publish.yml` runs from the `release.published` event
6. Docker image publishes

### Manual Tag Path

1. A `v*` tag is pushed manually
2. `docker-publish.yml` detects there is no associated GitHub Release for that tag
3. Reduced tag validation suite runs
4. If those checks pass, Docker image publishes

## Error Handling And Edge Cases

### No Changeset Release Needed

If `release.yml` finds no version changes to commit, it should continue to skip release creation exactly as it does today. In that case there is no formal release and no Docker publish.

### Duplicate Trigger Risk

Creating a GitHub Release can also create or reference the corresponding tag. Without an explicit guard, this can cause both `release.published` and `push.tags` paths to attempt publishing.

The manual-tag path must explicitly skip itself when the tag already has a GitHub Release.

### Playwright Flakiness

Playwright remains part of the required PR and `main` gate. If it fails, release automation stops. That is intentional. Manual tag pushes are the only path that skips Playwright.

### Docker Verify Failure

If Docker verify fails in `CI`, the release workflow never starts. If it fails in the manual-tag path, the publish job must not run.

## Testing Strategy

Implementation verification should cover:

- `package.json` exposes a working `typecheck` script
- `CI` contains distinct required jobs for lint, typecheck, unit, build, e2e, and Docker verify
- `release.yml` remains gated by successful `CI` on `main` pushes
- `docker-publish.yml` no longer publishes from plain `main` CI success
- `docker-publish.yml` publishes from `release.published`
- manual `v*` tag pushes run reduced validation before publishing
- tag-triggered publish path skips itself when a GitHub Release already exists for that tag

Local verification for the workflow change should include:

- YAML review for trigger and `needs` correctness
- script verification by running the new `typecheck` command locally
- if feasible, lightweight workflow linting or dry-run tooling; otherwise manual trigger-path review is acceptable

## Implementation Notes

- Keep workflow responsibilities narrow: `CI` validates, `Release` versions/releases, `Docker Publish` builds and pushes images.
- Avoid embedding large shell scripts in YAML when project scripts already exist.
- Prefer explicit job names that map directly to required checks in branch protection.
- Keep Playwright configuration unchanged for this design unless implementation reveals a CI-only need.

## Out Of Scope

- Retrying flaky Playwright tests beyond current config changes
- Matrix builds across multiple operating systems or Bun versions
- Release asset uploads beyond the existing GitHub Release behavior
- Publishing preview or branch-based Docker images
