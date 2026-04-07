# Release Please Migration Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the custom Changesets-based release flow with `release-please`, enforce Conventional Commit PR titles, and move Docker publishing into the release workflow while dropping manual tag handling.

**Architecture:** Keep the existing CI workflow as the main validation gate, add a dedicated PR-title workflow for squash-merge compatibility, and replace the current release-plus-docker orchestration with a single `release-please` workflow triggered by pushes to `main`. Release metadata, tag creation, GitHub releases, and Docker publishing should flow from `release-please` outputs instead of custom shell scripting or tag-push coordination.

**Tech Stack:** GitHub Actions, `googleapis/release-please-action`, `amannn/action-semantic-pull-request`, Docker Buildx, GHCR, Bun

---

## File Structure

- Modify: `/Users/pauldiloreto/Projects/allstarr/.github/workflows/ci.yml`
  Keep CI as the required validation workflow and, if needed, make only minimal changes needed to coexist with the new PR-title and release workflows.
- Create: `/Users/pauldiloreto/Projects/allstarr/.github/workflows/pr-title.yml`
  Dedicated pull request title validation workflow enforcing Conventional Commit syntax.
- Modify: `/Users/pauldiloreto/Projects/allstarr/.github/workflows/release.yml`
  Replace the custom `workflow_run`/script release flow with a `push`-to-`main` `release-please` workflow that publishes Docker only when a release is created.
- Delete: `/Users/pauldiloreto/Projects/allstarr/.github/workflows/docker-publish.yml`
  Remove the now-obsolete standalone Docker publish workflow and all manual-tag logic.
- Modify: `/Users/pauldiloreto/Projects/allstarr/package.json`
  Remove the Changesets CLI dependency and any no-longer-needed release scripts.
- Delete: `/Users/pauldiloreto/Projects/allstarr/.changeset/config.json`
  Remove Changesets configuration.
- Delete: `/Users/pauldiloreto/Projects/allstarr/.changeset/README.md`
  Remove Changesets docs.
- Delete: `/Users/pauldiloreto/Projects/allstarr/scripts/release-from-validated-commit.sh`
  Remove the custom release script.
- Create: `/Users/pauldiloreto/Projects/allstarr/release-please-config.json`
  Define single-package `release-please` behavior for the app.
- Create: `/Users/pauldiloreto/Projects/allstarr/.release-please-manifest.json`
  Track the current released version for the root package.

---

### Task 1: Add PR Title Validation

**Files:**
- Create: `/Users/pauldiloreto/Projects/allstarr/.github/workflows/pr-title.yml`

- [ ] **Step 1: Write the PR title workflow**

Create `.github/workflows/pr-title.yml` with this content:

```yaml
name: PR Title

on:
  pull_request_target:
    types:
      - opened
      - edited
      - synchronize
      - reopened

permissions:
  pull-requests: read

jobs:
  semantic-title:
    name: Conventional PR Title
    runs-on: ubuntu-latest
    steps:
      - name: Validate PR title
        uses: amannn/action-semantic-pull-request@v6
        env:
          GITHUB_TOKEN: ${{ secrets.GITHUB_TOKEN }}
        with:
          types: |
            feat
            fix
            chore
            docs
            refactor
            perf
            test
            build
            ci
            revert
```

- [ ] **Step 2: Validate the workflow YAML**

Run:

```bash
ruby -e "require 'yaml'; YAML.load_file('.github/workflows/pr-title.yml'); puts 'YAML OK'"
```

Expected: `YAML OK`

- [ ] **Step 3: Review the title policy against squash-merge behavior**

Confirm the workflow:

- checks PR titles, not commit messages
- runs on pull request events only
- accepts the Conventional Commit types the repo should allow for release signals and non-release maintenance work

No code change is needed in this step beyond reviewing the written YAML.

- [ ] **Step 4: Commit the PR title workflow**

```bash
git add .github/workflows/pr-title.yml
git commit -m "ci: enforce conventional PR titles"
```

---

### Task 2: Remove Changesets Configuration

**Files:**
- Modify: `/Users/pauldiloreto/Projects/allstarr/package.json`
- Delete: `/Users/pauldiloreto/Projects/allstarr/.changeset/config.json`
- Delete: `/Users/pauldiloreto/Projects/allstarr/.changeset/README.md`

- [ ] **Step 1: Remove the Changesets dependency**

Update `package.json` by deleting the `changeset` and `version` scripts and removing `@changesets/cli` from `devDependencies`.

The relevant sections should become:

```json
{
  "scripts": {
    "dev": "bun --bun vite dev",
    "build": "bun --bun vite build",
    "start": "bun .output/server/index.mjs",
    "lint": "biome check .",
    "lint:fix": "biome check --write .",
    "typecheck": "tsc --noEmit",
    "prepare": "lefthook install",
    "db:generate": "drizzle-kit generate",
    "db:migrate": "drizzle-kit migrate",
    "db:push": "drizzle-kit push",
    "db:studio": "drizzle-kit studio",
    "test": "vitest run",
    "test:watch": "vitest",
    "test:e2e:install": "bunx playwright install chromium",
    "test:e2e": "bun run test:e2e:install && bunx playwright test --config e2e/playwright.config.ts"
  },
  "devDependencies": {
    "@biomejs/biome": "^2.4.10",
    "@commitlint/cli": "^20.5.0",
    "@commitlint/config-conventional": "^20.5.0",
    "@commitlint/types": "^20.5.0",
    "@playwright/test": "^1.59.1",
    "@tailwindcss/vite": "^4.2.2",
    "@types/adm-zip": "^0.5.8",
    "@types/better-sqlite3": "^7.6.13",
    "@types/bun": "^1.3.11",
    "@types/react": "^19.2.14",
    "@types/react-dom": "^19.2.3",
    "@vitejs/plugin-react": "^6.0.1",
    "better-sqlite3": "^12.8.0",
    "drizzle-kit": "^0.31.10",
    "lefthook": "^2.1.5",
    "tailwindcss": "^4.2.2",
    "typescript": "^6.0.2",
    "vite": "^8.0.5",
    "vite-tsconfig-paths": "^6.1.1",
    "vitest": "^4.1.2"
  }
}
```

- [ ] **Step 2: Delete Changesets configuration files**

Delete these files:

```text
.changeset/config.json
.changeset/README.md
```

- [ ] **Step 3: Refresh the lockfile**

Run:

```bash
bun install --frozen-lockfile
```

If Bun reports that the lockfile needs to change, run:

```bash
bun install
```

Expected: `@changesets/cli` is removed from the lockfile and install succeeds.

- [ ] **Step 4: Verify Changesets is fully removed**

Run:

```bash
rg -n "changeset" package.json bun.lock .github scripts .changeset release-please-config.json .release-please-manifest.json
```

Expected: no remaining production workflow references to Changesets; deleted files may naturally be absent.

- [ ] **Step 5: Commit the Changesets removal**

```bash
git add package.json bun.lock .changeset
git commit -m "build: remove changesets release tooling"
```

---

### Task 3: Add Release Please Configuration

**Files:**
- Create: `/Users/pauldiloreto/Projects/allstarr/release-please-config.json`
- Create: `/Users/pauldiloreto/Projects/allstarr/.release-please-manifest.json`

- [ ] **Step 1: Write the release-please config**

Create `release-please-config.json` with this content:

```json
{
  "$schema": "https://raw.githubusercontent.com/googleapis/release-please/main/schemas/config.json",
  "packages": {
    ".": {
      "release-type": "node",
      "package-name": "allstarr",
      "include-v-in-tag": true,
      "changelog-path": "CHANGELOG.md"
    }
  }
}
```

- [ ] **Step 2: Seed the release manifest**

Create `.release-please-manifest.json` with this content, matching the current version in `package.json`:

```json
{
  ".": "0.1.0"
}
```

- [ ] **Step 3: Validate both JSON files**

Run:

```bash
ruby -e "require 'json'; JSON.parse(File.read('release-please-config.json')); JSON.parse(File.read('.release-please-manifest.json')); puts 'JSON OK'"
```

Expected: `JSON OK`

- [ ] **Step 4: Check config compatibility with current package version**

Run:

```bash
node -p "require('./package.json').version"
cat .release-please-manifest.json
```

Expected: both report `0.1.0` for the root package.

- [ ] **Step 5: Commit the release-please config**

```bash
git add release-please-config.json .release-please-manifest.json
git commit -m "ci: configure release-please"
```

---

### Task 4: Replace the Release Workflow

**Files:**
- Modify: `/Users/pauldiloreto/Projects/allstarr/.github/workflows/release.yml`
- Delete: `/Users/pauldiloreto/Projects/allstarr/scripts/release-from-validated-commit.sh`

- [ ] **Step 1: Replace the workflow trigger and structure**

Rewrite `.github/workflows/release.yml` to trigger on pushes to `main`:

```yaml
name: Release

on:
  push:
    branches:
      - main
```

Keep workflow-level concurrency:

```yaml
concurrency:
  group: ${{ github.workflow }}-${{ github.ref }}
  cancel-in-progress: false
```

- [ ] **Step 2: Add the release-please job**

Replace the current custom release job with:

```yaml
jobs:
  release-please:
    name: Release Please
    runs-on: ubuntu-latest
    permissions:
      contents: write
      pull-requests: write
    outputs:
      release_created: ${{ steps.release.outputs.release_created }}
      tag_name: ${{ steps.release.outputs.tag_name }}
      version: ${{ steps.release.outputs.version }}
      major: ${{ steps.semver.outputs.major }}
      minor: ${{ steps.semver.outputs.minor }}
    steps:
      - name: Run release-please
        id: release
        uses: googleapis/release-please-action@v4
        with:
          config-file: release-please-config.json
          manifest-file: .release-please-manifest.json

      - name: Derive semver tags
        id: semver
        if: ${{ steps.release.outputs.release_created == 'true' }}
        env:
          VERSION: ${{ steps.release.outputs.version }}
        run: |
          set -euo pipefail
          echo "major=$(echo "$VERSION" | cut -d. -f1)" >> "$GITHUB_OUTPUT"
          echo "minor=$(echo "$VERSION" | cut -d. -f1-2)" >> "$GITHUB_OUTPUT"
```

- [ ] **Step 3: Delete the custom release script**

Delete:

```text
scripts/release-from-validated-commit.sh
```

- [ ] **Step 4: Validate the release workflow YAML**

Run:

```bash
ruby -e "require 'yaml'; YAML.load_file('.github/workflows/release.yml'); puts 'YAML OK'"
```

Expected: `YAML OK`

- [ ] **Step 5: Commit the release workflow replacement**

```bash
git add .github/workflows/release.yml scripts/release-from-validated-commit.sh
git commit -m "ci: replace custom release flow with release-please"
```

---

### Task 5: Move Docker Publish Into the Release Workflow

**Files:**
- Modify: `/Users/pauldiloreto/Projects/allstarr/.github/workflows/release.yml`
- Delete: `/Users/pauldiloreto/Projects/allstarr/.github/workflows/docker-publish.yml`

- [ ] **Step 1: Add the Docker publish job to release.yml**

Append this job after `release-please`:

```yaml
  docker-publish:
    name: Publish Docker Image
    runs-on: ubuntu-latest
    needs: release-please
    if: ${{ needs.release-please.outputs.release_created == 'true' }}
    permissions:
      contents: read
      packages: write
    env:
      REGISTRY: ghcr.io
    steps:
      - name: Checkout repository
        uses: actions/checkout@v6
        with:
          ref: refs/tags/${{ needs.release-please.outputs.tag_name }}

      - name: Set up Docker Buildx
        uses: docker/setup-buildx-action@v3

      - name: Log in to Container Registry
        uses: docker/login-action@v3
        with:
          registry: ${{ env.REGISTRY }}
          username: ${{ github.actor }}
          password: ${{ secrets.GITHUB_TOKEN }}

      - name: Resolve image labels
        id: image-labels
        run: |
          set -euo pipefail

          revision="$(git rev-parse HEAD)"

          {
            echo "labels<<EOF"
            echo "org.opencontainers.image.source=https://github.com/${{ github.repository }}"
            echo "org.opencontainers.image.revision=$revision"
            echo "org.opencontainers.image.version=${{ needs.release-please.outputs.version }}"
            echo "org.opencontainers.image.ref.name=${{ needs.release-please.outputs.tag_name }}"
            echo "EOF"
          } >> "$GITHUB_OUTPUT"

      - name: Build and push image
        uses: docker/build-push-action@v6
        with:
          context: .
          file: Dockerfile
          push: true
          tags: |
            ${{ env.REGISTRY }}/${{ github.repository }}:${{ needs.release-please.outputs.version }}
            ${{ env.REGISTRY }}/${{ github.repository }}:${{ needs.release-please.outputs.minor }}
            ${{ env.REGISTRY }}/${{ github.repository }}:${{ needs.release-please.outputs.major }}
            ${{ env.REGISTRY }}/${{ github.repository }}:latest
          labels: ${{ steps.image-labels.outputs.labels }}
          cache-from: type=gha
          cache-to: type=gha,mode=max
```

- [ ] **Step 2: Delete the standalone Docker workflow**

Delete:

```text
.github/workflows/docker-publish.yml
```

- [ ] **Step 3: Validate release-only publish behavior**

Review the resulting `release.yml` and confirm:

- Docker publish depends on `release_created == 'true'`
- it checks out the created tag, not `main`
- it always publishes exact version plus floating tags for formal releases
- there is no manual-tag fallback logic anywhere

- [ ] **Step 4: Validate the updated release workflow YAML**

Run:

```bash
ruby -e "require 'yaml'; YAML.load_file('.github/workflows/release.yml'); puts 'YAML OK'"
```

Expected: `YAML OK`

- [ ] **Step 5: Commit the Docker publish migration**

```bash
git add .github/workflows/release.yml .github/workflows/docker-publish.yml
git commit -m "ci: publish docker from release workflow"
```

---

### Task 6: Clean Up CI Integration

**Files:**
- Modify: `/Users/pauldiloreto/Projects/allstarr/.github/workflows/ci.yml`

- [ ] **Step 1: Review CI for stale release assumptions**

Inspect `.github/workflows/ci.yml` and confirm it contains only validation jobs:

- `lint`
- `typecheck`
- `unit`
- `build`
- `e2e`
- `docker-verify`

and no release/publish triggers or outputs.

- [ ] **Step 2: Make only minimal CI edits if needed**

If any stale release-oriented comments, conditions, or names remain, remove them. Otherwise leave `ci.yml` unchanged.

Any final `ci.yml` content should still follow this shape:

```yaml
name: CI

on:
  push:
    branches:
      - main
  pull_request:
    branches:
      - main
```

- [ ] **Step 3: Validate CI workflow YAML**

Run:

```bash
ruby -e "require 'yaml'; YAML.load_file('.github/workflows/ci.yml'); puts 'YAML OK'"
```

Expected: `YAML OK`

- [ ] **Step 4: Commit any CI cleanup if needed**

If `ci.yml` changed:

```bash
git add .github/workflows/ci.yml
git commit -m "ci: keep validation workflow release-neutral"
```

If it did not change, mark the task complete without a commit.

---

### Task 7: Final Verification Pass

**Files:**
- Review: `/Users/pauldiloreto/Projects/allstarr/.github/workflows/ci.yml`
- Review: `/Users/pauldiloreto/Projects/allstarr/.github/workflows/pr-title.yml`
- Review: `/Users/pauldiloreto/Projects/allstarr/.github/workflows/release.yml`
- Review: `/Users/pauldiloreto/Projects/allstarr/package.json`
- Review: `/Users/pauldiloreto/Projects/allstarr/release-please-config.json`
- Review: `/Users/pauldiloreto/Projects/allstarr/.release-please-manifest.json`

- [ ] **Step 1: Run local app-level verification**

Run:

```bash
bun run lint
bun run typecheck
bun run test
bun run build
```

Expected:

- Biome reports no issues
- `tsc --noEmit` exits successfully
- Vitest passes all tests
- production build succeeds

- [ ] **Step 2: Run Playwright and Docker verify**

Run:

```bash
bun run test:e2e
docker build -t allstarr-ci:verify .
```

Expected:

- Playwright suite exits successfully
- Docker image builds successfully without push

- [ ] **Step 3: Validate all workflow YAML files**

Run:

```bash
ruby -e "require 'yaml'; %w[.github/workflows/ci.yml .github/workflows/pr-title.yml .github/workflows/release.yml].each { |path| YAML.load_file(path) }; puts 'YAML OK'"
```

Expected: `YAML OK`

- [ ] **Step 4: Inspect final git state**

Run:

```bash
git status --short
git diff --check
```

Expected:

- only intended changes are present before the final commit
- no whitespace or patch formatting errors

- [ ] **Step 5: Commit the final integrated migration state**

```bash
git add .github/workflows package.json bun.lock release-please-config.json .release-please-manifest.json .changeset scripts/release-from-validated-commit.sh
git commit -m "ci: migrate releases to release-please"
```
