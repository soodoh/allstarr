# CI And Release Gating Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a gated CI and release pipeline so pull requests and `main` pushes run the full validation suite, Changesets releases only happen after successful CI, and Docker images publish only for formal releases or manually pushed tags that pass reduced validation.

**Architecture:** Keep responsibilities split across three workflows. `CI` becomes the single validation gate with separate jobs for lint, typecheck, unit tests, build, Playwright, and Docker verification. `Release` remains downstream of successful `CI`, while `Docker Publish` publishes from `release.published` or a guarded manual-tag path with reduced checks.

**Tech Stack:** GitHub Actions, Bun, Biome, TypeScript, Vitest, Playwright, Docker Buildx, Changesets, GitHub CLI

---

## File Structure

| File | Action | Responsibility |
|------|--------|----------------|
| `package.json` | Modify | Add a dedicated `typecheck` script for CI |
| `.github/workflows/ci.yml` | Modify | Expand CI into separate validation jobs |
| `.github/workflows/release.yml` | Modify | Keep release gated on successful CI and pin release work to the validated commit |
| `.github/workflows/docker-publish.yml` | Modify | Publish only for formal releases/tags and gate manual tags behind reduced validation |

---

### Task 1: Add A Dedicated Typecheck Script

**Files:**
- Modify: `package.json`

- [ ] **Step 1: Read the existing scripts block**

Read `package.json` and confirm the current script layout around `lint`, `test`, `build`, and `test:e2e`.

- [ ] **Step 2: Add the `typecheck` script**

Update the `scripts` section in `package.json` to add a dedicated TypeScript check:

```json
"build": "bun --bun vite build",
"start": "bun .output/server/index.mjs",
"lint": "biome check .",
"lint:fix": "biome check --write .",
"typecheck": "tsc --noEmit",
"prepare": "lefthook install",
```

- [ ] **Step 3: Run the new script locally**

Run: `bun run typecheck`
Expected: TypeScript exits successfully with no emitted files and no type errors.

- [ ] **Step 4: Commit the script change**

```bash
git add package.json
git commit -m "chore: add ci typecheck script"
```

---

### Task 2: Expand `CI` Into The Full Validation Gate

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

### Task 3: Pin `Release` To The Validated Commit

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

### Task 4: Gate Docker Publishing Behind Releases And Manual Tag Validation

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

### Task 5: Final Verification Pass

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
