# Biome Migration Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace oxlint + prettier with Biome for linting, formatting, and import sorting.

**Architecture:** Swap out three tools (oxlint, prettier, @standard-config/oxlint) for one (@biomejs/biome). Create a single `biome.json` config using Biome defaults with minimal overrides. Update all integration points: package.json scripts, lefthook pre-commit hooks, and Claude Code post-write hooks.

**Tech Stack:** Biome 2.x, Bun, Lefthook

**Spec:** `docs/superpowers/specs/2026-04-01-biome-migration-design.md`

---

### Task 1: Install Biome and Remove Old Dependencies

**Files:**

- Modify: `package.json`

- [ ] **Step 1: Remove oxlint, prettier, and @standard-config/oxlint**

```bash
bun remove oxlint prettier @standard-config/oxlint
```

Expected: Three packages removed from `devDependencies` in `package.json`.

- [ ] **Step 2: Install @biomejs/biome**

```bash
bun add -d @biomejs/biome
```

Expected: `@biomejs/biome` added to `devDependencies`.

- [ ] **Step 3: Verify installation**

```bash
bunx biome --version
```

Expected: Prints a version number (e.g., `2.x.x`).

---

### Task 2: Create biome.json

**Files:**

- Create: `biome.json`

- [ ] **Step 1: Create `biome.json` at the project root**

```json
{
  "$schema": "https://biomejs.dev/schemas/2.4.9/schema.json",
  "files": {
    "includes": ["src/**"],
    "ignore": ["src/routeTree.gen.ts"]
  },
  "vcs": {
    "enabled": true,
    "clientKind": "git",
    "useIgnoreFile": true
  },
  "formatter": {
    "enabled": true
  },
  "linter": {
    "enabled": true,
    "rules": {
      "recommended": true,
      "style": {
        "noRestrictedImports": {
          "level": "error",
          "options": {
            "paths": {
              "react": {
                "importNames": ["default"],
                "message": "Use named imports from 'react' instead."
              }
            }
          }
        }
      }
    }
  },
  "assist": {
    "enabled": true,
    "actions": {
      "source": {
        "organizeImports": "on"
      }
    }
  },
  "overrides": [
    {
      "includes": [
        "src/server/hardcover/import-queries.ts",
        "src/server/search.ts",
        "src/components/hardcover/book-preview-modal.tsx",
        "src/routes/_authed/movies/index.tsx",
        "src/routes/_authed/tv/index.tsx"
      ],
      "linter": {
        "rules": {
          "complexity": {
            "noExcessiveCognitiveComplexity": {
              "level": "error",
              "options": {
                "maxAllowedComplexity": 25
              }
            }
          }
        }
      }
    },
    {
      "includes": ["src/routes/api/**"],
      "linter": {
        "rules": {
          "suspicious": {
            "noConsole": "off"
          }
        }
      }
    }
  ]
}
```

- [ ] **Step 2: Verify the config is valid**

```bash
bunx biome check --max-diagnostics=0 .
```

Expected: Command runs without config parse errors. There will likely be lint/format diagnostics — that's fine, we just want to confirm the config loads.

---

### Task 3: Remove Old Config Files

**Files:**

- Delete: `oxlint.config.ts`
- Delete: `.prettierrc`
- Delete: `.prettierignore`

- [ ] **Step 1: Delete the three config files**

```bash
rm oxlint.config.ts .prettierrc .prettierignore
```

Expected: All three files removed.

---

### Task 4: Update package.json Scripts

**Files:**

- Modify: `package.json`

- [ ] **Step 1: Replace lint scripts**

In `package.json`, change:

```json
"lint": "bun x --bun oxlint . && prettier --check .",
"lint:fix": "bun x --bun oxlint --fix . && prettier --write .",
```

To:

```json
"lint": "biome check .",
"lint:fix": "biome check --write .",
```

- [ ] **Step 2: Verify lint script works**

```bash
bun run lint 2>&1 | head -20
```

Expected: Biome runs and outputs diagnostics (lint errors and formatting issues are expected at this stage).

---

### Task 5: Update Lefthook Pre-Commit Hook

**Files:**

- Modify: `lefthook.yml`

- [ ] **Step 1: Replace the pre-commit section**

Change the full `pre-commit` block from:

```yaml
pre-commit:
  parallel: true
  commands:
    lint:
      glob: "*.{js,jsx,ts,tsx}"
      staged: true
      run: bunx oxlint --fix --config oxlint.config.ts {staged_files}
      stage_fixed: true
    format:
      glob: "*.{js,jsx,ts,tsx,css,html,json,md,mdx,yaml,yml}"
      staged: true
      run: bunx prettier --write {staged_files}
      stage_fixed: true
```

To:

```yaml
pre-commit:
  commands:
    check:
      glob: "*.{js,jsx,ts,tsx,css,html,json}"
      staged: true
      run: bunx biome check --write {staged_files}
      stage_fixed: true
```

Keep the `commit-msg` section unchanged.

---

### Task 6: Update Claude Code Hook

**Files:**

- Modify: `.claude/settings.json`
- Delete: `.claude/hooks/lint-format.sh`

- [ ] **Step 1: Update `.claude/settings.json`**

Replace the full file contents with:

```json
{
  "hooks": {
    "PostToolUse": [
      {
        "matcher": "Edit|Write",
        "hooks": [
          {
            "type": "command",
            "command": "jq -r '.tool_input.file_path' | xargs -I {} bun biome check --write {} 2>/dev/null || true",
            "timeout": 30
          }
        ]
      }
    ]
  }
}
```

- [ ] **Step 2: Delete the old bash script**

```bash
rm .claude/hooks/lint-format.sh
```

- [ ] **Step 3: Remove the hooks directory if empty**

```bash
rmdir .claude/hooks 2>/dev/null || true
```

---

### Task 7: Fix Biome Lint Errors

**Files:**

- Modify: various source files (depends on what Biome finds)

- [ ] **Step 1: Run Biome with auto-fix to handle what it can**

```bash
bunx biome check --write .
```

This will auto-fix safe issues (formatting, import sorting, some lint autofixes).

- [ ] **Step 2: Check for remaining errors**

```bash
bun run lint 2>&1
```

Review the output. Any remaining errors need manual fixes — these are lint rules in Biome's recommended set that oxlint didn't enforce. Fix each one.

- [ ] **Step 3: Verify clean lint**

```bash
bun run lint
```

Expected: Exit code 0, no diagnostics.

- [ ] **Step 4: Commit tooling changes + lint fixes**

```bash
git add biome.json lefthook.yml package.json bun.lock .claude/settings.json
git add -u  # stages deletions of oxlint.config.ts, .prettierrc, .prettierignore, .claude/hooks/lint-format.sh
# Also stage any source files that needed manual lint fixes
git commit -m "feat: replace oxlint + prettier with biome"
```

---

### Task 8: Reformat Entire Codebase

**Files:**

- Modify: all source files (formatting changes only)

- [ ] **Step 1: Run Biome format on the full codebase**

```bash
bunx biome check --write .
```

This applies Biome's default formatting (tabs, double quotes, import sorting) across all files.

- [ ] **Step 2: Verify clean lint after reformat**

```bash
bun run lint
```

Expected: Exit code 0, no diagnostics.

- [ ] **Step 3: Commit the reformat separately**

```bash
git add -A
git commit -m "style: reformat codebase with biome defaults"
```

This commit is intentionally separate so the tooling change (Task 7 commit) is reviewable apart from the mass reformatting.
