# Code Quality Audit Design

## Purpose

This project will perform a deep, workflow-led code quality audit of Allstarr. The audit will identify production-code and test-code improvements that would make the codebase easier to maintain, safer to change, and more consistent with the app's established architecture.

The audit will not implement fixes. It will produce a prioritized set of findings and recommend the first follow-up implementation target.

## Non-Goals

- Do not refactor code during the audit.
- Do not change generated files, including `src/routeTree.gen.ts`.
- Do not lower lint, typecheck, or coverage expectations.
- Do not turn the audit into a broad product redesign.
- Do not require a full Servarr parity review; Servarr consistency is useful context, but code quality is the priority.

## Scope

The audit covers both frontend and backend code. Tests are first-class audit targets.

Representative workflows:

1. Dashboard and library browsing.
2. Imports and unmapped files.
3. Indexers, search, and download flow.
4. Settings and configuration.
5. Auth, setup, and role-gated navigation.

For each workflow, the audit will inspect production code, tests, and local conventions together. It will call out large files, unclear ownership boundaries, duplicated logic, brittle test setup, weak abstractions, missing coverage around risky behavior, and inconsistencies with existing project patterns.

## Audit Method

Each workflow will be traced through the same layers:

1. Route entry points: TanStack route files, loaders, redirects, search params, and role checks.
2. UI composition: page components, shared components, form state, loading and error states, and layout consistency.
3. Client data access: React Query definitions, mutation hooks, invalidation, optimistic behavior, and cache ownership.
4. Server boundary: server functions, API routes, service modules, validation, auth checks, and error normalization.
5. Persistence and integration: Drizzle queries, schema usage, external API boundaries, download-client and indexer boundaries, and filesystem behavior where relevant.
6. Tests: unit, browser-mode, and e2e coverage, including whether tests assert behavior or mostly assert implementation scaffolding.

The audit should prefer evidence from local code over assumptions. Static metrics such as file size, repeated patterns, and test distribution can guide investigation, but findings must be grounded in specific workflows and files.

## Architectural Questions

The audit should answer these questions for each workflow:

- Does each route have a clear responsibility, or does it own business logic that belongs in a component, query helper, or server module?
- Can major UI components be understood and tested without reading unrelated workflow internals?
- Are query and mutation helpers reusable, predictable, and explicit about cache invalidation?
- Are server modules focused around coherent operations, or do they mix orchestration, parsing, persistence, and external integration in ways that make changes risky?
- Are validation, authorization, error handling, and async job boundaries consistent?
- Do tests verify user-visible behavior and domain behavior, or are they tightly coupled to incidental implementation details?

## Finding Taxonomy

Findings should be grouped into these categories:

- Boundary issue: responsibilities are mixed across routes, components, server modules, or persistence logic.
- Duplication issue: similar behavior appears in multiple places without a clear shared abstraction.
- Test quality issue: tests are missing, brittle, too slow, too coupled, or duplicating complex setup.
- Error-handling issue: validation, authorization, loading, empty, or failure states are unclear or inconsistent.
- Workflow consistency issue: similar user or server workflows are implemented with inconsistent patterns.
- Maintainability issue: large files, unclear names, complex conditionals, or weak data contracts make future work harder.
- Risk issue: code shape increases the chance of data loss, auth mistakes, bad imports, bad downloads, or hard-to-debug async failures.

## Scoring Model

Each finding will be scored on four dimensions:

1. User impact: whether the issue affects correctness, workflow reliability, or visible behavior.
2. Maintenance cost: whether it slows future changes, creates duplication, or makes code hard to reason about.
3. Risk: whether it could cause data loss, auth mistakes, bad imports, bad downloads, or hard-to-debug failures.
4. Implementation size: whether it can be improved in a focused follow-up without a broad rewrite.

The final ranking should favor issues with high user impact, high maintenance cost, or high risk that can be addressed with a clear, testable implementation plan.

## Testing And Evidence

The audit will use tests as evidence. For each workflow, it should note:

- Whether current tests cover important behavior.
- Whether tests are too coupled to implementation details.
- Whether fixture and setup code is reusable or duplicated.
- Whether browser-mode or e2e coverage exists where DOM behavior or full workflow behavior matters.
- Whether there are gaps around error states, permissions, validation, async jobs, external-service failures, and filesystem failures.

Verification commands should be run where practical:

- `bun run lint`
- `bun run typecheck`
- Targeted tests for workflows that appear suspicious

Full merged coverage can be deferred to the implementation plan unless the audit identifies a broad test infrastructure issue that requires coverage data.

## Expected Audit Output

The audit output should be a concise report with:

1. Executive summary.
2. Workflow-by-workflow findings.
3. Ranked shortlist of recommended improvements.
4. "Fix now" candidates separated from "track later" items.
5. Evidence with file references and relevant verification results.
6. Recommended first implementation target, including why it is the best starting point.
7. Known risks and open questions.

The report should avoid a giant unsorted list. It should produce enough detail to write a focused implementation plan for the first target.

## Transition Criteria

The audit is ready to transition into implementation planning when:

- At least one high-value finding has a clear scope, owner modules, and testable outcome.
- The finding can be implemented without unrelated broad refactors.
- The expected behavior after the fix is explicit.
- The necessary tests can be described before implementation starts.
- Any required external documentation lookup has an identified source, with Context7 preferred when available.
