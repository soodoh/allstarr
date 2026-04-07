# Release Please Migration Design

## Goal

Replace the custom Changesets-based release flow with a `release-please` workflow that:

- keeps the existing CI gate for pull requests and `main`
- enforces Conventional Commit syntax on pull request titles so squash merges produce releasable commit messages
- opens or updates a release PR from merged commits on `main`
- creates the GitHub release, tag, and Docker image publish from the release workflow itself
- removes manual `v*` tag support and the custom release script

## Current Problems

The current release pipeline works, but the complexity is concentrated in release orchestration rather than validation:

- a `workflow_run` release workflow has to start from a previously validated SHA, then create and push a new release commit
- a separate Docker publish workflow has to coordinate `release` and `push.tags` events, including dedupe logic
- the repo still carries Changesets configuration even though the output is a Docker app release rather than an npm package publish

This complexity mostly exists to preserve a custom release path. The goal of this migration is to adopt a more standard GitHub release flow.

## Chosen Approach

Use `release-please` as the release engine and make pull request titles the release signal.

Merged pull requests already land on `main` as squash commits with the PR title as the commit message. By validating PR titles with Conventional Commit syntax, the resulting commits on `main` become valid release inputs for `release-please`.

`release-please` then:

- reads the merged commit history on `main`
- opens or updates a release PR with version/changelog changes
- creates the release commit, tag, and GitHub release when that release PR is merged

Docker publishing will happen in the same workflow only when `release-please` actually creates a release.

## Workflow Design

### 1. CI workflow remains the main gate

`/Users/pauldiloreto/Projects/allstarr/.github/workflows/ci.yml` remains the required validation workflow for:

- pull requests to `main`
- pushes to `main`

It continues to run:

- Biome lint
- TypeScript typecheck
- unit tests
- production build
- Playwright end-to-end tests
- Docker verify build

No release or publish logic stays in this workflow.

### 2. Add a PR title validation workflow

Create a dedicated workflow, expected at `.github/workflows/pr-title.yml`, that runs on pull request events and validates the PR title with `amannn/action-semantic-pull-request`.

Accepted pull request title examples:

- `fix: handle missing ffprobe binary`
- `feat: add author monitoring filters`
- `feat!: remove legacy import API`

This workflow becomes a required status check so invalid PR titles cannot be merged.

Because the repository already uses squash merges with PR title as the final commit message, validating the PR title is sufficient to make the resulting commit history on `main` compatible with `release-please`.

### 3. Replace custom release workflow with release-please

Replace the existing `.github/workflows/release.yml` with a workflow triggered by pushes to `main`.

That workflow should:

- check out the repository
- run `googleapis/release-please-action`
- use the default `GITHUB_TOKEN`
- create or update the release PR on normal `main` pushes
- expose release outputs such as whether a release was created and the created tag/version

The workflow should not run from `workflow_run`, and it should not call any custom shell script for versioning or release creation.

### 4. Publish Docker from the release workflow

Delete the dedicated `.github/workflows/docker-publish.yml` workflow.

Instead, after the `release-please` step in `.github/workflows/release.yml`, add a Docker publish job or post-release steps that only run when a release was created.

This publish path should:

- use the tag/version outputs from `release-please`
- build and push the release image to `ghcr.io/${{ github.repository }}`
- publish the immutable version tag and floating tags (`major.minor`, `major`, `latest`)
- keep OCI labels on the published image

Because Docker publish happens only from the release workflow, no cross-workflow dedupe logic is needed.

### 5. Remove unsupported manual tag path

Manual `v*` tag pushes are no longer a supported release mechanism.

In-repo changes:

- remove any workflow trigger based on `push.tags: v*`
- remove all manual-tag validation and publish logic

Operationally, manual tags are treated as unsupported by process. The repository owner may later tighten this further with a tag ruleset on `v*`, but that configuration is out of scope for repo code changes in this migration.

## Repository Changes

### Remove Changesets

Delete:

- `.changeset/`
- any Changesets-specific release automation

Remove `@changesets/cli` from `devDependencies` in `/Users/pauldiloreto/Projects/allstarr/package.json`.

No checked-in changeset files will be used after this migration.

### Add release-please config

Add repository-level `release-please` configuration for this single app package.

Expected files:

- `release-please-config.json`
- `.release-please-manifest.json`

The config should support:

- a single root package
- version bumps in `package.json`
- changelog generation suitable for an application repo

### Remove custom release script

Delete `/Users/pauldiloreto/Projects/allstarr/scripts/release-from-validated-commit.sh`.

After the migration, no shell script should be responsible for:

- versioning
- pushing a release commit
- creating the GitHub release

That responsibility moves entirely to `release-please`.

## Behavioral Changes

This migration changes release behavior in a few important ways:

### Release intent moves from files to merged commit history

Today, release intent comes from a checked-in Changesets file.

After the migration, release intent comes from the squash commit message on `main`, which is derived from the PR title.

### Releases happen through a release PR

Merging a normal feature PR into `main` does not immediately create a tag or GitHub release.

Instead:

1. `release-please` updates or opens a release PR
2. the release PR is reviewed and merged
3. the merge of that release PR creates the tag, GitHub release, and Docker publish

### Manual tags are unsupported

The repo no longer tries to make manual `v*` tags safe or validated. They are outside the supported release process.

## Error Handling

### Invalid PR titles

If a PR title does not match Conventional Commit syntax, the PR-title workflow fails and blocks merge.

### Non-release pushes to main

Most pushes to `main` will only cause `release-please` to update or create the release PR. Docker publish should be skipped unless a release is actually created in that workflow run.

### Release workflow failures

If `release-please` fails to create or update the release PR, the workflow should fail visibly without attempting Docker publish.

If the Docker publish steps fail after a release has been created, the workflow should fail clearly so the release artifact problem can be investigated. This is acceptable because the release/tag creation is the responsibility of `release-please`, while Docker publish is a follow-on artifact step.

## Testing Strategy

Implementation should verify:

- PR title validation works for valid and invalid Conventional Commit titles
- CI still runs unchanged on pull requests and `main`
- `release-please` workflow YAML is syntactically valid
- release workflow conditions only publish Docker when a release is created
- Docker publish still includes version and floating tags plus OCI labels

Local verification after implementation should include at minimum:

- `bun run lint`
- `bun run typecheck`
- `bun run test`
- `bun run build`
- `bun run test:e2e`
- `docker build -t allstarr-ci:verify .`

## Out of Scope

This migration does not include:

- repository settings changes outside the repo, other than documenting expectations
- custom support for manual tag pushes
- direct-from-main automatic releases without a release PR
- multi-package or monorepo release behavior
