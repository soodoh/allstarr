# Ignore Comment Cleanup Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Remove repo-authored ESLint and TypeScript ignore comments, and update repo guidance so it consistently references Biome instead of ESLint.

**Architecture:** Treat this as a targeted cleanup. Remove suppressions from authored files by replacing them with equivalent typed code or by deleting unnecessary comments, update the repo instructions in `AGENTS.md`, and leave generated suppressions alone when they are emitted by external tooling.

**Tech Stack:** TypeScript, Vite, Playwright, Biome

---

### Task 1: Inventory Repo-Owned Suppressions

**Files:**
- Inspect: `vite.config.ts`
- Inspect: `e2e/tests/01-auth.spec.ts`
- Inspect: `src/routeTree.gen.ts`
- Modify: `AGENTS.md`

- [ ] **Step 1: Find authored suppression comments**

Run: the repository-wide suppression search command for lint/TypeScript ignore comments
Expected: authored suppressions in `vite.config.ts` and `e2e/tests/01-auth.spec.ts`, plus generated suppressions in `src/routeTree.gen.ts`

- [ ] **Step 2: Confirm whether generated suppressions are tool-owned**

Run: `sed -n '30,45p' node_modules/@tanstack/router-generator/src/config.ts`
Expected: TanStack Router’s generator default header includes lint/typecheck suppression lines

### Task 2: Remove Repo-Owned Suppressions

**Files:**
- Modify: `vite.config.ts`
- Modify: `e2e/tests/01-auth.spec.ts`

- [ ] **Step 1: Replace the Vite config suppressions with typed code**

Remove the authored suppression comments by replacing the CommonJS require with a typed import pattern and by using a concrete non-`any` source-map type.

- [ ] **Step 2: Remove the E2E ESLint suppression**

Delete the file-level suppression comment if the spec remains valid without it.

### Task 3: Update Repo Guidance

**Files:**
- Modify: `AGENTS.md`

- [ ] **Step 1: Clarify the linting source of truth**

Update the coding-style guidance so it explicitly states that Biome is the linter/formatter in use and that new suppression comments are not allowed.

### Task 4: Verify

**Files:**
- Modify: any authored file still needing cleanup after Tasks 2-3

- [ ] **Step 1: Re-run the suppression search**

Run: the same repository-wide suppression search command from Task 1
Expected: only generated/tool-owned occurrences remain

- [ ] **Step 2: Re-run static verification**

Run: `bun run lint && bun run typecheck`
Expected: both commands exit 0
