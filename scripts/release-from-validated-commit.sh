#!/usr/bin/env bash

set -euo pipefail

bun run changeset version

if [[ -z "$(git status --porcelain)" ]]; then
  echo "No changes to commit"
  exit 0
fi

git add .
git commit -m "chore: release"
git push origin HEAD:main

VERSION=$(node -p "require('./package.json').version")
RELEASE_SHA=$(git rev-parse HEAD)

gh release create "v${VERSION}" --generate-notes --target "$RELEASE_SHA"
