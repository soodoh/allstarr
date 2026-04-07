# CI And Release Gating Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a gated CI and release pipeline so pull requests and `main` pushes run the full validation suite, including a real standalone TypeScript check, Changesets releases only happen after successful CI, and Docker images publish only for formal releases or manually pushed tags that pass reduced validation.

**Architecture:** First make the repository pass a strict standalone `tsc --noEmit` run by fixing the current root-cause clusters: Bun/TypeScript environment typing, stale query/type exports, route/admin context type drift, and indexer release-shape mismatches. Then wire the validated `typecheck` script into the expanded `CI` workflow. `Release` remains downstream of successful `CI`, while `Docker Publish` publishes from `release.published` or a guarded manual-tag path with reduced checks.

**Tech Stack:** GitHub Actions, Bun, Biome, TypeScript, Vitest, Playwright, Docker Buildx, Changesets, GitHub CLI

---

## File Structure

| File | Action | Responsibility |
|------|--------|----------------|
| `package.json` | Modify | Add a dedicated `typecheck` script for CI |
| `tsconfig.json` | Modify | Make standalone TypeScript understand Bun globals/modules and repo compiler expectations |
| `src/db/index.ts` | Modify | Fix Bun SQLite typing and generic proxy typing used by standalone TypeScript |
| `src/lib/auth-server.ts` | Modify | Align auth/database typing with standalone TypeScript expectations |
| `src/server/system-info.ts` | Modify | Fix Bun global typing and DB client typing in system info |
| `src/server/setup.ts` | Modify | Fix Bun SQLite typing usage in setup path |
| `src/server/scheduler/tasks/backup.ts` | Modify | Fix DB client typing under standalone TypeScript |
| `src/server/scheduler/tasks/housekeeping.ts` | Modify | Fix DB client typing under standalone TypeScript |
| `src/lib/queries/index.ts` | Modify | Export query result types used by dashboard and system status UI |
| `src/components/dashboard/content-type-card.tsx` | Modify | Consume correct exported query types |
| `src/routes/_authed/system/status.tsx` | Modify | Consume correct exported query types |
| `src/components/bookshelf/hardcover/book-preview-modal.tsx` | Modify | Align book import payload shape with current server types |
| `src/components/shared/edit-series-profiles-dialog.tsx` | Modify | Align nullable icon typing with profile dialog props |
| `src/routes/_authed/authors/$authorId.tsx` | Modify | Resolve `DownloadProfileInfo` drift with current shared type |
| `src/routes/_authed/series/index.tsx` | Modify | Resolve route API/type mismatch in series page |
| `src/routes/_authed/settings/index.tsx` | Modify | Align admin route guard typing with current session model |
| `src/routes/_authed/settings/general.tsx` | Modify | Align admin route guard typing with current session model |
| `src/routes/_authed/settings/formats.tsx` | Modify | Align admin route guard typing with current session model |
| `src/routes/_authed/settings/download-clients.tsx` | Modify | Align admin route guard typing with current session model |
| `src/routes/_authed/settings/import-lists.tsx` | Modify | Align admin route guard typing with current session model |
| `src/routes/_authed/settings/indexers.tsx` | Modify | Align admin route guard typing with current session model |
| `src/routes/_authed/settings/media-management.tsx` | Modify | Align admin route guard typing with current session model |
| `src/routes/_authed/settings/metadata.tsx` | Modify | Align admin route guard typing with current session model |
| `src/routes/_authed/settings/profiles.tsx` | Modify | Align admin route guard typing with current session model |
| `src/routes/_authed/settings/custom-formats.tsx` | Modify | Align admin route guard typing with current session model |
| `src/routes/_authed/settings/users.tsx` | Modify | Align admin route guard typing with current session model |
| `src/lib/admin-route.ts` | Modify | Provide the shared admin-route typing boundary for settings routes |
| `src/routes/login.tsx` | Modify | Add explicit typing where implicit any breaks standalone TypeScript |
| `src/server/auto-search.ts` | Modify | Fix indexer release object construction to satisfy shared type |
| `src/server/indexers.ts` | Modify | Fix indexer release object construction to satisfy shared type |
| `src/server/indexers/http.ts` | Modify | Import or declare missing search-result type used by HTTP client |
| `src/lib/admin-route.ts` | Modify | Provide the shared admin-route typing boundary for settings routes |
| `src/lib/auth-server.ts` | Modify | Align Better Auth role registration with repo-managed roles |
| `src/server/users.ts` | Modify | Align role typing with Better Auth role constraints |
| `src/server/users.test.ts` | Create | Cover non-admin user creation role handling |
| `src/server/download-manager.test.ts` | Modify | Align test expectations with current inferred types |
| `.github/workflows/ci.yml` | Modify | Expand CI into separate validation jobs |
| `.github/workflows/release.yml` | Modify | Keep release gated on successful CI and pin release work to the validated commit |
| `.github/workflows/docker-publish.yml` | Modify | Publish only for formal releases/tags and gate manual tags behind reduced validation |

---

### Task 1: Establish A Real Standalone Typecheck Entry Point

**Files:**
- Modify: `package.json`
- Modify: `tsconfig.json`

- [ ] **Step 1: Read the existing scripts block**

Read `package.json` and confirm the current script layout around `lint`, `test`, `build`, and `test:e2e`.

- [ ] **Step 2: Update TypeScript config for standalone checking**

Update `tsconfig.json` so standalone TypeScript has the environment types it needs:

```json
{
  "compilerOptions": {
    "target": "ES2023",
    "module": "ESNext",
    "moduleResolution": "bundler",
    "esModuleInterop": true,
    "strict": true,
    "skipLibCheck": true,
    "forceConsistentCasingInFileNames": true,
    "resolveJsonModule": true,
    "isolatedModules": true,
    "jsx": "react-jsx",
    "baseUrl": ".",
    "types": ["bun", "node"],
    "paths": {
      "src/*": ["./src/*"]
    }
  },
  "include": ["src", "e2e", "vite.config.ts", "vitest.config.ts"]
}
```

If TypeScript 6 still emits only the `baseUrl` deprecation diagnostic, add the minimal compiler flag needed to keep the standalone run usable, but do not suppress real type errors.

- [ ] **Step 3: Add the `typecheck` script**

Update the `scripts` section in `package.json` to add a dedicated TypeScript check:

```json
"build": "bun --bun vite build",
"start": "bun .output/server/index.mjs",
"lint": "biome check .",
"lint:fix": "biome check --write .",
"typecheck": "tsc --noEmit",
"prepare": "lefthook install",
```

- [ ] **Step 4: Run the new script locally**

Run: `bun run typecheck`
Expected: the command runs under standalone TypeScript and reports the current repo type errors instead of failing immediately on missing Bun/environment typing.

- [ ] **Step 5: Commit the script/config change**

```bash
git add package.json tsconfig.json
git commit -m "chore: add standalone typecheck entrypoint"
```

---

### Task 2: Fix Bun Runtime Typing For Standalone TypeScript

**Files:**
- Modify: `src/db/index.ts`
- Modify: `src/lib/auth-server.ts`
- Modify: `src/server/system-info.ts`
- Modify: `src/server/setup.ts`
- Modify: `src/server/scheduler/tasks/backup.ts`
- Modify: `src/server/scheduler/tasks/housekeeping.ts`

- [ ] **Step 1: Reproduce the Bun/runtime typing cluster**

Run:

```bash
bun run typecheck
```

Expected initial failures include `bun:sqlite` and `db.$client` errors in the files listed above.

- [ ] **Step 2: Fix the root typing boundary in the DB/auth layer**

Adjust the shared DB typing so standalone TypeScript understands the Bun-backed database client and the proxy fallback. This work should eliminate the `bun:sqlite` module errors and the `Property '$client' does not exist on type 'AppDatabase'` errors without weakening the database types to `any`.

- [ ] **Step 3: Fix Bun global usage in server utilities**

Update the affected server files so references to `bun:sqlite` and Bun-backed DB clients typecheck cleanly under the standalone compiler.

- [ ] **Step 4: Re-run the typecheck command**

Run:

```bash
bun run typecheck
```

Expected: the Bun/runtime typing errors disappear. Remaining failures should be limited to application-level typing clusters.

- [ ] **Step 5: Commit the Bun/runtime typing fixes**

```bash
git add src/db/index.ts src/lib/auth-server.ts src/server/system-info.ts src/server/setup.ts src/server/scheduler/tasks/backup.ts src/server/scheduler/tasks/housekeeping.ts
git commit -m "fix: align bun runtime types with standalone typecheck"
```

---

### Task 3: Fix Stale Query Exports And UI Type Drift

**Files:**
- Modify: `src/lib/queries/index.ts`
- Modify: `src/components/dashboard/content-type-card.tsx`
- Modify: `src/routes/_authed/system/status.tsx`
- Modify: `src/components/bookshelf/hardcover/book-preview-modal.tsx`
- Modify: `src/hooks/mutations/import.ts`
- Modify: `src/components/shared/edit-series-profiles-dialog.tsx`
- Modify: `src/routes/_authed/authors/$authorId.tsx`
- Modify: `src/routes/_authed/series/index.tsx`
- Modify: `src/routes/login.tsx`
- Modify: `src/server/download-manager.test.ts`
- Modify: `e2e/fixtures/fake-servers/base.ts`
- Modify: `e2e/global-setup.ts`
- Modify: `e2e/tests/04-search-grab.spec.ts`
- Modify: `e2e/tests/07-download-lifecycle.spec.ts`
- Modify: `e2e/tests/08-disk-scan.spec.ts`

- [ ] **Step 1: Reproduce the UI/shared-type cluster**

Run:

```bash
bun run typecheck
```

Expected failures include missing exported query types, stale payload property names, nullable profile icon mismatches, route API signature drift, the implicit `any` in `src/routes/login.tsx`, and newly surfaced `e2e` type drift around generic fake-server state, narrowed port literals, possibly undefined array access, and profile `items` seed data shapes.

- [ ] **Step 2: Fix shared type exports instead of patching consumers ad hoc**

Update `src/lib/queries/index.ts` to export the query result types currently consumed by dashboard and system-status UI. Then align the two consumers to use the shared exported types rather than local copies.

- [ ] **Step 3: Fix remaining UI/type-drift mismatches**

Resolve the book preview import payload shape, the nullable icon mismatch, the duplicated `DownloadProfileInfo` drift, the series page call-site mismatch, the login implicit `any`, the test typing issue in `src/server/download-manager.test.ts`, and the `e2e` type drift in the fake-server base helper, global setup port handling, nullable array access, and seeded profile `items` shapes.

- [ ] **Step 4: Re-run the typecheck command**

Run:

```bash
bun run typecheck
```

Expected: the UI/shared-type cluster is gone. Remaining failures should be concentrated in route/admin typing and indexer/server typing.

- [ ] **Step 5: Commit the shared-type fixes**

```bash
git add src/lib/queries/index.ts src/components/dashboard/content-type-card.tsx src/routes/_authed/system/status.tsx src/components/bookshelf/hardcover/book-preview-modal.tsx src/hooks/mutations/import.ts src/components/shared/edit-series-profiles-dialog.tsx src/routes/_authed/authors/\$authorId.tsx src/routes/_authed/series/index.tsx src/routes/login.tsx src/server/download-manager.test.ts e2e/fixtures/fake-servers/base.ts e2e/global-setup.ts e2e/tests/04-search-grab.spec.ts e2e/tests/07-download-lifecycle.spec.ts e2e/tests/08-disk-scan.spec.ts
git commit -m "fix: resolve standalone ui type drift"
```

---

### Task 4: Fix Route/Admin And Indexer Type Clusters

**Files:**
- Modify: `src/routes/_authed/settings/index.tsx`
- Modify: `src/routes/_authed/settings/general.tsx`
- Modify: `src/routes/_authed/settings/formats.tsx`
- Modify: `src/routes/_authed/settings/download-clients.tsx`
- Modify: `src/routes/_authed/settings/import-lists.tsx`
- Modify: `src/routes/_authed/settings/indexers.tsx`
- Modify: `src/routes/_authed/settings/media-management.tsx`
- Modify: `src/routes/_authed/settings/metadata.tsx`
- Modify: `src/routes/_authed/settings/profiles.tsx`
- Modify: `src/routes/_authed/settings/custom-formats.tsx`
- Modify: `src/routes/_authed/settings/users.tsx`
- Modify: `src/lib/admin-route.ts`
- Modify: `src/lib/auth-server.ts`
- Modify: `src/server/auto-search.ts`
- Modify: `src/server/indexers.ts`
- Modify: `src/server/indexers/http.ts`
- Modify: `src/server/users.ts`
- Create: `src/server/users.test.ts`

- [ ] **Step 1: Reproduce the remaining route/admin and indexer failures**

Run:

```bash
bun run typecheck
```

Expected remaining failures include `AdminBeforeLoadArgs` incompatibilities across the settings routes, indexer release shape mismatches in `auto-search` and `indexers`, the missing `ProwlarrSearchResult` symbol in `src/server/indexers/http.ts`, and role typing issues in `src/server/users.ts`.

- [ ] **Step 2: Fix the route/admin type boundary once**

Identify the shared `AdminBeforeLoadArgs` and session-role types that settings routes depend on, then update the shared typing boundary or the route signatures so all settings routes typecheck through the same source of truth.

- [ ] **Step 3: Fix the indexer release construction at the source**

Fix the indexer release construction at the source. If the missing `ProwlarrSearchResult` type import in `src/server/indexers/http.ts` is the actual root cause, fix it there; otherwise update `src/server/auto-search.ts` and `src/server/indexers.ts` so constructed release objects satisfy the current `IndexerRelease` contract instead of relying on partial objects.

- [ ] **Step 4: Fix the remaining user-role typing mismatch**

Update the Better Auth integration and `src/server/users.ts` so the role values passed into create-user APIs match the actual allowed role types used in this repository, and add a focused regression test for non-admin user creation if the fix changes runtime behavior.

- [ ] **Step 5: Re-run the typecheck command**

Run:

```bash
bun run typecheck
```

Expected: `bun run typecheck` succeeds with no emitted files and no type errors.

- [ ] **Step 6: Commit the route/admin and indexer fixes**

```bash
git add src/routes/_authed/settings/index.tsx src/routes/_authed/settings/general.tsx src/routes/_authed/settings/formats.tsx src/routes/_authed/settings/download-clients.tsx src/routes/_authed/settings/import-lists.tsx src/routes/_authed/settings/indexers.tsx src/routes/_authed/settings/media-management.tsx src/routes/_authed/settings/metadata.tsx src/routes/_authed/settings/profiles.tsx src/routes/_authed/settings/custom-formats.tsx src/routes/_authed/settings/users.tsx src/lib/admin-route.ts src/lib/auth-server.ts src/server/auto-search.ts src/server/indexers.ts src/server/indexers/http.ts src/server/users.ts src/server/users.test.ts
git commit -m "fix: make standalone typecheck pass"
```

---

### Task 5: Expand `CI` Into The Full Validation Gate

**Files:**
- Modify: `.github/workflows/ci.yml`

- [ ] **Step 1: Replace the single build job with explicit validation jobs**

Update `.github/workflows/ci.yml` so the workflow still runs on PRs to `main` and pushes to `main`, but uses these jobs:

```yaml
jobs:
  lint:
    name: Lint
    runs-on: ubuntu-latest
    steps:
      - name: Checkout repository
        uses: actions/checkout@v6
      - name: Setup Bun
        uses: oven-sh/setup-bun@v2
      - name: Install dependencies
        run: bun install --frozen-lockfile
      - name: Run Biome
        run: bun run lint

  typecheck:
    name: Typecheck
    runs-on: ubuntu-latest
    steps:
      - name: Checkout repository
        uses: actions/checkout@v6
      - name: Setup Bun
        uses: oven-sh/setup-bun@v2
      - name: Install dependencies
        run: bun install --frozen-lockfile
      - name: Run TypeScript typecheck
        run: bun run typecheck

  unit:
    name: Unit Tests
    runs-on: ubuntu-latest
    steps:
      - name: Checkout repository
        uses: actions/checkout@v6
      - name: Setup Bun
        uses: oven-sh/setup-bun@v2
      - name: Install dependencies
        run: bun install --frozen-lockfile
      - name: Run unit tests
        run: bun run test

  build:
    name: Build
    runs-on: ubuntu-latest
    steps:
      - name: Checkout repository
        uses: actions/checkout@v6
      - name: Setup Bun
        uses: oven-sh/setup-bun@v2
      - name: Install dependencies
        run: bun install --frozen-lockfile
      - name: Build app
        run: bun run build

  e2e:
    name: Playwright
    runs-on: ubuntu-latest
    steps:
      - name: Checkout repository
        uses: actions/checkout@v6
      - name: Setup Bun
        uses: oven-sh/setup-bun@v2
      - name: Install dependencies
        run: bun install --frozen-lockfile
      - name: Run Playwright tests
        run: bun run test:e2e

  docker-verify:
    name: Docker Verify
    runs-on: ubuntu-latest
    steps:
      - name: Checkout repository
        uses: actions/checkout@v6
      - name: Set up Docker Buildx
        uses: docker/setup-buildx-action@v3
      - name: Build Docker image without pushing
        uses: docker/build-push-action@v6
        with:
          context: .
          file: Dockerfile
          push: false
          load: false
          tags: allstarr-ci:verify
          cache-from: type=gha
          cache-to: type=gha,mode=max
```

- [ ] **Step 2: Keep workflow-level concurrency unchanged**

Preserve the existing workflow-level concurrency block:

```yaml
concurrency:
  group: ${{ github.workflow }}-${{ github.ref }}
  cancel-in-progress: true
```

- [ ] **Step 3: Run the app-level checks locally**

Run these commands in sequence:

```bash
bun run lint
bun run typecheck
bun run test
bun run build
```

Expected: all four commands succeed locally before relying on the workflow update.

- [ ] **Step 4: Run the Docker verification command locally**

Run: `docker build -t allstarr-ci:verify .`
Expected: Docker finishes successfully without pushing an image.

- [ ] **Step 5: Commit the CI workflow changes**

```bash
git add .github/workflows/ci.yml
git commit -m "ci: expand validation workflow"
```

---

### Task 6: Pin `Release` To The Validated Commit

**Files:**
- Modify: `.github/workflows/release.yml`

- [ ] **Step 1: Check out the exact commit that passed CI**

Update the checkout and branch preparation steps in `.github/workflows/release.yml` so release work starts from the validated SHA instead of the moving branch tip:

```yaml
      - name: Checkout validated commit
        uses: actions/checkout@v6
        with:
          ref: ${{ github.event.workflow_run.head_sha }}
          fetch-depth: 0

      - name: Attach branch to validated commit
        run: git checkout -B main
```

- [ ] **Step 2: Push the release commit back to `main` explicitly**

Replace the generic push command in the `Commit and push changes` step with an explicit branch target:

```bash
git push origin HEAD:main
```

This avoids relying on an implicit upstream branch after checking out the validated SHA.

- [ ] **Step 3: Create the GitHub Release from the release commit**

Update the release creation step so the tag is created from the actual release commit that was just pushed:

```yaml
      - name: Create GitHub Release
        if: steps.commit.outputs.changed == 'true'
        run: |
          VERSION=$(node -p "require('./package.json').version")
          RELEASE_SHA=$(git rev-parse HEAD)
          gh release create "v${VERSION}" --generate-notes --target "$RELEASE_SHA"
        env:
          GITHUB_TOKEN: ${{ secrets.GITHUB_TOKEN }}
```

- [ ] **Step 4: Review the release gate condition**

Keep the existing `if` guard on the release job:

```yaml
if: ${{ github.event.workflow_run.conclusion == 'success' && github.event.workflow_run.event == 'push' }}
```

Expected: PR-triggered CI runs never invoke the release workflow, and failed `main` CI runs do not version or release anything.

- [ ] **Step 5: Commit the release workflow changes**

```bash
git add .github/workflows/release.yml
git commit -m "ci: pin release workflow to validated commit"
```

---

### Task 7: Gate Docker Publishing Behind Releases And Manual Tag Validation

**Files:**
- Modify: `.github/workflows/docker-publish.yml`

- [ ] **Step 1: Replace the trigger block**

Update the workflow triggers so Docker publishing happens from formal releases or tag pushes only:

```yaml
on:
  release:
    types:
      - published
  push:
    tags:
      - "v*"
```

Remove the existing `workflow_run` trigger entirely.

- [ ] **Step 2: Add a context job that decides which publish mode applies**

Create a first job named `context` that emits:

- `tag`
- `version`
- `major`
- `minor`
- `publish_mode`

Use this shell logic:

```yaml
  context:
    name: Resolve Publish Context
    runs-on: ubuntu-latest
    permissions:
      contents: read
    outputs:
      tag: ${{ steps.resolve.outputs.tag }}
      version: ${{ steps.resolve.outputs.version }}
      major: ${{ steps.resolve.outputs.major }}
      minor: ${{ steps.resolve.outputs.minor }}
      publish_mode: ${{ steps.resolve.outputs.publish_mode }}
    steps:
      - name: Resolve publish context
        id: resolve
        env:
          GITHUB_TOKEN: ${{ secrets.GITHUB_TOKEN }}
        run: |
          if [[ "${GITHUB_EVENT_NAME}" == "release" ]]; then
            TAG="${{ github.event.release.tag_name }}"
            VERSION="${TAG#v}"
            echo "publish_mode=release" >> "$GITHUB_OUTPUT"
          else
            TAG="${GITHUB_REF_NAME}"
            VERSION="${TAG#v}"
            if gh release view "$TAG" >/dev/null 2>&1; then
              echo "publish_mode=skip" >> "$GITHUB_OUTPUT"
            else
              echo "publish_mode=manual-tag" >> "$GITHUB_OUTPUT"
            fi
          fi
          echo "tag=$TAG" >> "$GITHUB_OUTPUT"
          echo "version=$VERSION" >> "$GITHUB_OUTPUT"
          echo "major=$(echo "$VERSION" | cut -d. -f1)" >> "$GITHUB_OUTPUT"
          echo "minor=$(echo "$VERSION" | cut -d. -f1-2)" >> "$GITHUB_OUTPUT"
```

- [ ] **Step 3: Add reduced validation jobs for manual tags**

Add these jobs, each gated with:

```yaml
if: needs.context.outputs.publish_mode == 'manual-tag'
needs: context
```

Use the same job structure as `CI`, but omit Playwright:

```yaml
  lint:
    name: Lint
    needs: context
    if: needs.context.outputs.publish_mode == 'manual-tag'
    runs-on: ubuntu-latest
    steps:
      - name: Checkout repository
        uses: actions/checkout@v6
        with:
          ref: refs/tags/${{ needs.context.outputs.tag }}
      - name: Setup Bun
        uses: oven-sh/setup-bun@v2
      - name: Install dependencies
        run: bun install --frozen-lockfile
      - name: Run Biome
        run: bun run lint
```

Repeat the same pattern for:

- `typecheck` running `bun run typecheck`
- `unit` running `bun run test`
- `build` running `bun run build`
- `docker-verify` using `docker/setup-buildx-action@v3` and `docker/build-push-action@v6` with `push: false`

- [ ] **Step 4: Update the publish job to depend on the gate**

Replace the current single `build` job with a `publish` job that depends on:

```yaml
needs:
  - context
  - lint
  - typecheck
  - unit
  - build
  - docker-verify
```

Use this job condition:

```yaml
if: |
  needs.context.outputs.publish_mode == 'release' ||
  (
    needs.context.outputs.publish_mode == 'manual-tag' &&
    needs.lint.result == 'success' &&
    needs.typecheck.result == 'success' &&
    needs.unit.result == 'success' &&
    needs.build.result == 'success' &&
    needs.docker-verify.result == 'success'
  )
```

- [ ] **Step 5: Publish from the resolved tag with explicit semver tags**

In the `publish` job, check out the resolved tag and use the context outputs for Docker metadata:

```yaml
  publish:
    name: Publish Docker Image
    runs-on: ubuntu-latest
    permissions:
      contents: read
      packages: write
    needs:
      - context
      - lint
      - typecheck
      - unit
      - build
      - docker-verify
    if: |
      needs.context.outputs.publish_mode == 'release' ||
      (
        needs.context.outputs.publish_mode == 'manual-tag' &&
        needs.lint.result == 'success' &&
        needs.typecheck.result == 'success' &&
        needs.unit.result == 'success' &&
        needs.build.result == 'success' &&
        needs.docker-verify.result == 'success'
      )
    steps:
      - name: Checkout tag
        uses: actions/checkout@v6
        with:
          ref: refs/tags/${{ needs.context.outputs.tag }}

      - name: Set up Docker Buildx
        uses: docker/setup-buildx-action@v3

      - name: Log in to Container Registry
        uses: docker/login-action@v3
        with:
          registry: ${{ env.REGISTRY }}
          username: ${{ github.actor }}
          password: ${{ secrets.GITHUB_TOKEN }}

      - name: Extract metadata
        id: meta
        uses: docker/metadata-action@v5
        with:
          images: ${{ env.REGISTRY }}/${{ github.repository }}
          tags: |
            type=raw,value=${{ needs.context.outputs.version }}
            type=raw,value=${{ needs.context.outputs.minor }}
            type=raw,value=${{ needs.context.outputs.major }}
            type=raw,value=latest

      - name: Build and push image
        uses: docker/build-push-action@v6
        with:
          context: .
          file: Dockerfile
          push: true
          tags: ${{ steps.meta.outputs.tags }}
          labels: ${{ steps.meta.outputs.labels }}
          cache-from: type=gha
          cache-to: type=gha,mode=max
```

- [ ] **Step 6: Review the trigger paths before committing**

Confirm the YAML now expresses these behaviors:

- `release.published` publishes immediately without rerunning Playwright
- direct manual `v*` tag pushes run lint, typecheck, unit, build, and Docker verify before publish
- a tag that already has a GitHub Release sets `publish_mode=skip`, so the tag push path does not duplicate the release-backed publish
- no plain `main` push can publish Docker images anymore

- [ ] **Step 7: Commit the Docker publish workflow changes**

```bash
git add .github/workflows/docker-publish.yml
git commit -m "ci: gate docker publish behind releases"
```

---

### Task 8: Final Verification Pass

**Files:**
- Review: `.github/workflows/ci.yml`
- Review: `.github/workflows/release.yml`
- Review: `.github/workflows/docker-publish.yml`
- Review: `package.json`

- [ ] **Step 1: Run the local app-level verification commands again**

Run:

```bash
bun run lint
bun run typecheck
bun run test
bun run build
```

Expected: all commands succeed after the workflow and script changes.

- [ ] **Step 2: Re-run the Docker verification build**

Run: `docker build -t allstarr-ci:verify .`
Expected: Docker build succeeds after the workflow changes.

- [ ] **Step 3: Review the final workflow diffs**

Run:

```bash
git diff -- .github/workflows/ci.yml .github/workflows/release.yml .github/workflows/docker-publish.yml package.json
```

Expected:

- `ci.yml` defines six required validation jobs
- `release.yml` still depends on successful `CI` `workflow_run`
- `docker-publish.yml` no longer depends on `CI` `workflow_run`
- `docker-publish.yml` uses `release.published` and guarded `push.tags`
- `package.json` contains the `typecheck` script

- [ ] **Step 4: Confirm the worktree is clean**

```bash
git status --short
```

Expected: no output. If there is output, review the remaining diff before handing the branch off for implementation review.
