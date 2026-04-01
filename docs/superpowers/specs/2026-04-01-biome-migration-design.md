# Replace Oxlint + Prettier with Biome

## Summary

Migrate from oxlint (linting) + prettier (formatting) to Biome — a single tool that handles linting, formatting, and import sorting. Use Biome's opinionated defaults (tabs, double quotes, semicolons, 80 width) with minimal overrides for project-specific rules.

## Motivation

- **One tool instead of two** — simpler toolchain, fewer dependencies, single config file
- **Faster** — Biome is Rust-based and runs linting + formatting in a single pass
- **Simpler config** — Biome defaults are opinionated enough that the config is minimal

## Biome Configuration (`biome.json`)

Use all Biome defaults with these additions:

### Formatter

No overrides — pure Biome defaults:

- Indent style: tabs
- Quote style: double quotes
- Semicolons: always
- Line width: 80

### Linter

Base: `recommended: true` (Biome's default recommended ruleset).

**Custom rules (global):**

- `style/noRestrictedImports`: error — block `import React from 'react'`, require named imports from `react`

**File overrides:**

- Complex data-mapping/list files: raise `noExcessiveCognitiveComplexity` max to 25
  - `src/server/hardcover/import-queries.ts`
  - `src/server/search.ts`
  - `src/components/hardcover/book-preview-modal.tsx`
  - `src/routes/_authed/movies/index.tsx`
  - `src/routes/_authed/tv/index.tsx`
- API route files (`src/routes/api/**`): disable `noConsole`

### Organize Imports

Enabled globally.

### Ignored Files

- `node_modules`
- `.output`
- `src/routeTree.gen.ts`

### Dropped Rules (no Biome equivalent or not needed)

- `import/prefer-default-export` — dropped entirely (was already disabled for most files)
- `unicorn/filename-case` — Biome's `useFilenamingConvention` supports `$` prefixed filenames (TanStack Start) by default; rule is not in recommended set so it's off
- `typescript/no-restricted-types` — was already `off` in oxlint

## Files to Remove

- `oxlint.config.ts` — replaced by `biome.json`
- `.prettierrc` — replaced by `biome.json`
- `.prettierignore` — replaced by `biome.json` `files.ignore`

## Dependencies

**Remove:**

- `oxlint`
- `@standard-config/oxlint`
- `prettier`

**Add:**

- `@biomejs/biome`

## Package.json Scripts

**Before:**

```json
"lint": "bun x --bun oxlint . && prettier --check .",
"lint:fix": "bun x --bun oxlint --fix . && prettier --write ."
```

**After:**

```json
"lint": "biome check .",
"lint:fix": "biome check --write ."
```

`biome check` runs linting + formatting + import sorting in one command.

## Lefthook Update (`lefthook.yml`)

**Before** (two parallel commands):

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

**After** (single command):

```yaml
pre-commit:
  commands:
    check:
      glob: "*.{js,jsx,ts,tsx,css,html,json}"
      staged: true
      run: bunx biome check --write {staged_files}
      stage_fixed: true
```

## Claude Code Hook Update

**Before** (`.claude/hooks/lint-format.sh` bash script running oxlint + prettier):

```bash
npx oxlint --fix "$FILE_PATH" 2>/dev/null
npx prettier --write "$FILE_PATH" 2>/dev/null
```

**After** (inline in `.claude/settings.json`, remove the bash script):

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

The bash script (`.claude/hooks/lint-format.sh`) is deleted.

## Codebase Reformat

After all config changes are in place, run `biome check --write .` to reformat the entire codebase (tabs, import sorting, any new lint autofixes). This goes in a **separate commit** to keep the tooling change reviewable apart from the mass reformatting.

Any lint errors that Biome's recommended rules catch (that oxlint didn't) will need manual fixes. These are addressed as part of the implementation, not specced individually here — the exact errors depend on what Biome finds.

## Known Limitations

- **Markdown/YAML formatting lost** — Biome does not format `.md`, `.mdx`, `.yaml`, or `.yml` files. Prettier previously formatted these via lefthook. This is acceptable — these files are infrequently edited and formatting consistency matters less for them.

## Out of Scope

- **Commitlint** — stays as-is (Biome has no commit message validation)
- **TypeScript type-checking** — stays as a manual/CI step, not added to hooks
- **VS Code settings** — no `.vscode` dir exists; developers configure their own editors
